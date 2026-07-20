// The household-grouped Members screen's own reads against `households`, `members`,
// `memberships`, `asset_assignments`, and `class_enrollments` (Task 3, then the Members pass T7
// rebuild): the same thin, typed, `db`-as-parameter shape `classes-store.ts` and `assets-store.ts`
// already establish. No validation or audit lives here; the write paths (Task 5) and the audit
// emit (`clubAdminAction`'s `ctx.audit`) both stay in the route/action layer.
//
// STANDING (Current/Overdue/Former/none) reads through `member-auth/lib/standing.ts`'s own
// `classifyHouseholdStanding` (Members pass T3): the module's earlier independent duplication of
// the boundary math no longer holds once Former became a RECORDED fact
// (`households.former_at`/`former_source`, migration `0033_member_standing`) rather than a pure
// function of a `paid_at` window, so this module now reads that same recorded column and defers to
// the one classifier every consumer shares, rather than re-deriving a second, now-necessarily-
// divergent notion of "Former". `listHouseholds` still computes every household's status from ONE
// grounding query (a correlated subquery per household picks its own most recently paid,
// non-refunded `memberships` row, the same "grounding row" `getHouseholdStanding` reads one
// household at a time), never a per-row `getHouseholdStanding` call: the admin's 148-row list
// would otherwise cost 148 round trips.
//
// T7's screen rebuild (docs/2026-07-20-members-pass-design.md, "Row and expanded panel") folds the
// household desk's own expand-in-place panel data into this SAME call, rather than a second
// per-row fetch on expand: `ExpandableRow`'s own "receives the row's datum" contract means the
// panel snippet already has whatever `listHouseholds` returned for that row, so eagerly reading
// every household's holdings/enrollments here (two more set-based queries, never a per-household
// round trip, the same reasoning `members`'s own single scan already established) is what makes
// "reaches the panel with zero navigations" true with no client-side fetch at all. At the club's
// current scale (149 households, a few hundred members/holdings/enrollments total) the resulting
// payload is small; a future scale where that stops holding is the point to revisit this call
// into a lazy per-row read.
import type { D1Database } from '@cloudflare/workers-types';
import type { AssetPaymentStanding } from './assets-store';
import type { DirectoryVisibility, MembershipTier } from './member-types';
import { classifyHouseholdStanding, type HouseholdStandingStatus } from '$member-auth/lib/standing';
import { getCurrentSeason } from './club-settings';
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from './member-normalize.js';

/** Re-exported for this module's own long-standing consumers (`member-format.ts`,
 *  `+page.svelte`/`+page.server.ts`): `member-auth/lib/standing.ts`'s own `HouseholdStandingStatus`
 *  is the one vocabulary this module and the household desk now share (Members pass T3 unifies
 *  what used to be two independently-derived types). */
export type { HouseholdStandingStatus };

/** One member's display chip in a household list row: display only (all member CRUD lives on the
 *  desk), so this carries just what the row needs to render (primary-first, an age via
 *  {@link ageFromBirthdate}) and to highlight a search match, plus what the expanded panel's own
 *  Contacts section reads off the primary member (T7). */
export interface HouseholdMemberChip {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  archived: boolean;
  isPrimary: boolean;
  /** Whether this member's own name or phone is what matched `opts.search`, so the list row can
   *  highlight the specific member a household-name match would not explain. `false` when there is
   *  no active search, or when the household matched by its own name instead. */
  matchedSearch: boolean;
}

/** One asset held by a household, its current-season billing standing (T7's panel "Holdings: assets
 *  with paid/owing state", the design spec's own wording). Released assignments are never
 *  returned here (mirrors `assets-store.ts`'s own `listActiveAssignments`, "who holds what now"). */
export interface HouseholdHoldingChip {
  id: string;
  assetTypeName: string;
  description: string | null;
  /** The grounding membership's own `season`, display only. */
  season: number;
  paymentStanding: AssetPaymentStanding;
}

/** One class a household member is enrolled in, any season (T7's panel "Classes: enrollments with
 *  paid status"). */
export interface HouseholdEnrollmentChip {
  id: string;
  className: string;
  season: number;
  memberName: string;
  feePaid: boolean;
}

