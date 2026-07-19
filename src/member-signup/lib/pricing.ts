// The join engine's dues-plus-classes pricing math (Task 1): pure, no D1 reads, so it is
// trivially unit-testable and reusable by both the join form's running total and the checkout's
// own line-item build (Task 2). Tier prices arrive as whole-dollar settings values (matching
// `club-settings.ts`'s `getTierPrices`); every amount this module produces is integer cents, per
// the plan's own money convention.
import type { MembershipTier } from '$admin-club/lib/member-types';
import type { JoinPricingResult, NormalizedJoinInput } from './types.js';

/** How many class credits a household receives when it joins at each tier (the design's ruling
 *  3): two for family, one for either individual tier. Renewals never grant these again; that
 *  decision belongs to the caller (`reconcileJoin`'s `grant_credits` flag, Task 2), not this
 *  pure function, which always reports what the tier itself is worth. Exported (member-waivers
 *  T5c) so the shared join-checkout builder (`join-checkout.ts`) applies credits in the SAME
 *  pick order this pricing function does, whether the checkout is built at submit or rebuilt at
 *  the payment-resume unlock. */
export const CREDIT_GRANT_AMOUNT: Record<MembershipTier, number> = {
  individual: 1,
  family: 2,
  'young-adult': 1,
};

/**
 * Prices one join submission: the dues line from the tier's settings price, then each class pick
 * in pick order (`classPicks`'s own array order, the design's "credits applied in pick order"
 * rule) either covered by one of the tier's credits or priced against `classFees` (a class id ->
 * whole-dollar fee map, the same unit `classes.fee` stores). `prices` and `classFees` are both
 * whole dollars; every cents amount here is `Math.round(dollars * 100)`, so a caller never needs
 * to reconvert. A class id missing from `classFees` prices as free (0 cents) rather than
 * throwing, since a caller building this map from live fullness/fee facts controls what it
 * includes.
 */
export function computeJoinPricing(
  input: NormalizedJoinInput,
  prices: Record<MembershipTier, number>,
  classFees: Map<string, number>,
): JoinPricingResult {
  const duesCents = Math.round(prices[input.tier] * 100);
  const creditsGranted = CREDIT_GRANT_AMOUNT[input.tier];

  const coveredPicks: number[] = [];
  const paidPicks: JoinPricingResult['paidPicks'] = [];
  let creditsRemaining = creditsGranted;

  input.classPicks.forEach((pick, pickIndex) => {
    if (creditsRemaining > 0) {
      coveredPicks.push(pickIndex);
      creditsRemaining -= 1;
      return;
    }
    const feeDollars = classFees.get(pick.classId) ?? 0;
    paidPicks.push({ pickIndex, amountCents: Math.round(feeDollars * 100) });
  });

  const totalCents = duesCents + paidPicks.reduce((sum, pick) => sum + pick.amountCents, 0);

  return { duesCents, creditsGranted, coveredPicks, paidPicks, totalCents };
}
