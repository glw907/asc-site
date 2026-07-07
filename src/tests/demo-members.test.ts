import { describe, expect, it } from 'vitest';
import {
  CREDIT_GRANT_AMOUNT,
  CURRENT_SEASON,
  YOUNG_ADULT_MAX_AGE,
  YOUNG_ADULT_MIN_AGE,
  ageInSeason,
  creditBalance,
  getCreditGrantsForHousehold,
  getCreditRedemptionsForHousehold,
  getHousehold,
  getHouseholdMembers,
  getMember,
  getMembershipsForHousehold,
  getPaymentForMembership,
  getSignupReview,
  households,
  isHouseholdPrimary,
  memberships,
  members,
  payments,
  pendingSignupReviews,
  resolveSignupReview,
  reviewedThisSeasonCount,
  segmentForMember,
  signupReviews,
  currentSeasonPaymentStatus,
} from '$admin-club/lib/demo-members';

describe('demo-members schema integrity', () => {
  it('gives every member a real household', () => {
    for (const member of members) {
      expect(getHousehold(member.householdId), `${member.name} has no household`).toBeDefined();
    }
  });

  it('gives every household a primary who is actually one of its own members', () => {
    for (const household of households) {
      const primary = getMember(household.primaryMemberId);
      expect(primary, `${household.name}'s primary member does not exist`).toBeDefined();
      expect(primary?.householdId).toBe(household.id);
    }
  });

  it('gives every membership a real household', () => {
    for (const membership of memberships) {
      expect(getHousehold(membership.householdId), `${membership.id} has no household`).toBeDefined();
    }
  });

  it('gives every payment a real membership', () => {
    const membershipIds = new Set(memberships.map((m) => m.id));
    for (const payment of payments) {
      expect(membershipIds.has(payment.membershipId), `${payment.id} has no membership`).toBe(true);
    }
  });

  it('has at least one multi-member household', () => {
    const sizes = households.map((h) => getHouseholdMembers(h.id).length);
    expect(Math.max(...sizes)).toBeGreaterThan(2);
  });

  it('covers all three directory-visibility values', () => {
    const values = new Set(members.map((m) => m.directoryVisibility));
    expect(values).toEqual(new Set(['visible', 'partial', 'hidden']));
  });

  it('covers all three membership tiers', () => {
    const tiers = new Set(memberships.map((m) => m.tier));
    expect(tiers).toEqual(new Set(['individual', 'family', 'young-adult']));
  });
});

describe('isHouseholdPrimary', () => {
  it('is true only for the household-designated primary', () => {
    const larsenHousehold = getHousehold('hh-larsen');
    expect(isHouseholdPrimary(larsenHousehold!.primaryMemberId)).toBe(true);
    const other = getHouseholdMembers('hh-larsen').find((m) => m.id !== larsenHousehold!.primaryMemberId);
    expect(isHouseholdPrimary(other!.id)).toBe(false);
  });

  it('returns false for a bad member id', () => {
    expect(isHouseholdPrimary('mem-does-not-exist')).toBe(false);
  });
});

describe('segmentForMember and currentSeasonPaymentStatus', () => {
  it('reads current for a member whose household paid this season', () => {
    expect(segmentForMember('mem-erik-larsen')).toBe('current');
    expect(currentSeasonPaymentStatus('mem-erik-larsen')).toBe('paid');
  });

  it('reads current-but-pending for a member whose household invoiced but has not paid', () => {
    expect(segmentForMember('mem-bjorn-halvorsen')).toBe('current');
    expect(currentSeasonPaymentStatus('mem-bjorn-halvorsen')).toBe('pending');
  });

  it('reads lapsed when the household has no current-season membership row', () => {
    expect(segmentForMember('mem-ada-okonkwo')).toBe('lapsed');
    expect(currentSeasonPaymentStatus('mem-ada-okonkwo')).toBeNull();
  });

  it('reads archived for a member with an archivedAt override, even if their household is current', () => {
    expect(segmentForMember('mem-vera-petrova')).toBe('archived');
    // Her household (the Petrovs) is itself current: the override is per-member, not shared.
    expect(segmentForMember('mem-dimitri-petrov')).toBe('current');
  });

  it('shares one household segment across all its non-archived members', () => {
    const householdMembers = getHouseholdMembers('hh-petrov').filter((m) => !m.archivedAt);
    const segments = new Set(householdMembers.map((m) => segmentForMember(m.id)));
    expect(segments).toEqual(new Set(['current']));
  });

  it('covers all three segments across the demo roster', () => {
    const segments = new Set(members.map((m) => segmentForMember(m.id)));
    expect(segments).toEqual(new Set(['current', 'lapsed', 'archived']));
  });
});

describe('getMembershipsForHousehold', () => {
  it('sorts most-recent season first', () => {
    const seasons = getMembershipsForHousehold('hh-larsen').map((m) => m.season);
    expect(seasons).toEqual([...seasons].sort((a, b) => b - a));
    expect(seasons[0]).toBe(CURRENT_SEASON);
  });
});

