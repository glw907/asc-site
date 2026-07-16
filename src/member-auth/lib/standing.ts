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
import { formatMemberDate, parseMemberDate } from './format';

// REFUND-AWARE (migration 0023, docs/plans/2026-07-14-membership-admin.md Task 2): every
// membership lookup in this module carries AND refunded_at IS NULL, so a refunded row reads as
// though it never existed for standing purposes (ruling 4 in the design doc: refunds mark, never
// delete, so the row itself stays for history; only its effect on standing disappears). The
// household-keyed entry point below, getHouseholdStanding, is what the admin's Members list and
// the class/join doors' gate share alongside the member-keyed getMemberStanding, so the admin and
// the public doors can never disagree about who is current.

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
  price_paid: number;
}

/** A household's renewal standing, keyed by household id rather than a member: `'none'` when the
 *  household has never had a non-refunded paid `memberships` row (a state {@link getMemberStanding}
 *  folds into its own `'lapsed'` for a member-facing landing, but the admin's Members list needs
 *  distinct from a household that simply lapsed). */
export type HouseholdStandingStatus = 'current' | 'grace' | 'lapsed' | 'none';

export interface HouseholdStanding {
  status: HouseholdStandingStatus;
  /** The grounding row's own `season` label, display only; `null` when `status` is `'none'`. */
  lastSeason: number | null;
  /** The grounding row's tier; `null` when `status` is `'none'`. */
  tier: MembershipTier | null;
  /** The grounding row's `price_paid` snapshot (dollars), honestly reflecting a comp ($0) or a
   *  discount off the settings price; `null` when `status` is `'none'`. */
  pricePaid: number | null;
  /** The grounding row's `paid_at`, raw (not the derived expiry); `null` when `status` is `'none'`. */
  paidAt: string | null;
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

interface StandingWindow {
  status: 'current' | 'grace' | 'lapsed';
  expiry: Date;
  graceEnd: Date;
}

/** The current/grace/lapsed transition, computed once off a grounding row's `paid_at` and the
 *  Club's `renewal_grace_days` setting: shared by {@link getHouseholdStanding} (status only) and
 *  {@link getMemberStanding} (status plus the display-shaped `expiresOn`/`graceEndsOn`/`statusLine`)
 *  so the boundary math lives in exactly one place. */
async function standingWindowFor(db: D1Database, paidAt: string, now: Date): Promise<StandingWindow> {
  const graceDays = await getRenewalGraceDays(db);
  const expiry = plusOneYear(parseMemberDate(paidAt));
  const graceEnd = plusDays(expiry, graceDays);
  const status: 'current' | 'grace' | 'lapsed' = now <= expiry ? 'current' : now <= graceEnd ? 'grace' : 'lapsed';
  return { status, expiry, graceEnd };
}

/**
 * A household's renewal standing, keyed directly by `householdId` (no member lookup): `'none'`
 * when the household has never had a non-refunded paid `memberships` row, otherwise
 * current/grace/lapsed off its most recently paid such row's `paid_at` (the same rolling math this
 * module's own header describes). Every membership query in this module, this one included, carries
 * `AND refunded_at IS NULL`: a refunded row never grounds a household's standing, so a household
 * whose only paid row for the current season was refunded reads `'lapsed'` (against an older
 * non-refunded row) or `'none'` (if it has no other paid row), never `'current'`.
 */
export async function getHouseholdStanding(db: D1Database, householdId: string): Promise<HouseholdStanding> {
  const paidRow = await db
    .prepare(
      'SELECT tier, season, paid_at, price_paid FROM memberships WHERE household_id = ?1 AND paid_at IS NOT NULL AND refunded_at IS NULL ORDER BY paid_at DESC LIMIT 1',
    )
    .bind(householdId)
    .first<PaidMembershipRow>();

  if (!paidRow) {
    return { status: 'none', lastSeason: null, tier: null, pricePaid: null, paidAt: null };
  }

  const { status } = await standingWindowFor(db, paidRow.paid_at, new Date());
  return {
    status,
    lastSeason: paidRow.season,
    tier: paidRow.tier,
    pricePaid: paidRow.price_paid,
    paidAt: paidRow.paid_at,
  };
}

/**
 * A household's renewal boundary, one calendar year past its most recently paid `memberships`
 * row's `paid_at`: the same math {@link getMemberStanding} derives `expiresOn` from, exported so
 * the renewal-reminder job (`src/jobs/renewal-reminders.ts`) can compute it directly off a batch
 * of household rows without re-deriving the date parsing or paying a per-household
 * `getMemberStanding` lookup (which needs a `memberId`, not a bare `paid_at`) it has no other use
 * for.
 */
export function renewalExpiryFrom(paidAt: string): Date {
  return plusOneYear(parseMemberDate(paidAt));
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

  const standing = await getHouseholdStanding(db, member.household_id);

  if (standing.status === 'none' || standing.paidAt === null) {
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

  const { status, expiry, graceEnd } = await standingWindowFor(db, standing.paidAt, new Date());
  const statusLine =
    status === 'current'
      ? `Current through ${formatMemberDate(expiry)}`
      : status === 'grace'
        ? `Your membership lapsed ${formatMemberDate(expiry)} · renew by ${formatMemberDate(graceEnd)} to avoid a gap`
        : `Your membership lapsed ${formatMemberDate(expiry)}`;

  return {
    memberId: member.id,
    memberName: member.name,
    householdId: member.household_id,
    householdName,
    status,
    tier: standing.tier,
    season: standing.lastSeason,
    expiresOn: toSqliteDatetime(expiry),
    graceEndsOn: toSqliteDatetime(graceEnd),
    statusLine,
  };
}
