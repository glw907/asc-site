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
  it('accepts a valid dues/class-fee/asset-fee/donation/join metadata pair', () => {
    for (const kind of ['dues', 'class-fee', 'asset-fee', 'donation', 'join'] as const) {
      expect(parseSessionMetadata({ ...SESSION, metadata: { kind, refId: 'row-1' } })).toEqual({ kind, refId: 'row-1' });
    }
  });

  it('rejects missing metadata', () => {
    expect(parseSessionMetadata({ ...SESSION, metadata: null })).toBeNull();
    expect(parseSessionMetadata({ ...SESSION, metadata: undefined })).toBeNull();
  });

  it('rejects an unrecognized kind', () => {
    expect(parseSessionMetadata({ ...SESSION, metadata: { kind: 'bogus', refId: 'row-1' } })).toBeNull();
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

    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args).toEqual([
      expect.any(String), 'charge', 'stripe', expect.any(String), 25000, null, SESSION.id, null, 'hh-1', null, null, null, null,
    ]);
    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toEqual([expect.any(String), txnInsert?.args[0], 'dues', 'Family Membership -- 2026 season', 25000, 'mem-1', null, null]);

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

  it('refuses (before any write) when the session carries no amount_total', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE id': MEMBERSHIP_ROW } });
    const outcome = await reconcileCheckoutSession(db, {}, 'dues', 'mem-1', { ...SESSION, amount_total: null });
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('amount_total') });
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
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transactions'))).toBe(false);
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
  const ENROLLMENT_ROW = {
    class_id: 'fleet-tune-up-weekend',
    class_name: 'Fleet Tune-Up Weekend',
    member_name: 'Jamie Rivera',
    member_email: 'jamie@example.com',
    household_id: 'hh-2',
  };

  it('marks the enrollment fee paid, audits, emails the member, and writes the ledger', async () => {
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

    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args).toEqual([
      expect.any(String), 'charge', 'stripe', expect.any(String), 25000, null, SESSION.id, null, 'hh-2', null, null, null, null,
    ]);
    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toEqual([
      expect.any(String), txnInsert?.args[0], 'class-fee', 'Fleet Tune-Up Weekend class fee', 25000, null, 'enr-1', null,
    ]);
  });

  it('refuses an unknown enrollment id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_enrollments ce': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'class-fee', 'no-such-enrollment', SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such class_enrollments row') });
  });

  it('refuses (before any write) when the session carries no amount_total', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM class_enrollments ce': ENROLLMENT_ROW } });
    const outcome = await reconcileCheckoutSession(db, {}, 'class-fee', 'enr-1', { ...SESSION, amount_total: null });
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('amount_total') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('is a clean no-op when the fee is already paid (idempotence), writing no ledger row', async () => {
    const send = vi.fn();
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_enrollments ce': ENROLLMENT_ROW },
      runResults: { 'UPDATE class_enrollments SET fee_paid': { changes: 0 } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'class-fee', 'enr-1', SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transactions'))).toBe(false);
  });
});

