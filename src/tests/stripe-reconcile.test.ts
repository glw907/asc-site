import { describe, expect, it, vi } from 'vitest';
import { claimStripeSession, parseSessionMetadata, reconcileCheckoutSession, type StripeCheckoutSession } from '$admin-club/lib/stripe-reconcile';
import { fakeD1 } from './_fake-d1';

const SESSION: StripeCheckoutSession = { id: 'cs_test_123', amount_total: 25000, metadata: { kind: 'dues', refId: 'mem-1' } };

/** `sendClubEmail`'s own template read (`getEmailTemplate`): every test below that expects a
 *  real send needs this fixture, or `sendClubEmail` resolves "no such template" and never calls
 *  `EMAIL.send` at all. */
const RECEIPT_TEMPLATE_ROW = {
  id: 'stripe_payment_receipt',
  subject: 'Your payment receipt -- {{item_display_name}}',
  reply_to: 'finance-committee@aksailingclub.org',
  body: 'Hi {{person_name}}, this confirms {{amount}} for {{item_display_name}}.',
  updated_at: '2026-07-07 00:00:00',
  updated_by: 'authored:payments',
};

describe('parseSessionMetadata', () => {
  it('accepts a valid dues/class-fee/asset-fee metadata pair', () => {
    for (const kind of ['dues', 'class-fee', 'asset-fee'] as const) {
      expect(parseSessionMetadata({ ...SESSION, metadata: { kind, refId: 'row-1' } })).toEqual({ kind, refId: 'row-1' });
    }
  });

  it('rejects missing metadata', () => {
    expect(parseSessionMetadata({ ...SESSION, metadata: null })).toBeNull();
    expect(parseSessionMetadata({ ...SESSION, metadata: undefined })).toBeNull();
  });

  it('rejects an unrecognized kind', () => {
    expect(parseSessionMetadata({ ...SESSION, metadata: { kind: 'donation', refId: 'row-1' } })).toBeNull();
  });

  it('rejects a missing or empty refId', () => {
    expect(parseSessionMetadata({ ...SESSION, metadata: { kind: 'dues', refId: '' } })).toBeNull();
    expect(parseSessionMetadata({ ...SESSION, metadata: { kind: 'dues', refId: '   ' } })).toBeNull();
    expect(parseSessionMetadata({ ...SESSION, metadata: { kind: 'dues' } as unknown as Record<string, string> })).toBeNull();
  });
});

describe('claimStripeSession', () => {
  it('returns true on a first claim (changes: 1)', async () => {
    const { db, calls } = fakeD1();
    const claimed = await claimStripeSession(db, 'cs_1', 'dues', 'mem-1');
    expect(claimed).toBe(true);
    expect(calls[0]?.sql).toContain('INSERT OR IGNORE INTO processed_stripe_sessions');
    expect(calls[0]?.args).toEqual(['cs_1', 'dues', 'mem-1']);
  });

  it('returns false when the session id was already claimed (changes: 0)', async () => {
    const { db } = fakeD1({ runResults: { 'INSERT OR IGNORE INTO processed_stripe_sessions': { changes: 0 } } });
    expect(await claimStripeSession(db, 'cs_1', 'dues', 'mem-1')).toBe(false);
  });
});