/** One row of the household-grouped Members list (T7 rebuild): the household's own standing, its
 *  primary-first member chips, and the expanded panel's own holdings/enrollments -- all read in the
 *  same call as the row itself (this module's own header explains why). `tier`/`amount`/`comped`/
 *  `discounted` retired with the row's own "Tier & Amount" column (the design spec's own stop-1
 *  reaction); a household's money facts live on the desk, never this list. */
export interface HouseholdListRow {
  id: string;
  name: string;
  /** Kept for the Money screen's own household picker (`money/+page.server.ts`), which is not this
   *  pass's row -- never rendered by the Members list itself (the design spec's own "no city
   *  column" stop-1 reaction). */
  city: string | null;
  standing: HouseholdStandingStatus;
  /** The grounding row's own `season`, `null` when `standing` is `'none'`. Surfaces as a
   *  `StatusChip` legend for a Former household ("last active <season>"). */
  lastSeason: number | null;
  /** Primary member sorted first, then alphabetically -- the row's own "primary member first"
   *  ordering (the design spec's own wording; the unlabeled star retires in favor of a plain
   *  "(primary)" label). */
  members: HouseholdMemberChip[];
  holdings: HouseholdHoldingChip[];
  enrollments: HouseholdEnrollmentChip[];
}

export interface ListHouseholdsOptions {
  /** Case-insensitive; matches the household's own name, any member's name or phone (digits only,
   *  so punctuation in either the query or the stored number never breaks a match), or the raw
   *  standing key (`'current'`/`'overdue'`/`'former'`/`'none'`) -- the plan's own "search across
   *  member names, standing, phone" (T7). Member email is deliberately no longer a search field:
   *  the row that used to justify it (this module's prior header, "a client-side re-filter could
   *  never reproduce an email match") is gone -- the row now shows exactly the fields search
   *  matches (name, standing, phone), never a hidden one. */
  search?: string;
  /** `'members'` (the design spec's own default scope) keeps Current or Overdue only; `'current'`/
   *  `'overdue'`/`'former'` narrow to exactly that one standing (`'former'` also matches `'none'`
   *  -- a household that has never paid reads alongside a lapsed one for this coarse admin-facing
   *  bucket, the same "not an active member" grouping `HOUSEHOLD_STANDING_CHIP`'s own dimmer
   *  `none` chip already implies); `'all'` (the default) applies no standing filter at all, the
   *  Money screen's own household-picker need (`money/+page.server.ts`'s `listHouseholds(db, {})`
   *  call, which must offer every household regardless of standing). */
  standing?: 'all' | 'members' | 'current' | 'overdue' | 'former';
  /** `'holding'` keeps only households with at least one active asset assignment; `'all'` (the
   *  default) applies no filter. */
  holdings?: 'all' | 'holding';
  /** `'instructor'` keeps only households with a member assigned to a current-season class (the
   *  class filter's own current-season-only scoping, applied consistently here); `'all'` (the
   *  default) applies no filter. */
  role?: 'all' | 'instructor';
  /** A real `classes.id` keeps only households with a member enrolled in that class; `'all'` (the
   *  default) applies no filter. */
  classId?: string;
  /** A household with at least one member, all of them archived, is hidden by default (mirrors
   *  the fixture screen's own "archived excluded unless toggled" rule); `true` shows it. A
   *  household with zero members (the visible-but-empty state Household surgery's move-member can
   *  leave, per the design doc) is never hidden by this flag, since there is no archived member to
   *  exclude it for. */
  includeArchived?: boolean;
}

interface HouseholdGroundingRow {
  id: string;
  name: string;
  city: string | null;
  primary_member_id: string | null;
  season: number | null;
  paid_at: string | null;
  /** `households.former_at`, raw: {@link classifyHouseholdStanding}'s own recorded-Former input
   *  (migration `0033_member_standing`). */
  former_at: string | null;
}

const HOUSEHOLD_GROUNDING_SQL = `
  SELECT h.id, h.name, h.city, h.primary_member_id, h.former_at, gm.season, gm.paid_at
  FROM households h
  LEFT JOIN memberships gm ON gm.id = (
    SELECT id FROM memberships mm
    WHERE mm.household_id = h.id AND mm.paid_at IS NOT NULL AND mm.refunded_at IS NULL
    ORDER BY mm.paid_at DESC LIMIT 1
  )
  ORDER BY h.name
`;

