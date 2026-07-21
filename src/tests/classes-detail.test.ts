// The Classes detail screen rebuild (Classes pass Task 4, docs/2026-07-21-classes-pass-design.md):
// `buildClassPayment` (the store-level charge-the-class-fee-and-flip-feePaid builder) plus the
// `recordPayment` route action that wraps it. Mirrors `manual-payment.test.ts`'s own build-only
// testing shape for the store function and `classes-actions.test.ts`'s own `postEvent` recipe for
// the route action.
import { describe, expect, it } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/classes/[id]/+page.server';
import { buildClassPayment, getWaitlistMemberNames } from '$admin-club/lib/classes-store';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

describe('buildClassPayment', () => {
  it('flips fee_paid and writes a ledger charge for the class\'s own fee', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM class_enrollments e JOIN classes c': {
          fee_paid: 0,
          fee: 100,
          class_name: 'Fleet Tune-Up Weekend',
          household_id: 'hh-1',
        },
      },
    });

    const result = await buildClassPayment(db, { enrollmentId: 'enr-1', source: 'check', memo: 'Walk-up' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.amountCents).toBe(10000);
    await db.batch(result.statements);

    const enrollmentUpdate = calls.find((c) => c.sql.startsWith('UPDATE class_enrollments'));
    expect(enrollmentUpdate?.args).toEqual(['enr-1']);

    const txInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txInsert?.args).toContain(10000);
    expect(txInsert?.args).toContain('check');
    expect(txInsert?.args).toContain('Walk-up');
    expect(txInsert?.args).toContain('hh-1');

    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toContain('class-fee');
    expect(lineInsert?.args).toContain('enr-1');
  });

  it('refuses an unknown enrollment', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_enrollments e JOIN classes c': null } });
    const result = await buildClassPayment(db, { enrollmentId: 'nope', source: 'cash' });
    expect(result).toEqual({ ok: false, error: 'No such enrollment.' });
  });

  it('refuses an already-paid enrollment, writing nothing', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_enrollments e JOIN classes c': { fee_paid: 1, fee: 100, class_name: 'Fleet Tune-Up Weekend' } },
    });
    const result = await buildClassPayment(db, { enrollmentId: 'enr-1', source: 'cash' });
    expect(result).toEqual({ ok: false, error: 'This enrollment is already paid.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('records a $0 comp cleanly, the ledger sum invariant holding at zero', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_enrollments e JOIN classes c': { fee_paid: 0, fee: 0, class_name: 'Drop-in Sail' } },
    });
    const result = await buildClassPayment(db, { enrollmentId: 'enr-2', source: 'comp' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    await expect(db.batch(result.statements)).resolves.toBeDefined();
  });
});

describe('getWaitlistMemberNames', () => {
  it('returns an empty map with no query for an empty input', async () => {
    const { db, calls } = fakeD1();
    await expect(getWaitlistMemberNames(db, [])).resolves.toEqual(new Map());
    expect(calls).toEqual([]);
  });

  it('resolves each id to its stored name', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM members WHERE id IN': [{ id: 'mem-1', name: 'Alex Rivera' }] },
    });
    await expect(getWaitlistMemberNames(db, ['mem-1'])).resolves.toEqual(new Map([['mem-1', 'Alex Rivera']]));
  });
});

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type DetailActionEvent = Parameters<typeof actions.recordPayment>[0];

/** Mirrors `classes-actions.test.ts`'s own `postEvent`. */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; id?: string; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/classes';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id: opts.id ?? 'fleet-tune-up-weekend' },
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as DetailActionEvent;
}

describe('recordPayment action', () => {
  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.recordPayment(postEvent(noRole, { enrollmentId: 'enr-1', source: 'check' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 400 when enrollmentId is missing, auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const sink = (record: AdminActionAuditRecord) => calls.push(record);
    const calls: AdminActionAuditRecord[] = [];
    const result = await actions.recordPayment(postEvent(admin, { source: 'check' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toContainEqual(expect.objectContaining({ action: 'record-payment', entity: 'transaction' }));
  });

  it('fails 400 on an invalid source', async () => {
    const { db } = fakeD1();
    const result = await actions.recordPayment(postEvent(admin, { enrollmentId: 'enr-1', source: 'venmo' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 400 and audits the rejection when the enrollment is already paid', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_enrollments e JOIN classes c': { fee_paid: 1, fee: 100, class_name: 'Fleet Tune-Up Weekend' } },
    });
    const sink = (record: AdminActionAuditRecord) => calls.push(record);
    const calls: AdminActionAuditRecord[] = [];
    const result = await actions.recordPayment(
      postEvent(admin, { enrollmentId: 'enr-1', source: 'check' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toBe('This enrollment is already paid.');
    expect(calls).toContainEqual(
      expect.objectContaining({ action: 'record-payment', entity: 'transaction', entityId: 'enr-1' }),
    );
  });

  it('batches the fee_paid flip and the ledger write, and audits the amount', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_enrollments e JOIN classes c': { fee_paid: 0, fee: 100, class_name: 'Fleet Tune-Up Weekend' } },
    });
    const sink = (record: AdminActionAuditRecord) => auditCalls.push(record);
    const auditCalls: AdminActionAuditRecord[] = [];
    const result = await actions.recordPayment(
      postEvent(admin, { enrollmentId: 'enr-1', source: 'cash', memo: 'Walk-up' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE class_enrollments SET fee_paid = 1'))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transactions'))).toBe(true);
    expect(auditCalls).toContainEqual(
      expect.objectContaining({ action: 'record-payment', entity: 'transaction', entityId: 'enr-1', detail: 'amount_cents=10000' }),
    );
  });
});
