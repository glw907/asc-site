// The portal's own age-gate math (docs/2026-07-07-member-portal-design.md's "Who's taking this
// class?" section): a class's `track` (`$admin-club/lib/classes-store.ts`'s `ClassTrack`, 'youth'
// 8-12 or 'adult-teen' 13+) gates which household member a parent may enroll. Deliberately its
// own small module rather than folded into `classes-store.ts` (an admin-club module): the portal
// reads real birthdates off real `members` rows (0005_member_domain), and the age math itself has
// no club-admin dependency at all.
//
// `member-signup/lib/validate.ts`'s `ageAsOf` is a near-identical age calculation elsewhere in the
// codebase, but answers a different question (Young Adult tier eligibility as of "today") with a
// different reference date than this module's plain age-as-of-a-given-moment, the shape a live
// class-registration screen needs.
import type { ClassTrack } from '$admin-club/lib/classes-store';

/** The youth track's own age window (design doc: "youth 8-12"). */
export const YOUTH_MIN_AGE = 8;
export const YOUTH_MAX_AGE = 12;

/** The adult/teen track's own floor (design doc: "teen/adult 13+"); no ceiling. */
export const ADULT_TEEN_MIN_AGE = 13;

/**
 * A person's age in whole years as of `asOf` (defaults to now), from a civil-date birthdate
 * ("YYYY-MM-DD"). Read as UTC, matching `standing.ts`'s own `parseStoredDate` convention for
 * every other stored civil date in this schema.
 */
export function computeAge(birthdate: string, asOf: Date = new Date()): number {
  const born = new Date(`${birthdate}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthdayThisYear =
    asOf.getUTCMonth() < born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() && asOf.getUTCDate() < born.getUTCDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Whether a person of the given age is eligible for `track`. The youth track is a closed window
 * (8-12 inclusive); the adult/teen track is an open floor (13+, no ceiling) — an adult signing up
 * for an adult/teen class is always eligible regardless of age.
 */
export function isAgeEligibleForTrack(age: number, track: ClassTrack): boolean {
  if (track === 'youth') return age >= YOUTH_MIN_AGE && age <= YOUTH_MAX_AGE;
  return age >= ADULT_TEEN_MIN_AGE;
}

/** One household member's own eligibility for a class's track, the selector's own per-row need:
 *  eligible outright with a birthdate on file, ineligible outright (with the reason understood
 *  through `age`, not surfaced as a separate string here — the caller's own copy names it),
 *  or `needsBirthdate` when the member has none on file yet (the design doc's own "a member with
 *  no birthdate on file gets asked for it here"). */
export type EnrolleeEligibility = { eligible: true } | { eligible: false; needsBirthdate: true } | { eligible: false; needsBirthdate: false; age: number };

/** Resolve one household member's eligibility for `track`, as of `asOf`. */
export function eligibilityForTrack(birthdate: string | null, track: ClassTrack, asOf: Date = new Date()): EnrolleeEligibility {
  if (!birthdate) return { eligible: false, needsBirthdate: true };
  const age = computeAge(birthdate, asOf);
  if (isAgeEligibleForTrack(age, track)) return { eligible: true };
  return { eligible: false, needsBirthdate: false, age };
}
