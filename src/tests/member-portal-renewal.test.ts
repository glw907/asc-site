import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { mintOrReuseRenewalMembership, nextUnclaimedRenewalSeason } from '$member-portal/lib/renewal';

describe('nextUnclaimedRenewalSeason', () => {
  it('answers the current season when it is not already paid', async () => {
    const { db } = fakeD1({ firstResults: { 'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': null } });
    await expect(nextUnclaimedRenewalSeason(db, 'hh-1', 2026)).resolves.toBe(2026);
  });

  it('walks forward past a season already paid', async () => {
    const { db } = fakeD1({
      firstResults: {
        'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': ((args: unknown[]) => (args[1] === 2026 ? { found: 1 } : null)) as unknown as null,
      },
    });
    await expect(nextUnclaimedRenewalSeason(db, 'hh-1', 2026)).resolves.toBe(2027);
  });

  it('treats a season whose only row was refunded as unclaimed, via the AND refunded_at IS NULL predicate', async () => {
    // The real query already filters out a refunded row, so the fake DB simulates the household's
    // only 2026 row being refunded the same way it simulates "never paid": answering null. The SQL
    // assertion is what actually proves the predicate is there, not merely assumed by the fixture.
    const { db, calls } = fakeD1({ firstResults: { 'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': null } });
    await expect(nextUnclaimedRenewalSeason(db, 'hh-1', 2026)).resolves.toBe(2026);

    const query = calls.find((c) => c.sql.includes('FROM memberships WHERE household_id = ?1 AND season = ?2'));
    expect(query?.sql).toContain('AND refunded_at IS NULL');
  });
});

/** {@link findReclaimableMembershipForSeason}'s own key, distinct from
 *  `nextUnclaimedRenewalSeason`'s `AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1` key
 *  (both live in this same module, both keyed by SQL substring in the fake DB). */
const RECLAIMABLE_QUERY_KEY = 'AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1';

describe('mintOrReuseRenewalMembership', () => {
  it('mints a fresh unpaid row when none exists for the target season', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': null, [RECLAIMABLE_QUERY_KEY]: null },
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
      firstResults: { 'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': null, [RECLAIMABLE_QUERY_KEY]: { id: 'ms-existing' } },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'family', 500, 2026);
    expect(result).toEqual({ membershipId: 'ms-existing', season: 2026 });

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(false);
    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual(['family', 500, 'ms-existing']);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['member:mem-1', 'renew.reuse', 'membership', 'ms-existing', 'tier=family season=2026']);
  });

  it('reclaims a refunded row for the target season: same row id, an UPDATE clearing refunded_at, no constraint violation', async () => {
    // The household's only 2026 row was refunded (`hasPaidMembershipForSeason` answers null for
    // it via the `refunded_at IS NULL` predicate, so `nextUnclaimedRenewalSeason` treats 2026 as
    // unclaimed and the reclaimable query then finds that SAME refunded row by id).
    const { db, calls } = fakeD1({
      firstResults: { 'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': null, [RECLAIMABLE_QUERY_KEY]: { id: 'ms-refunded-2026' } },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'family', 500, 2026);
    expect(result).toEqual({ membershipId: 'ms-refunded-2026', season: 2026 });

    // No second row inserted -- the constraint the refunded row itself still occupies is never hit.
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(false);

    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.sql).toContain('refunded_at = NULL');
    expect(update?.sql).toContain('paid_at = NULL');
    expect(update?.args).toEqual(['family', 500, 'ms-refunded-2026']);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['member:mem-1', 'renew.reuse', 'membership', 'ms-refunded-2026', 'tier=family season=2026']);
  });

  it('skips a season already paid and mints into the next unclaimed one', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1': ((args: unknown[]) => (args[1] === 2026 ? { found: 1 } : null)) as unknown as null,
        [RECLAIMABLE_QUERY_KEY]: null,
      },
    });
    const result = await mintOrReuseRenewalMembership(db, 'hh-1', 'mem-1', 'individual', 250, 2026);
    expect(result.season).toBe(2027);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(insert?.args).toEqual([result.membershipId, 'hh-1', 2027, 'individual', 250]);
  });
});
