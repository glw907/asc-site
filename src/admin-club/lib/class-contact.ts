// Guardian-routing contact resolution, shared by every class-related send: the welcome email
// (fired synchronously from `enrollments.ts`'s `signUpForClass` and `offers.ts`'s `claimOffer`,
// the two enrollment actions) and the class-reminder and refund-window-notice cron jobs
// (`src/jobs/class-reminders.ts`, `src/jobs/class-refund-window-notice.ts`). One shared resolver
// so "who does a class-related email about this participant go to" is answered identically
// everywhere, rather than four places each reimplementing the same guardian rule.
import type { D1Database } from '@cloudflare/workers-types';
import type { ClassTrack } from './classes-store';

export interface ClassContact {
  email: string;
  name: string;
}

interface MemberRow {
  name: string;
  email: string | null;
  household_id: string;
}

/**
 * Resolve who to notify about one enrolled member's class-related send. Geoff's 2026-07-08 ruling
 * ("guardian-routed when the enrollee is a minor: email the household's primary/guardian, not the
 * child"): `classes.track === 'youth'` is the schema's own existing age gate (8-12, versus
 * `adult-teen`'s 13+), so a youth-track enrollment always routes to its household's own primary
 * member, the same household-level fallback `renewal-reminders.ts`'s own `resolveHouseholdContact`
 * already trusts, rather than the enrollee's own `members.email` (nullable precisely because "a
 * covered child may have none", `members`' own migration 0005_member_domain comment). An
 * adult-teen enrollment routes to the member's own email when it has one, falling back to the
 * household's primary member only if it does not (an adult member with no email on file is
 * unusual but not disallowed by the schema).
 *
 * `class_enrollments.guardian_contact` (0001_substrate) exists in the schema for exactly this
 * case but has no write path populating it yet, a pre-existing gap this pass does not build a
 * form for (out of scope, per the mid-pass ruling's own "don't block on it"); this resolver reads
 * the household's primary member instead, a signal that is always populated once a household
 * exists at all.
 */
export async function resolveClassContact(db: D1Database, memberId: string, track: ClassTrack): Promise<ClassContact | null> {
  const member = await db
    .prepare('SELECT name, email, household_id FROM members WHERE id = ?1 AND archived_at IS NULL')
    .bind(memberId)
    .first<MemberRow>();
  if (!member) return null;

  if (track !== 'youth' && member.email) return { email: member.email, name: member.name };

  const household = await db
    .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
    .bind(member.household_id)
    .first<{ primary_member_id: string | null }>();
  if (household?.primary_member_id) {
    const primary = await db
      .prepare('SELECT name, email FROM members WHERE id = ?1 AND archived_at IS NULL')
      .bind(household.primary_member_id)
      .first<{ name: string; email: string | null }>();
    if (primary?.email) return { email: primary.email, name: primary.name };
  }
  return null;
}
