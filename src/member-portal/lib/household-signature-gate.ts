// The household-complete signature gate (member-waivers T5a, docs/2026-07-17-member-waivers-
// design.md ratified decision 7 AS AMENDED 2026-07-18): a pure derivation, beside the T3
// requirement engine (`waiver-requirements.ts`), turning one season's `HouseholdRequirements`
// into the household-complete answer the money-moment flows (join, renewal, class registration)
// gate on. A signature is always personal (rule 2's "one adult never signs for another"); the
// household is complete only once every adult's own applicable documents and every minor's own
// Part Two election are on file. Because signatures precede payment everywhere, an incomplete
// household simply stays incomplete -- nothing is held, expired, or refunded (the design's own
// "no board policy needed" framing).
//
// This module takes `HouseholdRequirements` as its only input, not a separate members list: the
// T3 engine already lists every adult (even one with an empty `requirements` array) and every
// minor's own outstanding Part Two entries, so the gate has everything it needs from that one
// shape. When the season has no published documents (the shipped state, since every real
// document is still `status: draft`), `deriveHouseholdRequirements` returns every adult with an
// empty `requirements` array and an empty `minors` list, which this module reads as complete with
// nothing remaining -- the money-moment flows proceed exactly as they do today, with no signing
// step and no waiting state.
import type { HouseholdRequirements } from './waiver-requirements';

/** One household member with at least one outstanding signature, as the waiting state names them.
 *  `role` distinguishes an adult (who signs their own outstanding documents) from a minor (whose
 *  outstanding Part Two elections wait on any adult's signature, never their own -- a minor never
 *  signs); `outstandingCount` is how many documents remain for that person. */
export interface RemainingHouseholdMember {
  memberId: string;
  name: string;
  role: 'adult' | 'minor';
  outstandingCount: number;
}

/** The gate's own answer for one household's one season: whether every applicable signature is
 *  on file, who still owes one, and whether the money moment may proceed. `canProceedToPayment`
 *  mirrors `complete` today (the design's household-complete rule ties the two together
 *  directly); kept as its own field rather than folded into `complete` so a caller reads the
 *  money-moment question by name, and so a future gate condition beyond completeness (should one
 *  ever arise) has a seam to land in without renaming this one. */
export interface HouseholdSignatureGateResult {
  complete: boolean;
  remaining: RemainingHouseholdMember[];
  canProceedToPayment: boolean;
}

/**
 * Derive the household-complete gate from one season's {@link HouseholdRequirements}. An adult
 * appears in `remaining` when any of their own requirements (personal `all-members` documents,
 * plus, for the household's primary, the household-wide asset-kind/dry-storage documents) is
 * unsigned. A minor appears in `remaining` when any of their own Part Two elections is unsigned,
 * counted once per minor regardless of how many release documents open one (today, at most one).
 * The household is `complete` only when `remaining` is empty -- every adult and every minor
 * accounted for.
 */
export function householdSignatureGate(requirements: HouseholdRequirements): HouseholdSignatureGateResult {
  const remaining: RemainingHouseholdMember[] = [];

  for (const adult of requirements.adults) {
    const outstandingCount = adult.requirements.filter((requirement) => !requirement.signed).length;
    if (outstandingCount > 0) {
      remaining.push({ memberId: adult.memberId, name: adult.memberName, role: 'adult', outstandingCount });
    }
  }

  const outstandingByMinor = new Map<string, { name: string; outstandingCount: number }>();
  for (const minor of requirements.minors) {
    if (minor.signed) continue;
    const entry = outstandingByMinor.get(minor.minorMemberId) ?? { name: minor.minorName, outstandingCount: 0 };
    entry.outstandingCount += 1;
    outstandingByMinor.set(minor.minorMemberId, entry);
  }
  for (const [memberId, { name, outstandingCount }] of outstandingByMinor) {
    remaining.push({ memberId, name, role: 'minor', outstandingCount });
  }

  const complete = remaining.length === 0;
  return { complete, remaining, canProceedToPayment: complete };
}
