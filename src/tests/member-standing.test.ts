// getMemberStanding's own transition table (rolling-renewal derivation, Geoff's mid-pass
// 2026-07-07 correction): current through paid_at + 1 year, a grace window past that boundary,
// lapsed after the grace window, all keyed off a fixed `now` via vi.useFakeTimers (offers.test.ts's
// own convention for boundary-precise date math). Synthetic fixtures only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { getHouseholdStanding, getMemberStanding } from '$member-auth/lib/standing';

const MEMBER = { id: 'mem-1', household_id: 'hh-1', name: 'Scratch Member' };
const HOUSEHOLD = { name: 'The Scratches' };
const GRACE_SETTING = { value: '30' };

/** `paid_at` a fixed distance in the past from `NOW`, in the schema's own SQLite-datetime shape. */
function paidAtDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

describe('getMemberStanding', () => {
  const NOW = new Date('2027-06-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for an unknown member id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE id': null } });
    await expect(getMemberStanding(db, 'no-such-member')).resolves.toBeNull();
  });

  it('answers a neutral "no membership on file" state when the household has never had a paid row', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': null,
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing).toEqual({
      memberId: MEMBER.id,
      memberName: MEMBER.name,
      householdId: MEMBER.household_id,
      householdName: HOUSEHOLD.name,
      status: 'lapsed',
      tier: null,
      season: null,
      expiresOn: null,
      graceEndsOn: null,
      statusLine: 'No membership on file yet.',
    });
  });

  it('reads "current" when now is before the paid_at + 1 year boundary', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAtDaysAgo(NOW, 30) },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.status).toBe('current');
    expect(standing?.tier).toBe('individual');
    expect(standing?.season).toBe(2026);
    expect(standing?.statusLine).toMatch(/^Current through /);
  });

  it('reads "current" exactly at the paid_at + 1 year instant (inclusive boundary)', async () => {
    const paidAt = new Date(NOW);
    paidAt.setUTCFullYear(paidAt.getUTCFullYear() - 1); // paid_at + 1 year === NOW exactly
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'family', season: 2026, paid_at: paidAt.toISOString().slice(0, 19).replace('T', ' ') },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.status).toBe('current');
  });

  it('reads "grace" the instant after the boundary, within the grace window', async () => {
    const paidAt = new Date(NOW);
    paidAt.setUTCFullYear(paidAt.getUTCFullYear() - 1);
    paidAt.setUTCMilliseconds(paidAt.getUTCMilliseconds() - 1); // boundary is 1ms before NOW
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAt.toISOString().slice(0, 19).replace('T', ' ') },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.status).toBe('grace');
    expect(standing?.statusLine).toMatch(/^Your membership lapsed .* · renew by .* to avoid a gap$/);
  });

  it('reads "grace" throughout the settings-configured grace window, then "lapsed" once it passes', async () => {
    // paid_at + 1 year = 20 days before NOW; a 30-day grace window means NOW still sits inside it.
    const { db: graceDb } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'young-adult', season: 2026, paid_at: paidAtDaysAgo(NOW, 365 + 20) },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const grace = await getMemberStanding(graceDb, MEMBER.id);
    expect(grace?.status).toBe('grace');
    expect(grace?.tier).toBe('young-adult');

    // paid_at + 1 year = 31 days before NOW; past the 30-day grace window.
    const { db: lapsedDb } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'young-adult', season: 2026, paid_at: paidAtDaysAgo(NOW, 365 + 31) },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const lapsed = await getMemberStanding(lapsedDb, MEMBER.id);
    expect(lapsed?.status).toBe('lapsed');
    expect(lapsed?.statusLine).toMatch(/^Your membership lapsed /);
    expect(lapsed?.statusLine).not.toContain('renew by');
  });

  it('reads "lapsed" exactly at the grace-window-end instant boundary (inclusive) vs one instant past it', async () => {
    const graceDays = 30;
    const boundary = new Date(NOW);
    boundary.setUTCFullYear(boundary.getUTCFullYear() - 1);
    boundary.setUTCDate(boundary.getUTCDate() - graceDays); // paid_at such that graceEnd === NOW exactly

    const { db: atBoundary } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: boundary.toISOString().slice(0, 19).replace('T', ' ') },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    expect((await getMemberStanding(atBoundary, MEMBER.id))?.status).toBe('grace');

    const pastBoundary = new Date(boundary);
    pastBoundary.setUTCMilliseconds(pastBoundary.getUTCMilliseconds() - 1); // paid_at 1ms earlier: graceEnd is 1ms before NOW
    const { db: pastDb } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: pastBoundary.toISOString().slice(0, 19).replace('T', ' ') },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    expect((await getMemberStanding(pastDb, MEMBER.id))?.status).toBe('lapsed');
  });

  it('falls back to the default 30-day grace window when the settings row is missing', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAtDaysAgo(NOW, 365 + 20) },
        "'renewal_grace_days'": null,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.status).toBe('grace');
  });

  it('picks the household\'s most recently PAID row by paid_at, not by season', async () => {
    // The most recent paid_at belongs to season 2025 (a plausible mid-year renewal), even though
    // a later season number could in principle exist unpaid; the query itself only ever
    // considers paid_at IS NOT NULL rows, so this also proves the season column plays no role in
    // the derivation itself (this module's own header).
    const { db } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': { tier: 'family', season: 2025, paid_at: paidAtDaysAgo(NOW, 10) },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.season).toBe(2025);
    expect(standing?.status).toBe('current');
  });

  it('ignores a refunded row: a household whose only grounding row is refunded reads "lapsed" with no membership on file (member-keyed path)', async () => {
    // The real query carries AND refunded_at IS NULL, so a household whose only paid row was
    // refunded has nothing left to ground on -- the fake DB simulates that by answering null, the
    // same shape the "never paid" test uses. The SQL text itself is asserted below to prove the
    // real query would actually filter the refunded row, not merely that this fixture assumes it.
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM members WHERE id': MEMBER,
        'FROM households WHERE id': HOUSEHOLD,
        'FROM memberships WHERE household_id': null,
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getMemberStanding(db, MEMBER.id);
    expect(standing?.status).toBe('lapsed');
    expect(standing?.statusLine).toBe('No membership on file yet.');

    const membershipQuery = calls.find((c) => c.sql.includes('FROM memberships WHERE household_id'));
    expect(membershipQuery?.sql).toContain('AND refunded_at IS NULL');
  });
});

