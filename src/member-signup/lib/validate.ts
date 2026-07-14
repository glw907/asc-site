// The join engine's own input gate (Task 1): every rule the design's join flow states as a
// submission-time requirement (docs/2026-07-13-unified-signup-design.md, "The join flow" and
// rulings 2-3), checked in one pass and reported together, so a form can show every problem at
// once rather than one round trip per error. Field normalization (email lowercased, phone E.164,
// name conservatively recased) reuses the same helpers `people.ts`'s `ensureMember` and the
// portal's own write paths already use, per the plan's global constraint that member data
// regularizes on every write path.
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from '$admin-club/lib/member-normalize.js';
import type { JoinInput, JoinMember, JoinPurchaser, NormalizedMember, NormalizedPurchaser, ValidationResult } from './types.js';

/** The young-adult tier's own eligibility ceiling (the design's ruling 3: "under 26, includes
 *  one class credit"): a purchaser whose age at submission has already reached this many years
 *  is not eligible, including on their exact birthday. */
const YOUNG_ADULT_MAX_AGE = 26;

/** The most class picks one join submission may carry. A checkout session's own metadata
 *  carries `enrollment_ids`/`covered_enrollment_ids`/`paid_fee_cents` as comma-joined lists
 *  bound to Stripe's 500-character-per-value limit; this cap keeps every list well under that
 *  ceiling regardless of id length. A genuinely larger group is rare enough that a friendly
 *  refusal pointing them at the club directly is the right shape, not a form that silently
 *  truncates or a checkout that silently fails at Stripe's own limit. */
export const MAX_CLASS_PICKS = 8;

/**
 * A person's age in whole years as of `asOfIso`, counting a birthday that lands ON `asOfIso`
 * itself as already had (so turning 26 today reads as 26, not 25): the edge case the design's
 * own age gate must get right, since "under 26" is a strict inequality on the computed age.
 */
function ageAsOf(birthdateIso: string, asOfIso: string): number {
  const born = new Date(`${birthdateIso}T00:00:00Z`);
  const asOf = new Date(`${asOfIso}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const hasHadBirthday =
    asOf.getUTCMonth() > born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() && asOf.getUTCDate() >= born.getUTCDate());
  if (!hasHadBirthday) age -= 1;
  return age;
}

function normalizePurchaser(purchaser: JoinPurchaser): NormalizedPurchaser {
  return {
    name: normalizeNameCaps(purchaser.name.trim()),
    email: normalizeEmail(purchaser.email),
    phone: purchaser.phone ? (normalizePhoneE164(purchaser.phone) ?? purchaser.phone.trim()) : null,
    birthdate: purchaser.birthdate?.trim() || null,
  };
}

function normalizeMember(member: JoinMember): NormalizedMember {
  return {
    name: normalizeNameCaps(member.name.trim()),
    birthdate: member.birthdate?.trim() || null,
    email: member.email ? normalizeEmail(member.email) : null,
  };
}

/**
 * Validates and normalizes a join submission per the design's own rules: the purchaser accepts
 * the current waiver (ruling 4); the young-adult tier requires a purchaser birthdate showing
 * under {@link YOUNG_ADULT_MAX_AGE} as of `today` (ruling 3); only the family tier may carry
 * additional household members (ruling 2, since the individual and young-adult tiers each cover
 * one person); every class pick's `memberIndex` must resolve to a real household member (`0` the
 * purchaser, `1` and up `members[0]`, `members[1]`, ...). Every violation is collected, not just
 * the first, so a form can surface them all together. `normalized` is populated only when every
 * rule passes; a caller must never price or write statements from a failed result.
 */
export function validateJoinInput(input: JoinInput, opts: { today: string }): ValidationResult {
  const errors: string[] = [];

  if (!input.purchaser.name.trim()) errors.push('A name is required.');
  if (!input.purchaser.email.trim()) errors.push('An email address is required.');
  if (!input.waiverAccepted) errors.push('You must accept the waiver to join.');

  if (input.tier === 'young-adult') {
    if (!input.purchaser.birthdate) {
      errors.push('Young Adult membership requires a birthdate to verify eligibility.');
    } else if (ageAsOf(input.purchaser.birthdate, opts.today) >= YOUNG_ADULT_MAX_AGE) {
      errors.push('Young Adult membership is only available under 26.');
    }
  }

  if (input.tier !== 'family' && input.members.length > 0) {
    errors.push('Only the family tier can include additional household members.');
  }

  if (input.tier === 'family') {
    input.members.forEach((member, index) => {
      if (!member.name.trim()) errors.push(`Household member ${index + 1} needs a name.`);
    });
  }

  const rosterSize = 1 + input.members.length;
  input.classPicks.forEach((pick) => {
    if (pick.memberIndex < 0 || pick.memberIndex >= rosterSize) {
      errors.push('A class pick refers to a household member that was not entered.');
    }
  });

  if (input.classPicks.length > MAX_CLASS_PICKS) {
    errors.push(`You can select up to ${MAX_CLASS_PICKS} classes at once; for a larger group, please contact us.`);
  }

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      tier: input.tier,
      purchaser: normalizePurchaser(input.purchaser),
      members: input.members.map(normalizeMember),
      classPicks: input.classPicks,
      waiverAccepted: input.waiverAccepted,
    },
  };
}
