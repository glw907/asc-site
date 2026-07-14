import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { mintOrReuseRenewalMembership, nextUnclaimedRenewalSeason } from '$member-portal/lib/renewal';

describe('nextUnclaimedRenewalSeason', () => {
  it('answers the current season when it is not already paid', async () => {
    const { db } = fakeD1({ firstResults: { 'AND paid_at IS NOT NULL LIMIT 1': null } });
    await expect(nextUnclaimedRenewalSeason(db, 'hh-1', 2026)).resolves.toBe(2026);
  });

  it('walks forward past a season already paid', async () => {
    const { db } = fakeD1({
      firstResults: {
        'AND paid_at IS NOT NULL LIMIT 1': ((args: unknown[]) => (args[1] === 2026 ? { found: 1 } : null)) as unknown as null,
      },
    });
    await expect(nextUnclaimedRenewalSeason(db, 'hh-1', 2026)).resolves.toBe(2027);
  });
});

describe('mintOrReuseRenewalMembership', () => {
  it('mints a fresh unpaid row when none exists for the target season', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'AND paid_at IS NOT NULL LIMIT 1': null, 'AND paid_at IS NULL LIMIT 1': null },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'individual', 250, 2026);
    expect(result).toEqual({ membershipId: expect.any(String), season: 2026 });

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(insert?.args).toEqual([result.membershipId, 'hh-1', 2026, 'individual', 250]);
    expect(calls.some((c) => c.sql.startsWith('UPDATE memberships'))).toBe(false);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['member:mem-1', 'renew.mint', 'membership', result.membershipId, 'tier=individual season=2026']);
  });

  it('reuses an abandoned unpaid row for the target season instead of minting a second one', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'AND paid_at IS NOT NULL LIMIT 1': null, 'AND paid_at IS NULL LIMIT 1': { id: 'ms-existing' } },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'family', 500, 2026);
    expect(result).toEqual({ membershipId: 'ms-existing', season: 2026 });

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(false);
    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual(['family', 500, 'ms-existing']);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['member:mem-1', 'renew.reuse', 'membership', 'ms-existing', 'tier=family season=2026']);
  });

  it('skips a season already paid and mints into the next unclaimed one', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'AND paid_at IS NOT NULL LIMIT 1': ((args: unknown[]) => (args[1] === 2026 ? { found: 1 } : null)) as unknown as null,
        'AND paid_at IS NULL LIMIT 1': null,
      },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'individual', 250, 2026);
    expect(result.season).toBe(2027);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(insert?.args).toEqual([result.membershipId, 'hh-1', 2027, 'individual', 250]);
  });
});