describe('reconcileCheckoutSession: dues', () => {
  const MEMBERSHIP_ROW = { id: 'mem-1', household_id: 'hh-1', tier: 'family' as const, season: 2026, paid_at: null };
  const HOUSEHOLD_ROW = { primary_member_id: 'member-1' };
  const CONTACT_ROW = { name: 'Jamie Rivera', email: 'jamie@example.com' };

  it('marks the membership paid, audits, and emails the primary member', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM memberships WHERE id': MEMBERSHIP_ROW,
        'FROM households WHERE id': HOUSEHOLD_ROW,
        'FROM members WHERE id': CONTACT_ROW,
        'FROM email_templates WHERE id': RECEIPT_TEMPLATE_ROW,
      },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'dues', 'mem-1', SESSION);
    expect(outcome).toEqual({ ok: true });

    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual([SESSION.id, 'mem-1']);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['system:stripe-webhook', 'payment.reconcile', 'membership', 'mem-1', expect.stringContaining('kind=dues')]);

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { to: string; subject: string };
    expect(message.to).toBe('jamie@example.com');
    expect(message.subject).toContain('Family Membership -- 2026 season');
  });

  it('refuses an unknown membership id without writing anything', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE id': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'dues', 'no-such-membership', SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such membership') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('is a clean no-op when the membership is already paid (idempotence)', async () => {
    const send = vi.fn();
    const { db, calls } = fakeD1({
      firstResults: { 'FROM memberships WHERE id': MEMBERSHIP_ROW },
      runResults: { 'UPDATE memberships SET paid_at': { changes: 0 } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'dues', 'mem-1', SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO audit_log'))).toBe(false);
  });

  it('reconciles without sending when the household has no primary member on file', async () => {
    const send = vi.fn();
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE id': MEMBERSHIP_ROW,
        'FROM households WHERE id': { primary_member_id: null },
      },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'dues', 'mem-1', SESSION);
    expect(outcome).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reconcileCheckoutSession: class-fee', () => {
  const ENROLLMENT_ROW = { class_id: 'fleet-tune-up-weekend', class_name: 'Fleet Tune-Up Weekend', member_name: 'Jamie Rivera', member_email: 'jamie@example.com' };

  it('marks the enrollment fee paid, audits, and emails the member', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_enrollments ce': ENROLLMENT_ROW, 'FROM email_templates WHERE id': RECEIPT_TEMPLATE_ROW },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'class-fee', 'enr-1', SESSION);
    expect(outcome).toEqual({ ok: true });

    const update = calls.find((c) => c.sql.startsWith('UPDATE class_enrollments'));
    expect(update?.args).toEqual([SESSION.id, 'enr-1']);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { subject: string };
    expect(message.subject).toContain('Fleet Tune-Up Weekend class fee');
  });

  it('refuses an unknown enrollment id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_enrollments ce': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'class-fee', 'no-such-enrollment', SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such class_enrollments row') });
  });

  it('is a clean no-op when the fee is already paid (idempotence)', async () => {
    const send = vi.fn();
    const { db } = fakeD1({
      firstResults: { 'FROM class_enrollments ce': ENROLLMENT_ROW },
      runResults: { 'UPDATE class_enrollments SET fee_paid': { changes: 0 } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'class-fee', 'enr-1', SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reconcileCheckoutSession: asset-fee', () => {
  const ASSIGNMENT_ROW = {
    asset_type_name: 'RV Storage',
    household_name: 'The Rivera Household',
    primary_member_name: 'Jamie Rivera',
    primary_member_email: 'jamie@example.com',
  };
  const SETTINGS_ROW = { value: '2026' };

  it('records the asset payment for the current season, audits, and emails the primary member', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM asset_assignments aa': ASSIGNMENT_ROW,
        current_season: SETTINGS_ROW,
        'FROM email_templates WHERE id': RECEIPT_TEMPLATE_ROW,
      },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'asset-fee', 'assign-1', SESSION);
    expect(outcome).toEqual({ ok: true });

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_payments'));
    expect(insert?.args).toEqual([expect.any(String), 'assign-1', 2026, 250, SESSION.id]);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { subject: string };
    expect(message.subject).toContain('RV Storage fee -- 2026 season');
  });

  it('refuses an unknown assignment id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments aa': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'asset-fee', 'no-such-assignment', SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such asset_assignments row') });
  });

  it('is a clean no-op when the season is already paid (idempotence)', async () => {
    const send = vi.fn();
    const { db } = fakeD1({
      firstResults: { 'FROM asset_assignments aa': ASSIGNMENT_ROW, current_season: SETTINGS_ROW },
      runResults: { 'INSERT INTO asset_payments': { changes: 0 } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'asset-fee', 'assign-1', SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
  });
});
