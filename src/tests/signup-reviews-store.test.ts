import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  pendingSignupReviews,
  resolveSignupReview,
  reviewedThisSeasonCount,
} from '$admin-club/lib/signup-reviews-store';

const TIER_PRICE_ROWS = [
  { key: 'tier_price_individual', value: '250' },
  { key: 'tier_price_family', value: '500' },
  { key: 'tier_price_young_adult', value: '100' },
];

function daysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

const OYELARAN_ROW = {
  membership_id: 'ms-oyelaran-2026',
  household_name: 'The Oyelarans',
  member_name: 'Tobi Oyelaran',
  tier: 'young-adult',
  price_paid: 100,
  paid_at: daysAgo(2),
  submitted_at: daysAgo(2),
  credit_grant: 1,
};

describe('pendingSignupReviews', () => {
  it('maps a pending review with its credit grant and no flag when paid in full', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM memberships m': [OYELARAN_ROW], tier_price_individual: TIER_PRICE_ROWS },
    });
    const rows = await pendingSignupReviews(db);
    expect(rows).toEqual([
      {
        id: 'ms-oyelaran-2026',
        memberName: 'Tobi Oyelaran',
        household: 'The Oyelarans',
        tier: 'young-adult',
        paidAmount: 100,
        paidDate: OYELARAN_ROW.paid_at,
        creditGrant: 1,
        submittedAt: OYELARAN_ROW.submitted_at,
        flagNote: null,
      },
    ]);
  });

  it('falls back to the household name when there is no primary member on file', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM memberships m': [{ ...OYELARAN_ROW, member_name: null }],
        tier_price_individual: TIER_PRICE_ROWS,
      },
    });
    const [row] = await pendingSignupReviews(db);
    expect(row.memberName).toBe('The Oyelarans');
  });

  it('flags a nonzero payment short of the published tier rate', async () => {
    const drummond = {
      membership_id: 'ms-drummond-2026',
      household_name: 'The Drummonds',
      member_name: 'Quinn Drummond',
      tier: 'individual',
      price_paid: 200,
      paid_at: daysAgo(1),
      submitted_at: daysAgo(1),
      credit_grant: 1,
    };
    const { db } = fakeD1({
      allResults: { 'FROM memberships m': [drummond], tier_price_individual: TIER_PRICE_ROWS },
    });
    const [row] = await pendingSignupReviews(db);
    expect(row.flagNote).toBe('Payment received ($200) is short of the published rate ($250).');
  });

  it('never flags a deliberate $0 comp as a shortfall', async () => {
    const comp = {
      membership_id: 'ms-comp-2026',
      household_name: 'A Comped Household',
      member_name: 'Comp Member',
      tier: 'individual',
      price_paid: 0,
      paid_at: daysAgo(1),
      submitted_at: daysAgo(1),
      credit_grant: 1,
    };
    const { db } = fakeD1({
      allResults: { 'FROM memberships m': [comp], tier_price_individual: TIER_PRICE_ROWS },
    });
    const [row] = await pendingSignupReviews(db);
    expect(row.flagNote).toBeNull();
  });

  it('binds a windowDays-out cutoff, not the default, when overridden', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM memberships m': [], tier_price_individual: TIER_PRICE_ROWS },
    });
    const before7 = daysAgo(7);
    await pendingSignupReviews(db, { windowDays: 7 });
    const after7 = daysAgo(7);
    const call = calls.find((c) => c.sql.includes('FROM memberships m'));
    const bound = call?.args[0] as string;
    // The bound cutoff sits between the two just-taken 7-days-ago snapshots (lexicographic
    // comparison holds for this "YYYY-MM-DD HH:MM:SS" shape).
    expect(bound >= before7 && bound <= after7).toBe(true);
  });

  it('is a first-season-only query: excludes a household with an earlier season on record', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM memberships m': [], tier_price_individual: TIER_PRICE_ROWS },
    });
    await pendingSignupReviews(db);
    const call = calls.find((c) => c.sql.includes('FROM memberships m'));
    expect(call?.sql).toContain('earlier.season < m.season');
  });

  it('excludes a membership that already has a resolution row', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM memberships m': [], tier_price_individual: TIER_PRICE_ROWS },
    });
    await pendingSignupReviews(db);
    const call = calls.find((c) => c.sql.includes('FROM memberships m'));
    expect(call?.sql).toContain('FROM signup_review_resolutions r WHERE r.membership_id = m.id');
  });
});

describe('resolveSignupReview', () => {
  it('inserts a resolution row keyed on the membership id', async () => {
    const { db, calls } = fakeD1();
    await resolveSignupReview(db, {
      membershipId: 'ms-drummond-2026',
      outcome: 'denied',
      note: 'Payment does not match the invoice.',
      resolvedBy: 'owner@example.com',
    });
    const call = calls.find((c) => c.sql.includes('INSERT INTO signup_review_resolutions'));
    expect(call?.args).toEqual([
      expect.any(String),
      'ms-drummond-2026',
      'denied',
      'Payment does not match the invoice.',
      'owner@example.com',
    ]);
  });

  it('writes a null note for an approved (no-reason) resolution', async () => {
    const { db, calls } = fakeD1();
    await resolveSignupReview(db, { membershipId: 'ms-oyelaran-2026', outcome: 'approved', resolvedBy: 'owner@example.com' });
    const call = calls.find((c) => c.sql.includes('INSERT INTO signup_review_resolutions'));
    expect(call?.args[3]).toBeNull();
  });
});

describe('reviewedThisSeasonCount', () => {
  it('counts resolutions whose membership matches the season', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM signup_review_resolutions r': { n: 3 } } });
    await expect(reviewedThisSeasonCount(db, 2026)).resolves.toBe(3);
  });

  it('reads zero when nothing has been resolved yet', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM signup_review_resolutions r': null } });
    await expect(reviewedThisSeasonCount(db, 2026)).resolves.toBe(0);
  });
});