interface MemberRosterRow {
  id: string;
  household_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  archived_at: string | null;
}

interface HoldingRow {
  id: string;
  household_id: string;
  asset_type_name: string;
  description: string | null;
  season: number;
  payment_id: string | null;
  paid_at: string | null;
}

const HOLDINGS_SQL = `
  SELECT aa.id, ms.household_id, at.name AS asset_type_name, aa.description, ms.season,
         ap.id AS payment_id, ap.paid_at
  FROM asset_assignments aa
  JOIN asset_types at ON at.id = aa.asset_type
  JOIN memberships ms ON ms.id = aa.membership_id
  LEFT JOIN asset_payments ap ON ap.assignment_id = aa.id AND ap.season = ?1
  WHERE aa.status = 'active'
  ORDER BY at.sort_order, at.name
`;

interface EnrollmentRow {
  id: string;
  household_id: string;
  class_name: string;
  season: number;
  member_name: string;
  fee_paid: 0 | 1;
}

const ENROLLMENTS_SQL = `
  SELECT ce.id, m.household_id, c.name AS class_name, c.season, m.name AS member_name, ce.fee_paid
  FROM class_enrollments ce
  JOIN classes c ON c.id = ce.class_id
  JOIN members m ON m.id = ce.member_id
  ORDER BY c.season DESC, c.name ASC
`;

interface InstructorMemberRow {
  member_id: string;
}

const CURRENT_SEASON_INSTRUCTORS_SQL = `
  SELECT DISTINCT ci.member_id
  FROM class_instructors ci
  JOIN classes c ON c.id = ci.class_id
  WHERE c.season = ?1
`;

interface ClassMemberRow {
  member_id: string;
}

/** Strip everything but digits, so a phone search matches regardless of how either side
 *  punctuates it (a stored `+19075550100` against a typed `907-555-0100`). */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Every household, its standing, and its full expand-in-place panel data (this module's own
 * header on why the panel rides along rather than a second per-row fetch): five set-based queries
 * -- the grounding query above, a plain `members` scan, the active-holdings scan, the enrollments
 * scan, and (only when the corresponding filter is applied) the current-season instructor or
 * class-roster member-id set -- grouped in JS by `household_id`, so filtering and search never
 * cost a per-household round trip. `opts.search` matches the household's own name, any member's
 * name/phone, or the raw standing key (case-insensitive); a matching household whose match came
 * from a member marks that member's own `matchedSearch`. Households are dropped from the result
 * (not merely unmarked) when neither the household name nor any member matches a nonempty search,
 * when any of `opts.standing`/`opts.holdings`/`opts.role`/`opts.classId` excludes them, or when
 * every member is archived and `opts.includeArchived` is not set.
 */
