// The unified-signup engine's shared vocabulary (Task 1, docs/2026-07-13-unified-signup-design.md):
// one shape for the public join form's raw submission, the normalized/validated form
// `validate.ts` produces, the pricing math `pricing.ts` produces, and the batch `statements.ts`
// builds from both. Later tasks (the `/join/apply` route, the class-door pivot, welcome-back
// renewal) import these exact names, so nothing here renames or reshapes without touching every
// consumer.
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import type { MembershipTier } from '$admin-club/lib/member-types';

/** The purchaser's own details, as the join form collects them: `memberIndex: 0` in
 *  {@link JoinClassPick} always refers to this person. Only the purchaser accepts the waiver
 *  (`JoinInput.waiverAccepted`); every other household member is covered by that one acceptance,
 *  matching the design's "the purchaser accepts the waiver at join" ruling. */
export interface JoinPurchaser {
  name: string;
  email: string;
  phone?: string;
  /** Required (and checked under 26 at submission) for the young-adult tier; unused otherwise. */
  birthdate?: string;
}

/** An additional household member, family tier only: name and birthdate for age-relevant class
 *  tracks, email optional (a dependent may have none). */
export interface JoinMember {
  name: string;
  birthdate?: string;
  email?: string;
}

/** One class selection for one household member. `memberIndex` indexes the combined roster the
 *  purchaser and `JoinInput.members` together form: `0` is always the purchaser, `1` is
 *  `members[0]`, `2` is `members[1]`, and so on. */
export interface JoinClassPick {
  memberIndex: number;
  classId: string;
}

/** The join form's raw submission, before {@link validateJoinInput} normalizes and checks it. */
export interface JoinInput {
  tier: MembershipTier;
  purchaser: JoinPurchaser;
  /** Additional household members beyond the purchaser. The family tier accepts these; the
   *  individual and young-adult tiers reject a non-empty array (each covers one person only). */
  members: JoinMember[];
  classPicks: JoinClassPick[];
  waiverAccepted: boolean;
}

/** {@link JoinPurchaser}, normalized: email lowercased, phone E.164 where parseable (or the
 *  trimmed raw value otherwise, `normalizePhoneE164`'s own live-write-path fallback), name
 *  conservatively recased, an absent optional field turned into an explicit `null`. */
export interface NormalizedPurchaser {
  name: string;
  email: string;
  phone: string | null;
  birthdate: string | null;
}

/** {@link JoinMember}, normalized the same way as {@link NormalizedPurchaser} (no phone field:
 *  the join form never collects one for anyone but the purchaser). */
export interface NormalizedMember {
  name: string;
  birthdate: string | null;
  email: string | null;
}

/** {@link JoinInput} once {@link validateJoinInput} has normalized every field. This is the shape
 *  {@link computeJoinPricing} and {@link buildJoinStatements} both consume, so pricing and the
 *  write batch never re-derive normalization or re-check the rules {@link validateJoinInput}
 *  already enforced. */
export interface NormalizedJoinInput {
  tier: MembershipTier;
  purchaser: NormalizedPurchaser;
  members: NormalizedMember[];
  classPicks: JoinClassPick[];
  waiverAccepted: boolean;
}

/** {@link validateJoinInput}'s outcome: `errors` is always populated with every rule violation
 *  found (not just the first), so a form can show them all at once. `normalized` is present only
 *  when `valid` is `true`; a caller must never build statements or price a failed validation. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalized: NormalizedJoinInput | null;
}

/** One class pick {@link computeJoinPricing} priced against a credit, identified by its index
 *  into {@link NormalizedJoinInput.classPicks} (pick order, the order credits apply in). */
export type CoveredPickIndex = number;

/** One class pick {@link computeJoinPricing} could not cover with a credit, priced against the
 *  class's own fee instead. */
export interface PaidPick {
  pickIndex: number;
  amountCents: number;
}

/** {@link computeJoinPricing}'s result: the dues line, how many credits the tier grants, which
 *  picks (by index into `classPicks`) those credits covered, which picks still need a class-fee
 *  line and for how much, and the checkout's grand total. */
export interface JoinPricingResult {
  duesCents: number;
  creditsGranted: number;
  coveredPicks: CoveredPickIndex[];
  paidPicks: PaidPick[];
  totalCents: number;
}

/** {@link buildJoinStatements}'s own inputs beyond the validated form and its pricing: the season
 *  the new membership row belongs to, the waiver wording version to stamp the purchaser's
 *  acceptance with, and which of the picked classes are already full (so that pick lands in
 *  `class_waitlist` instead of `class_enrollments`). */
export interface BuildJoinStatementsOptions {
  season: number;
  waiverVersion: string;
  fullClassIds: Set<string>;
}

/** {@link buildJoinStatements}'s result: the ordered statements for one `db.batch()`, the new
 *  membership's id (a `join`-kind checkout's `refId`), the enrollment/waitlist ids created, in
 *  pick order, for whichever outcome each pick landed in, and the purchaser's own new member id
 *  (the `join`-kind checkout's `purchaser_member_id` metadata, Task 2's own contract; every id
 *  this module mints is otherwise internal, so the caller needs this one back to build that
 *  metadata without re-deriving or re-minting it). */
export interface BuildJoinStatementsResult {
  statements: D1PreparedStatement[];
  membershipId: string;
  enrollmentIds: string[];
  waitlistIds: string[];
  purchaserMemberId: string;
}