describe('reconcileCheckoutSession: asset-fee', () => {
  const ASSIGNMENT_ROW = {
    asset_type_name: 'RV Storage',
    household_id: 'hh-3',
    household_name: 'The Rivera Household',
    primary_member_name: 'Jamie Rivera',
    primary_member_email: 'jamie@example.com',
  };
  const SETTINGS_ROW = { value: '2026' };

  it('records the asset payment for the current season, audits, emails the primary member, and writes the ledger', async () => {
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

    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args).toEqual([
      expect.any(String), 'charge', 'stripe', expect.any(String), 25000, null, SESSION.id, null, 'hh-3', null, null, null, null,
    ]);
    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toEqual([
      expect.any(String), txnInsert?.args[0], 'asset-fee', 'RV Storage fee -- 2026 season', 25000, null, null, 'assign-1',
    ]);
  });

  it('refuses an unknown assignment id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments aa': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'asset-fee', 'no-such-assignment', SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such asset_assignments row') });
  });

  it('refuses (before any write) when the session carries no amount_total', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_assignments aa': ASSIGNMENT_ROW } });
    const outcome = await reconcileCheckoutSession(db, {}, 'asset-fee', 'assign-1', { ...SESSION, amount_total: null });
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('amount_total') });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('is a clean no-op when the season is already paid (idempotence), writing no ledger row', async () => {
    const send = vi.fn();
    const { db, calls } = fakeD1({
      firstResults: { 'FROM asset_assignments aa': ASSIGNMENT_ROW, current_season: SETTINGS_ROW },
      runResults: { 'INSERT INTO asset_payments': { changes: 0 } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'asset-fee', 'assign-1', SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transactions'))).toBe(false);
  });
});

describe('reconcileCheckoutSession: donation', () => {
  const DONATION_SESSION: StripeCheckoutSession = {
    id: 'cs_test_donation_1',
    amount_total: 5000,
    metadata: { kind: 'donation', refId: 'txn-fixed-1' },
    customer_details: { name: 'Jamie Rivera', email: 'jamie@example.com' },
  };

  it('claims the session and writes the ledger atomically: one batch carrying the claim insert plus the transaction and its line', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM processed_stripe_sessions WHERE session_id': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'donation', 'txn-fixed-1', DONATION_SESSION);
    expect(outcome).toEqual({ ok: true });

    const claimInsert = calls.find((c) => c.sql.startsWith('INSERT INTO processed_stripe_sessions'));
    expect(claimInsert?.sql).not.toContain('OR IGNORE');
    expect(claimInsert?.args).toEqual(['cs_test_donation_1', 'donation', 'txn-fixed-1']);

    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args).toEqual([
      'txn-fixed-1', 'charge', 'stripe', expect.any(String), 5000, null, 'cs_test_donation_1', null, null, 'Jamie Rivera', 'jamie@example.com', null, null,
    ]);
    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toEqual([expect.any(String), 'txn-fixed-1', 'donation', expect.any(String), 5000, null, null, null]);

    // The claim insert precedes the ledger writes in call order -- they went into ONE db.batch().
    const claimIndex = calls.findIndex((c) => c.sql.startsWith('INSERT INTO processed_stripe_sessions'));
    const txnIndex = calls.findIndex((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(claimIndex).toBeLessThan(txnIndex);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['system:stripe-webhook', 'payment.reconcile', 'transaction', 'txn-fixed-1', expect.stringContaining('kind=donation')]);
  });

  it('records no payer snapshot when the session carries no customer_details', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM processed_stripe_sessions WHERE session_id': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'donation', 'txn-fixed-2', {
      ...DONATION_SESSION,
      id: 'cs_test_donation_2',
      customer_details: null,
    });
    expect(outcome).toEqual({ ok: true });
    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args[9]).toBeNull();
    expect(txnInsert?.args[10]).toBeNull();
  });

  it('is a clean no-op when the session is already claimed', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM processed_stripe_sessions WHERE session_id': { session_id: 'cs_test_donation_1' } } });
    const outcome = await reconcileCheckoutSession(db, {}, 'donation', 'txn-fixed-1', DONATION_SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already recorded') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO'))).toBe(false);
  });

  it('refuses (before any write) when the session carries no amount_total', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM processed_stripe_sessions WHERE session_id': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'donation', 'txn-fixed-1', { ...DONATION_SESSION, amount_total: null });
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('amount_total') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO'))).toBe(false);
  });

  it('propagates a batch failure (a concurrent delivery colliding on the claim primary key) as a rejected promise', async () => {
    const throwingDb = {
      prepare(sql: string) {
        const stmt = {
          sql,
          args: [] as unknown[],
          bind(...args: unknown[]) {
            stmt.args = args;
            return stmt;
          },
          async first() {
            return null; // no prior claim on file -- both concurrent deliveries reach the batch
          },
        };
        return stmt;
      },
      async batch() {
        throw new Error('UNIQUE constraint failed: processed_stripe_sessions.session_id');
      },
    } as unknown as D1Database;

    await expect(reconcileCheckoutSession(throwingDb, {}, 'donation', 'txn-fixed-1', DONATION_SESSION)).rejects.toThrow('UNIQUE constraint');
  });
});