export async function listHouseholds(db: D1Database, opts: ListHouseholdsOptions = {}): Promise<HouseholdListRow[]> {
  const classId = opts.classId && opts.classId !== 'all' ? opts.classId : null;
  const needsInstructors = opts.role === 'instructor';

  const currentSeason = await getCurrentSeason(db);

  const [groundingResult, memberResult, holdingsResult, enrollmentsResult] = await Promise.all([
    db.prepare(HOUSEHOLD_GROUNDING_SQL).all<HouseholdGroundingRow>(),
    db.prepare('SELECT id, household_id, name, email, phone, birthdate, archived_at FROM members').all<MemberRosterRow>(),
    db.prepare(HOLDINGS_SQL).bind(currentSeason).all<HoldingRow>(),
    db.prepare(ENROLLMENTS_SQL).all<EnrollmentRow>(),
  ]);

  const [instructorMemberIds, classMemberIds] = await Promise.all([
    needsInstructors
      ? db.prepare(CURRENT_SEASON_INSTRUCTORS_SQL).bind(currentSeason).all<InstructorMemberRow>()
      : null,
    classId
      ? db.prepare('SELECT member_id FROM class_enrollments WHERE class_id = ?1').bind(classId).all<ClassMemberRow>()
      : null,
  ]);
  const instructorIds = instructorMemberIds ? new Set(instructorMemberIds.results.map((r) => r.member_id)) : null;
  const classMemberIdSet = classMemberIds ? new Set(classMemberIds.results.map((r) => r.member_id)) : null;

  const membersByHousehold = groupBy(memberResult.results, (r) => r.household_id);
  const holdingsByHousehold = groupBy(holdingsResult.results, (r) => r.household_id);
  const enrollmentsByHousehold = groupBy(enrollmentsResult.results, (r) => r.household_id);

  const now = new Date();
  const query = (opts.search ?? '').trim().toLowerCase();
  const queryDigits = digitsOnly(query);
  const includeArchived = opts.includeArchived ?? false;
  const standingFilter = opts.standing ?? 'all';
  const holdingsFilter = opts.holdings ?? 'all';

  const rows: HouseholdListRow[] = [];
  for (const grounding of groundingResult.results) {
    const members = membersByHousehold.get(grounding.id) ?? [];
    if (members.length > 0 && !includeArchived && members.every((member) => member.archived_at !== null)) continue;

    const standing = classifyHouseholdStanding(grounding.paid_at, grounding.former_at ?? null, now);
    if (standingFilter === 'members' && standing !== 'current' && standing !== 'overdue') continue;
    if (standingFilter === 'current' && standing !== 'current') continue;
    if (standingFilter === 'overdue' && standing !== 'overdue') continue;
    if (standingFilter === 'former' && standing !== 'former' && standing !== 'none') continue;

    const holdings = holdingsByHousehold.get(grounding.id) ?? [];
    if (holdingsFilter === 'holding' && holdings.length === 0) continue;

    if (instructorIds && !members.some((member) => instructorIds.has(member.id))) continue;
    if (classMemberIdSet && !members.some((member) => classMemberIdSet.has(member.id))) continue;

    const memberChips: HouseholdMemberChip[] = members
      .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        birthdate: member.birthdate,
        archived: member.archived_at !== null,
        isPrimary: member.id === grounding.primary_member_id,
        matchedSearch:
          query !== '' &&
          (member.name.toLowerCase().includes(query) ||
            (queryDigits !== '' && member.phone != null && digitsOnly(member.phone).includes(queryDigits))),
      }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));

    const householdNameMatches = query !== '' && grounding.name.toLowerCase().includes(query);
    const standingMatches = query !== '' && standing.includes(query);
    if (query !== '' && !householdNameMatches && !standingMatches && !memberChips.some((chip) => chip.matchedSearch)) {
      continue;
    }

    rows.push({
      id: grounding.id,
      name: grounding.name,
      city: grounding.city,
      standing,
      lastSeason: grounding.season,
      members: memberChips,
      holdings: holdings.map((holding) => ({
        id: holding.id,
        assetTypeName: holding.asset_type_name,
        description: holding.description,
        season: holding.season,
        paymentStanding: !holding.payment_id ? 'not-billed' : holding.paid_at ? 'paid' : 'outstanding',
      })),
      enrollments: (enrollmentsByHousehold.get(grounding.id) ?? []).map((enrollment) => ({
        id: enrollment.id,
        className: enrollment.class_name,
        season: enrollment.season,
        memberName: enrollment.member_name,
        feePaid: enrollment.fee_paid === 1,
      })),
    });
  }
  return rows;
}

/** One roster member on the household desk: every contact field an admin edits, plus archive and
 *  primary state. */
export interface HouseholdRosterMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  directoryVisibility: DirectoryVisibility;
  archived: boolean;
  isPrimary: boolean;
}

/** One membership row on the household desk: refunded state travels alongside the season/tier/
 *  amount facts, per ruling 4 (a refund marks, never deletes). `source` (check/cash/comp/stripe/...)
 *  deliberately does NOT live here: it is a fact of the linked ledger transaction, not the
 *  membership row itself, and reading it costs a `transactions` join this module's own boundary
 *  (household/member schema only, no money-domain join) leaves to `money-store.ts`'s
 *  `getHouseholdTimeline`, which the desk route cross-references by this row's own `id`. */
export interface HouseholdMembershipRow {
  id: string;
  season: number;
  tier: MembershipTier;
  pricePaid: number;
  paidAt: string | null;
  stripeRef: string | null;
  refundedAt: string | null;
}

/** One asset assignment on the household desk, active or released (read-only here; asset
 *  management keeps its own screen, per the design doc). */
export interface HouseholdAssetRow {
  id: string;
  assetType: string;
  assetTypeName: string;
  membershipId: string;
  /** The grounding membership's own `season`, for display ("against a 2024 membership"). */
  season: number;
  description: string | null;
  status: 'active' | 'released';
}

