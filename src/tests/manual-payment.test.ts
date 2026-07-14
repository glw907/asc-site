import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { buildManualMembershipPayment } from '$admin-club/lib/manual-payment';

describe('buildManualMembershipPayment', () => {
  it('inserts a fresh membership row plus a ledger charge, atomically, when no row exists yet', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': null } });

    const result = await buildManualMembershipPayment(db, {
      householdId: 'hh-1',
      season: 2026,
      tier: 'individual',
      amountCents: 25000,
      source: 'check',
      memo: 'Walk-up join',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    await db.batch(result.statements);

    const membershipInsert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(membershipInsert?.args).toEqual([result.membershipId, 'hh-1', 2026, 'individual', 250]);

    const txInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txInsert?.args).toContain(25000);
    expect(txInsert?.args).toContain('check');

    const lineInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transaction_lines'));
    expect(lineInsert?.args).toContain('dues');
    expect(lineInsert?.args).toContain(result.membershipId);
  });

  it('refuses when a non-refunded membership already exists for the season', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': { id: 'ms-1', refunded_at: null } } });

    const result = await buildManualMembershipPayment(db, {
      householdId: 'hh-1',
      season: 2026,
      tier: 'individual',
      amountCents: 25000,
      source: 'check',
    });

    expect(result).toEqual({ ok: false, error: 'This household already has a 2026 membership on file.' });
  });

  it('reclaims a refunded row for the same season instead of inserting', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': { id: 'ms-refunded', refunded_at: '2026-02-01' } } });

    const result = await buildManualMembershipPayment(db, {
      householdId: 'hh-1',
      season: 2026,
      tier: 'family',
      amountCents: 50000,
      source: 'cash',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.membershipId).toBe('ms-refunded');
    await db.batch(result.statements);

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(false);
    const membershipUpdate = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(membershipUpdate?.sql).toContain('refunded_at = NULL');
    expect(membershipUpdate?.args).toEqual(['family', 500, 'ms-refunded']);
  });

  it('records a $0 comp cleanly, the ledger sum invariant holding at zero', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': null } });

    const result = await buildManualMembershipPayment(db, {
      householdId: 'hh-comp',
      season: 2026,
      tier: 'individual',
      amountCents: 0,
      source: 'comp',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    await expect(db.batch(result.statements)).resolves.toBeDefined();
  });
});
