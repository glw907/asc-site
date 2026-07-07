// asc-club member auth: the member portal landing's own household-standing derivation (pass
// 2.2's portal, Part 3's "signed-in landing" — this task keeps the landing auth-focused and
// defers the full task-list/receipts composition to a later pass; only the standing card's own
// data derives here). A MEMBERSHIP is the household's per-season purchase
// (0005_member_domain's own header): standing is a HOUSEHOLD fact every member of it shares,
// derived, never a stored status flag.
//
// Derivation is ROLLING, not season-boundary (Geoff's mid-pass 2026-07-07 correction, superseding
// this task's own original "April 30 <season+1>" draft): a household's standing derives from its
// own most recently paid `memberships` row's `paid_at`, plus one year — "Current through
// <paid_at + 1 year>" — never from the calendar-aligned `season` column, which stays on the row
// purely as the period label a renewal or the MembershipWorks import assigned it. A household
// past that boundary sits in a 'grace' standing for `getRenewalGraceDays` days
// (`$admin-club/lib/club-settings.ts`, a Club setting, default 30) before finally reading as
// 'lapsed': the asset-retention and renewal-reminder work the correction names both key on the
// same three-state distinction.
//
// This module imports `getRenewalGraceDays` from `$admin-club/lib/club-settings`: that module is
// shared club-wide settings infrastructure, not the club-admin surface itself (its own
// `getOfferWindowHours` already has a non-admin consumer, `src/admin-club/lib/offers.ts`'s public
// `offerSpot`), so reading one more of its getters here does not blur member-auth's own
// admin-club-independent boundary the way importing an admin-only module would.
import type { D1Database } from '@cloudflare/workers-types';
import { getRenewalGraceDays } from '$admin-club/lib/club-settings';
import { toSqliteDatetime } from './crypto';

/** The three membership tiers, matching the ratified schema's own `memberships.tier` CHECK
 *  constraint (`migrations/asc-club/0005_member_domain/forward.sql`). */
export type MembershipTier = 'individual' | 'family' | 'young-adult';

/** Display labels for the three tiers, for a landing page's own "Individual membership" line. */
export const MEMBERSHIP_TIER_LABEL: Record<MembershipTier, string> = {
  individual: 'Individual',
  family: 'Family',
  'young-adult': 'Young Adult',
};

/** A household's renewal standing: `'current'` through its paid boundary, `'grace'` for
 *  `getRenewalGraceDays` days past it, `'lapsed'` after that. */
export type MemberStandingStatus = 'current' | 'grace' | 'lapsed';

export interface MemberStanding {
  memberId: string;
  memberName: string;
  householdId: string;
  householdName: string;
  status: MemberStandingStatus;
  /** The most recently paid membership row's tier, or `null` if the household has never had one. */
  tier: MembershipTier | null;
  /** The grounding row's own `season` label (the period a renewal or the import assigned it):
   *  display only, never used to derive a date (see this module's own header). `null` alongside
   *  `tier` when there is no paid row at all. */
  season: number | null;
  /** `paid_at` plus one year, SQLite-datetime shaped (`toSqliteDatetime`'s own format); `null`
   *  when there is no paid row to derive from. */
  expiresOn: string | null;
  /** `expiresOn` plus the grace window; `null` alongside `expiresOn`. */
  graceEndsOn: string | null;
  /** The plain-words line the standing card leads with (design doc's own "The standing card"
   *  section), e.g. "Current through July 7, 2027" or "Your membership lapsed July 7, 2026 ·
   *  renew by August 6, 2026 to avoid a gap". */
  statusLine: string;
}

interface MemberBaseRow {
  id: string;
  household_id: string;
  name: string;
}

interface HouseholdRow {
  name: string;
}

interface PaidMembershipRow {
  tier: MembershipTier;
  season: number;
  paid_at: string;
}

const LONG_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/** Format a Date as a long civil date ("July 7, 2027"), reading it as UTC: every date this module
 *  computes derives from a `toSqliteDatetime`-shaped UTC string, so the display must read the
 *  same civil date back, never a locally-shifted one. */
function formatCivilDate(date: Date): string {
  return LONG_DATE.format(date);
}

/** Parse a stored `paid_at` value into a `Date`, accepting either a bare civil date
 *  ("YYYY-MM-DD") or this schema's own full SQLite-datetime shape ("YYYY-MM-DD HH:MM:SS"),
 *  reading both as UTC (mirrors the offer claim page's own `formatExpiry` parsing convention:
 *  `sqliteDatetime.replace(' ', 'T') + 'Z'`). `paid_at` has shipped no write path yet as of this
 *  migration, so its exact shape is not yet fixed by any real writer; this accepts either. */
function parseStoredDate(value: string): Date {
  const iso = value.length <= 10 ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

/** `date`, one calendar year later (same month and day; JS `Date`'s own rollover handles a Feb 29
 *  boundary, not specially guarded here since no membership pricing or policy hinges on that
 *  single day). */
function plusOneYear(date: Date): Date {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * A household's renewal standing, read through one of its members (`memberId`). Resolves the
 * member's household, then that household's most recently paid `memberships` row (by `paid_at`,
 * not `season`: this module's own header on why), and derives `status`/`expiresOn`/`graceEndsOn`
 * from that row's `paid_at` plus one year and the Club's own `renewal_grace_days` setting.
 * Returns `null` only when `memberId` itself does not resolve to a real `members` row; a member
 * whose household has never had a single paid membership row still resolves, with `status:
 * 'lapsed'`, `tier`/`season`/`expiresOn`/`graceEndsOn` all `null`, and a neutral status line.
 */
export async function getMemberStanding(db: D1Database, memberId: string): Promise<MemberStanding | null> {
  const member = await db
    .prepare('SELECT id, household_id, name FROM members WHERE id = ?1 LIMIT 1')
    .bind(memberId)
    .first<MemberBaseRow>();
  if (!member) return null;

  const household = await db
    .prepare('SELECT name FROM households WHERE id = ?1 LIMIT 1')
    .bind(member.household_id)
    .first<HouseholdRow>();
  const householdName = household?.name ?? member.name;

  const paidRow = await db
    .prepare('SELECT tier, season, paid_at FROM memberships WHERE household_id = ?1 AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 1')
    .bind(member.household_id)
    .first<PaidMembershipRow>();

  if (!paidRow) {
    return {
      memberId: member.id,
      memberName: member.name,
      householdId: member.household_id,
      householdName,
      status: 'lapsed',
      tier: null,
      season: null,
      expiresOn: null,
      graceEndsOn: null,
      statusLine: 'No membership on file yet.',
    };
  }

  const graceDays = await getRenewalGraceDays(db);
  const expiry = plusOneYear(parseStoredDate(paidRow.paid_at));
  const graceEnd = plusDays(expiry, graceDays);
  const now = new Date();

  const status: MemberStandingStatus = now <= expiry ? 'current' : now <= graceEnd ? 'grace' : 'lapsed';
  const statusLine =
    status === 'current'
      ? `Current through ${formatCivilDate(expiry)}`
      : status === 'grace'
        ? `Your membership lapsed ${formatCivilDate(expiry)} · renew by ${formatCivilDate(graceEnd)} to avoid a gap`
        : `Your membership lapsed ${formatCivilDate(expiry)}`;

  return {
    memberId: member.id,
    memberName: member.name,
    householdId: member.household_id,
    householdName,
    status,
    tier: paidRow.tier,
    season: paidRow.season,
    expiresOn: toSqliteDatetime(expiry),
    graceEndsOn: toSqliteDatetime(graceEnd),
    statusLine,
  };
}