/** The household desk's full read: household info, roster, memberships, and assets. `null` when
 *  no such household exists (a bad id in the URL, or a member-id redirect that resolved nowhere). */
export interface HouseholdDesk {
  id: string;
  name: string;
  city: string | null;
  primaryMemberId: string | null;
  roster: HouseholdRosterMember[];
  memberships: HouseholdMembershipRow[];
  assets: HouseholdAssetRow[];
}

interface HouseholdRow {
  id: string;
  name: string;
  city: string | null;
  primary_member_id: string | null;
}

interface MembershipRawRow {
  id: string;
  season: number;
  tier: string;
  price_paid: number;
  paid_at: string | null;
  stripe_ref: string | null;
  refunded_at: string | null;
}

interface AssetRawRow {
  id: string;
  asset_type: string;
  asset_type_name: string;
  membership_id: string;
  season: number;
  description: string | null;
  status: string;
}

/** The household desk's full read (this module's own header): one `households` lookup, then the
 * roster/memberships/assets in parallel, each a single set-based query keyed by `householdId`.
 */
export async function getHouseholdDesk(db: D1Database, householdId: string): Promise<HouseholdDesk | null> {
  const household = await db
    .prepare('SELECT id, name, city, primary_member_id FROM households WHERE id = ?1')
    .bind(householdId)
    .first<HouseholdRow>();
  if (!household) return null;

  const [rosterResult, membershipResult, assetResult] = await Promise.all([
    db
      .prepare(
        'SELECT id, name, email, phone, birthdate, directory_visibility, archived_at FROM members WHERE household_id = ?1 ORDER BY name',
      )
      .bind(householdId)
      .all<{
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        birthdate: string | null;
        directory_visibility: string;
        archived_at: string | null;
      }>(),
    db
      .prepare('SELECT id, season, tier, price_paid, paid_at, stripe_ref, refunded_at FROM memberships WHERE household_id = ?1 ORDER BY season DESC')
      .bind(householdId)
      .all<MembershipRawRow>(),
    db
      .prepare(
        `SELECT aa.id, aa.asset_type, at.name AS asset_type_name, aa.membership_id, ms.season, aa.description, aa.status
         FROM asset_assignments aa
         JOIN asset_types at ON at.id = aa.asset_type
         JOIN memberships ms ON ms.id = aa.membership_id
         WHERE ms.household_id = ?1
         ORDER BY aa.status ASC, ms.season DESC`,
      )
      .bind(householdId)
      .all<AssetRawRow>(),
  ]);

  return {
    id: household.id,
    name: household.name,
    city: household.city,
    primaryMemberId: household.primary_member_id,
    roster: rosterResult.results.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      birthdate: row.birthdate,
      directoryVisibility: row.directory_visibility as DirectoryVisibility,
      archived: row.archived_at !== null,
      isPrimary: row.id === household.primary_member_id,
    })),
    memberships: membershipResult.results.map((row) => ({
      id: row.id,
      season: row.season,
      tier: row.tier as MembershipTier,
      pricePaid: row.price_paid,
      paidAt: row.paid_at,
      stripeRef: row.stripe_ref,
      refundedAt: row.refunded_at,
    })),
    assets: assetResult.results.map((row) => ({
      id: row.id,
      assetType: row.asset_type,
      assetTypeName: row.asset_type_name,
      membershipId: row.membership_id,
      season: row.season,
      description: row.description,
      status: row.status === 'active' ? 'active' : 'released',
    })),
  };
}

/** The household a member belongs to, or `null` for a bad id: the member-id redirect's own
 *  precondition read (a surviving link to the old member-detail screen resolves through this,
 *  per the design doc's household desk section). */
export async function resolveMemberHousehold(db: D1Database, memberId: string): Promise<string | null> {
  const row = await db.prepare('SELECT household_id FROM members WHERE id = ?1').bind(memberId).first<{ household_id: string }>();
  return row?.household_id ?? null;
}

/** One roster member's contact fields, as the desk's add-member and edit-member forms both
 *  submit them: normalized the same way every other live write path does (`member-normalize.js`)
 *  before the write lands, so a desk edit and a self-service portal edit converge on the same
 *  stored shape. */