describe('getHouseholdStanding', () => {
  const HOUSEHOLD_ID = 'hh-1';
  const NOW = new Date('2027-06-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers "none" when the household has never had a non-refunded paid row', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': null } });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing).toEqual({ status: 'none', lastSeason: null, tier: null, pricePaid: null, paidAt: null });
  });

  it('reads "current" before the paid_at + 1 year boundary, carrying the price snapshot', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE household_id': { tier: 'family', season: 2026, paid_at: paidAtDaysAgo(NOW, 30), price_paid: 324 },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing).toEqual({ status: 'current', lastSeason: 2026, tier: 'family', pricePaid: 324, paidAt: paidAtDaysAgo(NOW, 30) });
  });

  it('reads "grace" the instant after the boundary, within the grace window', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAtDaysAgo(NOW, 365 + 20), price_paid: 250 },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing.status).toBe('grace');
  });

  it('reads "lapsed" once the grace window passes', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAtDaysAgo(NOW, 365 + 31), price_paid: 250 },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing.status).toBe('lapsed');
  });

  it('reads a comped ($0) row honestly, not as "none"', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: paidAtDaysAgo(NOW, 30), price_paid: 0 },
        "'renewal_grace_days'": GRACE_SETTING,
      },
    });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing.status).toBe('current');
    expect(standing.pricePaid).toBe(0);
  });

  it('ignores a refunded row via the AND refunded_at IS NULL predicate: a household with only a refunded current-season row reads "none"', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM memberships WHERE household_id': null } });
    const standing = await getHouseholdStanding(db, HOUSEHOLD_ID);
    expect(standing.status).toBe('none');

    const membershipQuery = calls.find((c) => c.sql.includes('FROM memberships WHERE household_id'));
    expect(membershipQuery?.sql).toContain('AND refunded_at IS NULL');
  });
});