describe('reconcileCheckoutSession: join', () => {
  const JOIN_MEMBERSHIP_ROW = { id: 'mem-join-1', household_id: 'hh-join-1', tier: 'family' as const, season: 2026, paid_at: null };
  const HOUSEHOLD_ROW = { name: 'The Rivera Household' };
  const PURCHASER_ROW = { name: 'Jamie Rivera', email: 'jamie@example.com' };
  const JOIN_WELCOME_TEMPLATE_ROW = {
    id: 'join_welcome',
    subject: 'Welcome to the Alaska Sailing Club',
    reply_to: 'membership-committee@aksailingclub.org',
    body: 'Hi {{person_name}}, {{tier_label}} {{season}} {{credit_status}} {{portal_url}} {{discord_url}} {{committee_email}}',
    updated_at: '2026-07-13 00:00:00',
    updated_by: 'authored:unified-signup',
  };
  const BOARD_TEMPLATE_ROW = {
    id: 'board_join_notice',
    subject: 'New membership -- {{household_name}}',
    reply_to: null,
    body: '{{household_name}} {{tier_label}} {{season}} {{classes_summary}}',
    updated_at: '2026-07-13 00:00:00',
    updated_by: 'authored:unified-signup',
  };
  const ENROLLMENT_ROWS: Record<string, { id: string; class_name: string; household_id: string }> = {
    'enr-covered-1': { id: 'enr-covered-1', class_name: 'Basic Sailing', household_id: 'hh-join-1' },
    'enr-paid-1': { id: 'enr-paid-1', class_name: 'Advanced Racing', household_id: 'hh-join-1' },
  };
  const JOIN_SESSION: StripeCheckoutSession = {
    id: 'cs_join_1',
    amount_total: 60000,
    metadata: {
      kind: 'join',
      refId: 'mem-join-1',
      enrollment_ids: 'enr-covered-1,enr-paid-1',
      covered_enrollment_ids: 'enr-covered-1',
      grant_credits: '1',
      purchaser_member_id: 'member-purchaser-1',
      dues_cents: '50000',
      paid_fee_cents: '10000',
    },
  };

  function fakeJoinDb(enrollmentRows: Record<string, { id: string; class_name: string; household_id: string }> = ENROLLMENT_ROWS) {
    return fakeD1({
      firstResults: {
        'FROM memberships WHERE id': JOIN_MEMBERSHIP_ROW,
        'FROM households WHERE id': HOUSEHOLD_ROW,
        'FROM members WHERE id': PURCHASER_ROW,
        'FROM email_templates WHERE id': (args: unknown[]) => (args[0] === 'join_welcome' ? JOIN_WELCOME_TEMPLATE_ROW : BOARD_TEMPLATE_ROW),
      },
      allResults: {
        'FROM class_enrollments ce': (args: unknown[]) => args.map((id) => enrollmentRows[id as string]).filter((row): row is { id: string; class_name: string; household_id: string } => row !== undefined),
      },
    });
  }

  it('flips the membership paid, grants credits, redeems the covered pick, settles every enrollment, and writes one summing ledger transaction', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeJoinDb();
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' }, 'join', 'mem-join-1', JOIN_SESSION);
    expect(outcome).toEqual({ ok: true });

    const claim = calls.find((c) => c.sql.startsWith('INSERT INTO processed_stripe_sessions'));
    expect(claim?.sql).not.toContain('OR IGNORE');
    expect(claim?.args).toEqual(['cs_join_1', 'join', 'mem-join-1']);

    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual([JOIN_SESSION.id, 'mem-join-1']);

    const grant = calls.find((c) => c.sql.startsWith('INSERT INTO credit_grants'));
    expect(grant?.args).toEqual([expect.any(String), 'hh-join-1', 'mem-join-1', 2]);

    const redemption = calls.find((c) => c.sql.startsWith('INSERT INTO credit_redemptions'));
    expect(redemption?.args).toEqual([expect.any(String), 'hh-join-1', 'enr-covered-1', 'member-purchaser-1']);

    const coveredFlip = calls.find((c) => c.sql === 'UPDATE class_enrollments SET fee_paid = 1 WHERE id = ?1');
    expect(coveredFlip?.args).toEqual(['enr-covered-1']);
    const paidFlip = calls.find((c) => c.sql.startsWith('UPDATE class_enrollments SET fee_paid = 1, stripe_ref'));
    expect(paidFlip?.args).toEqual([JOIN_SESSION.id, 'enr-paid-1']);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['system:stripe-webhook', 'payment.reconcile', 'membership', 'mem-join-1', expect.stringContaining('kind=join')]);

    const txnInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsert?.args).toEqual([
      expect.any(String), 'charge', 'stripe', expect.any(String), 60000, null, JOIN_SESSION.id, null, 'hh-join-1', null, null, null, null,
    ]);
    const lineInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInserts).toHaveLength(2);
    expect(lineInserts[0]?.args).toEqual([expect.any(String), txnInsert?.args[0], 'dues', 'Family Membership -- 2026 season', 50000, 'mem-join-1', null, null]);
    expect(lineInserts[1]?.args).toEqual([expect.any(String), txnInsert?.args[0], 'class-fee', 'Advanced Racing class fee', 10000, null, 'enr-paid-1', null]);

    expect(send).toHaveBeenCalledTimes(2);
    const welcome = send.mock.calls.find((call) => (call[0] as { to: string }).to === 'jamie@example.com')?.[0] as { subject: string; text: string };
    expect(welcome.subject).toBe('Welcome to the Alaska Sailing Club');
    expect(welcome.text).toContain('You have 2 class credits ready to use any time.');
    expect(welcome.text).toContain('https://dev.aksailingclub.org/my-account');
    const boardNotice = send.mock.calls.find((call) => (call[0] as { to: string }).to === 'board@aksailingclub.org')?.[0] as { subject: string; text: string };
    expect(boardNotice.subject).toBe('New membership -- The Rivera Household');
    expect(boardNotice.text).toContain('Basic Sailing, Advanced Racing');
  });

  it('composes every mutation -- claim, flip, grant, redemptions, enrollment flips, and the ledger -- into ONE db.batch()', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db } = fakeJoinDb();
    const batchSpy = vi.spyOn(db, 'batch');
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'join', 'mem-join-1', JOIN_SESSION);
    expect(outcome).toEqual({ ok: true });
    expect(batchSpy).toHaveBeenCalledTimes(1);

    const batched = batchSpy.mock.calls[0][0] as unknown as Array<{ sql: string }>;
    expect(batched[0].sql).toContain('INSERT INTO processed_stripe_sessions');
    expect(batched[0].sql).not.toContain('OR IGNORE');
    expect(batched.some((s) => s.sql.startsWith("UPDATE memberships SET paid_at = datetime('now')"))).toBe(true);
    expect(batched.some((s) => s.sql.startsWith('INSERT INTO credit_grants'))).toBe(true);
    expect(batched.some((s) => s.sql.startsWith('INSERT INTO credit_redemptions'))).toBe(true);
    expect(batched.some((s) => s.sql === 'UPDATE class_enrollments SET fee_paid = 1 WHERE id = ?1')).toBe(true);
    expect(batched.some((s) => s.sql.startsWith('UPDATE class_enrollments SET fee_paid = 1, stripe_ref'))).toBe(true);
    expect(batched.some((s) => s.sql.startsWith('INSERT INTO transactions'))).toBe(true);
    expect(batched.filter((s) => s.sql.startsWith('INSERT INTO transaction_lines'))).toHaveLength(2);
  });

  it('reads every referenced enrollment in ONE bulk IN query, never a per-id round-trip', async () => {
    const { db, calls } = fakeJoinDb();
    await reconcileCheckoutSession(db, {}, 'join', 'mem-join-1', JOIN_SESSION);
    const bulkReads = calls.filter((c) => c.sql.includes('FROM class_enrollments ce') && c.sql.includes(' IN ('));
    expect(bulkReads).toHaveLength(1);
    expect(bulkReads[0]?.args).toEqual(['enr-covered-1', 'enr-paid-1']);
  });

  it('refuses loudly, writing nothing, when a referenced enrollment does not belong to the membership\'s own household', async () => {
    const send = vi.fn();
    const { db, calls } = fakeJoinDb({
      'enr-covered-1': { id: 'enr-covered-1', class_name: 'Basic Sailing', household_id: 'hh-join-1' },
      'enr-paid-1': { id: 'enr-paid-1', class_name: 'Advanced Racing', household_id: 'hh-someone-elses' },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'join', 'mem-join-1', JOIN_SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining("does not belong to membership mem-join-1's household") });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('throws when the snapshotted dues/paid-fee cents do not sum to session.amount_total, writing nothing (the retryable-mismatch path)', async () => {
    const { db, calls } = fakeJoinDb();
    await expect(
      reconcileCheckoutSession(db, {}, 'join', 'mem-join-1', {
        ...JOIN_SESSION,
        metadata: { ...JOIN_SESSION.metadata, dues_cents: '49000' } as Record<string, string>,
      }),
    ).rejects.toThrow(/ledger: lines sum to/);
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('propagates a batch failure (a concurrent delivery colliding on the claim primary key) as a rejected promise', async () => {
    const throwingDb = {
      prepare(sql: string) {
        const stmt = {
          sql,
          args: [] as unknown[],
          bind(...args: unknown[]) {
            stmt.args = args;
            return stmt;
          },
          async first() {
            return JOIN_MEMBERSHIP_ROW;
          },
          async all() {
            return { results: [], success: true, meta: {} };
          },
        };
        return stmt;
      },
      async batch() {
        throw new Error('UNIQUE constraint failed: processed_stripe_sessions.session_id');
      },
    } as unknown as D1Database;

    await expect(
      reconcileCheckoutSession(
        throwingDb,
        {},
        'join',
        'mem-join-1',
        {
          ...JOIN_SESSION,
          amount_total: 50000,
          metadata: { ...JOIN_SESSION.metadata, enrollment_ids: '', covered_enrollment_ids: '', paid_fee_cents: '' } as Record<string, string>,
        },
      ),
    ).rejects.toThrow('UNIQUE constraint');
  });

  it('grants no credits on a welcome-back renewal (grant_credits=0)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeJoinDb();
    const outcome = await reconcileCheckoutSession(
      db,
      { EMAIL: { send } },
      'join',
      'mem-join-1',
      { ...JOIN_SESSION, metadata: { ...JOIN_SESSION.metadata, grant_credits: '0' } as Record<string, string> },
    );
    expect(outcome).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO credit_grants'))).toBe(false);

    const welcome = send.mock.calls.find((call) => (call[0] as { to: string }).to === 'jamie@example.com')?.[0] as { text: string };
    expect(welcome.text).not.toContain('class credit');
  });

  it('is a clean no-op when the membership is already paid (idempotent replay), before checking anything else about the session', async () => {
    const send = vi.fn();
    const { db, calls } = fakeD1({
      firstResults: { 'FROM memberships WHERE id': { ...JOIN_MEMBERSHIP_ROW, paid_at: '2026-07-13 00:00:00' } },
    });
    const outcome = await reconcileCheckoutSession(db, { EMAIL: { send } }, 'join', 'mem-join-1', JOIN_SESSION);
    expect(outcome).toEqual({ ok: true, reason: expect.stringContaining('already paid') });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO audit_log') || c.sql.startsWith('INSERT INTO transactions'))).toBe(false);
  });

  it('refuses an unknown membership id without writing anything', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE id': null } });
    const outcome = await reconcileCheckoutSession(db, {}, 'join', 'no-such-membership', JOIN_SESSION);
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('no such membership') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('refuses (before any write) when the session carries no amount_total', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE id': JOIN_MEMBERSHIP_ROW } });
    const outcome = await reconcileCheckoutSession(db, {}, 'join', 'mem-join-1', { ...JOIN_SESSION, amount_total: null });
    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('amount_total') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('handles a solo join with no class picks: dues-only ledger line, no covered/paid enrollment writes, no bulk read', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM memberships WHERE id': { id: 'mem-join-2', household_id: 'hh-join-2', tier: 'individual' as const, season: 2026, paid_at: null },
        'FROM households WHERE id': { name: 'The Nguyen Household' },
        'FROM members WHERE id': PURCHASER_ROW,
        'FROM email_templates WHERE id': (args: unknown[]) => (args[0] === 'join_welcome' ? JOIN_WELCOME_TEMPLATE_ROW : BOARD_TEMPLATE_ROW),
      },
    });
    const outcome = await reconcileCheckoutSession(
      db,
      { EMAIL: { send } },
      'join',
      'mem-join-2',
      {
        id: 'cs_join_2',
        amount_total: 25000,
        metadata: {
          kind: 'join',
          refId: 'mem-join-2',
          enrollment_ids: '',
          covered_enrollment_ids: '',
          grant_credits: '1',
          purchaser_member_id: 'member-purchaser-1',
          dues_cents: '25000',
          paid_fee_cents: '',
        },
      },
    );
    expect(outcome).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE class_enrollments'))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO credit_redemptions'))).toBe(false);
    expect(calls.some((c) => c.sql.includes('FROM class_enrollments ce'))).toBe(false);
    const lineInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInserts).toHaveLength(1);
    expect(lineInserts[0]?.args).toEqual([expect.any(String), expect.any(String), 'dues', 'Individual Membership -- 2026 season', 25000, 'mem-join-2', null, null]);
  });
});