export interface RosterMemberInput {
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
}

function normalizedContactFields(input: RosterMemberInput): { name: string; email: string | null; phone: string | null } {
  return {
    name: normalizeNameCaps(input.name),
    email: input.email ? normalizeEmail(input.email) : null,
    phone: input.phone ? (normalizePhoneE164(input.phone) ?? input.phone.trim()) : null,
  };
}

/** Create a new household with its first member as primary: the walk-up-join entry point (Task 5,
 *  the Members list's own add-household action). Mirrors `member-signup/lib/statements.ts`'s own
 *  deferred-primary dance (a household's `primary_member_id` can only be set once its first
 *  member's id is known) in one `db.batch()`, so the household is never briefly primary-less. */
export async function createHousehold(
  db: D1Database,
  input: { name: string; city: string | null; member: RosterMemberInput },
): Promise<{ householdId: string; memberId: string }> {
  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const { name, email, phone } = normalizedContactFields(input.member);
  await db.batch([
    db.prepare('INSERT INTO households (id, name, city) VALUES (?1, ?2, ?3)').bind(householdId, input.name, input.city),
    db
      .prepare('INSERT INTO members (id, household_id, name, email, phone, birthdate) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(memberId, householdId, name, email, phone, input.member.birthdate),
    db.prepare('UPDATE households SET primary_member_id = ?1 WHERE id = ?2').bind(memberId, householdId),
  ]);
  return { householdId, memberId };
}

/** Update a household's own name/city (the desk's household-level edit block; primary
 *  reassignment is a separate write, {@link setHouseholdPrimary}, since it carries its own
 *  precondition on the caller side, `household-surgery.ts`'s `buildMovePlan`). */
export async function updateHouseholdInfo(db: D1Database, householdId: string, input: { name: string; city: string | null }): Promise<void> {
  await db
    .prepare("UPDATE households SET name = ?1, city = ?2, updated_at = datetime('now') WHERE id = ?3")
    .bind(input.name, input.city, householdId)
    .run();
}

/** Reassign a household's primary member. The caller is responsible for confirming `memberId`
 *  already belongs to `householdId` (the desk's own edit form only ever offers current roster
 *  members as choices); this module trusts its caller the same way `households-store.ts`'s own
 *  header names as the write-layer's boundary. */
export async function setHouseholdPrimary(db: D1Database, householdId: string, memberId: string): Promise<void> {
  await db
    .prepare("UPDATE households SET primary_member_id = ?1, updated_at = datetime('now') WHERE id = ?2")
    .bind(memberId, householdId)
    .run();
}

/** Update a roster member's own contact fields (name, email, phone, birthdate), normalized. */
export async function updateRosterMember(db: D1Database, memberId: string, input: RosterMemberInput): Promise<void> {
  const { name, email, phone } = normalizedContactFields(input);
  await db
    .prepare("UPDATE members SET name = ?1, email = ?2, phone = ?3, birthdate = ?4, updated_at = datetime('now') WHERE id = ?5")
    .bind(name, email, phone, input.birthdate, memberId)
    .run();
}

/** Archive or unarchive a roster member. Unlike the portal's own hard-delete
 *  `removeHouseholdMember` (member-portal/lib/household.ts), this never refuses the household's
 *  primary or its last member: archiving is reversible and never removes the row, so a household
 *  whose primary reads archived is simply a fact the desk shows, not a state to guard against. */
export async function setMemberArchived(db: D1Database, memberId: string, archived: boolean): Promise<void> {
  const clearOrStamp = archived ? "datetime('now')" : 'NULL';
  await db
    .prepare(`UPDATE members SET archived_at = ${clearOrStamp}, updated_at = datetime('now') WHERE id = ?1`)
    .bind(memberId)
    .run();
}

/** Edit a membership's own tier (the desk's per-row tier-change action). Tier-change is a label
 *  edit plus audit only, per the design doc's own ruling: `price_paid` stays the snapshot of what
 *  was actually paid, and any money truing-up happens through a manual payment or refund instead
 *  of a silent price edit here. */
export async function updateMembershipTier(db: D1Database, membershipId: string, tier: MembershipTier): Promise<void> {
  await db.prepare('UPDATE memberships SET tier = ?1 WHERE id = ?2').bind(tier, membershipId).run();
}