describe('getPaymentForMembership', () => {
  it('finds the payment for a real membership', () => {
    const [membership] = getMembershipsForHousehold('hh-larsen');
    expect(getPaymentForMembership(membership.id)?.status).toBe('paid');
  });

  it('returns undefined for a bad membership id', () => {
    expect(getPaymentForMembership('ms-does-not-exist')).toBeUndefined();
  });
});

describe('class-credit ledger', () => {
  it('has one household with an unspent credit from a prior year (the delayed-use case)', () => {
    expect(creditBalance('hh-larsen')).toBe(1);
    const redemptions = getCreditRedemptionsForHousehold('hh-larsen');
    expect(redemptions).toHaveLength(1);
    expect(new Date(redemptions[0].redeemedAt).getFullYear()).toBeLessThan(CURRENT_SEASON - 1);
  });

  it('has one household with every granted credit already spent', () => {
    expect(creditBalance('hh-petrov')).toBe(0);
  });

  it('sizes a grant by tier', () => {
    const larsenGrant = getCreditGrantsForHousehold('hh-larsen')[0];
    expect(larsenGrant.amount).toBe(CREDIT_GRANT_AMOUNT.family);
    const halvorsenGrant = getCreditGrantsForHousehold('hh-halvorsen')[0];
    expect(halvorsenGrant.amount).toBe(CREDIT_GRANT_AMOUNT.individual);
  });

  it('never goes negative for any household in the fixture', () => {
    for (const household of households) {
      expect(creditBalance(household.id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('takes no segment or season input at all, the "never expires" guarantee by construction', () => {
    expect(creditBalance).toHaveLength(1);
  });
});

describe('ageInSeason', () => {
  it('computes a Young Adult member as inside the eligibility window', () => {
    const priya = getMember('mem-priya-yamada')!;
    const age = ageInSeason(priya.birthdate, CURRENT_SEASON);
    expect(age).toBeGreaterThanOrEqual(YOUNG_ADULT_MIN_AGE);
    expect(age).toBeLessThanOrEqual(YOUNG_ADULT_MAX_AGE);
  });

  it('computes a family dependent as under the Young Adult window', () => {
    const nikolai = getMember('mem-nikolai-petrov')!;
    expect(ageInSeason(nikolai.birthdate, CURRENT_SEASON)).toBeLessThan(YOUNG_ADULT_MIN_AGE);
  });
});

describe('signup-review queue', () => {
  it('references a real member for every review', () => {
    for (const review of signupReviews) {
      expect(getMember(review.memberId), `${review.id} has no member`).toBeDefined();
    }
  });

  it('starts every fixture review pending, with one pre-flagged', () => {
    const flagged = signupReviews.filter((review) => review.flagNote !== null);
    expect(flagged).toHaveLength(1);
    expect(pendingSignupReviews()).toHaveLength(signupReviews.length);
  });

  it('sorts pending reviews oldest submitted first', () => {
    const pending = pendingSignupReviews();
    const submittedDates = pending.map((review) => review.submittedAt);
    expect(submittedDates).toEqual([...submittedDates].sort());
  });

  it('approves as an acknowledging no-op: cleared, no reason recorded', () => {
    const review = signupReviews.find((r) => r.id === 'review-oyelaran-2026')!;
    expect(review.outcome).toBeNull();
    const resolved = resolveSignupReview('review-oyelaran-2026', 'approved', { reviewedBy: 'owner@example.com' });
    expect(resolved.outcome).toBe('approved');
    expect(resolved.reason).toBeNull();
    expect(resolved.reviewedBy).toBe('owner@example.com');
    expect(pendingSignupReviews().find((r) => r.id === 'review-oyelaran-2026')).toBeUndefined();
    expect(reviewedThisSeasonCount()).toBeGreaterThan(0);
  });

  it('denies only with a non-empty reason, recording it', () => {
    expect(() => resolveSignupReview('review-marchetti-2026', 'denied', { reviewedBy: 'owner@example.com' })).toThrow();
    expect(() =>
      resolveSignupReview('review-marchetti-2026', 'denied', { reason: '   ', reviewedBy: 'owner@example.com' }),
    ).toThrow();
    const resolved = resolveSignupReview('review-marchetti-2026', 'denied', {
      reason: 'Household address could not be verified.',
      reviewedBy: 'owner@example.com',
    });
    expect(resolved.outcome).toBe('denied');
    expect(resolved.reason).toBe('Household address could not be verified.');
  });

  it('throws for a review id that does not exist', () => {
    expect(() => resolveSignupReview('review-does-not-exist', 'approved', { reviewedBy: 'owner@example.com' })).toThrow();
  });

  it('finds a review by id, or undefined for a bad one', () => {
    expect(getSignupReview('review-drummond-2026')).toBeDefined();
    expect(getSignupReview('review-does-not-exist')).toBeUndefined();
  });
});
