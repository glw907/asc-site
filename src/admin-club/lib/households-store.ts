// The household-grouped Members screen's own reads against `households`, `members`,
// `memberships`, and `asset_assignments` (Task 3, docs/plans/2026-07-14-membership-admin.md): the
// same thin, typed, `db`-as-parameter shape `classes-store.ts` and `assets-store.ts` already
// establish. No validation or audit lives here; the write paths (Task 5) and the audit emit
// (`clubAdminAction`'s `ctx.audit`) both stay in the route/action layer.
//
// STANDING (current/grace/lapsed/none) is computed HERE, independently of
// `member-auth/lib/standing.ts`, deliberately duplicating that module's rolling-year window math
// rather than importing it: that module's own header states its one-way independence from
// `admin-club` (`club-settings.ts`'s `getRenewalGraceDays` is its only admin-club reuse), and
// `stripe-reconcile.ts`'s own `TIER_LABEL` constant already sets the precedent for keeping a small
// duplicate here rather than crossing that boundary in reverse. `listHouseholds` computes every
// household's status from ONE grounding query (a correlated subquery per household picks its own
// most recently paid, non-refunded `memberships` row, the same "grounding row" `getHouseholdStanding`
// reads one household at a time), never a per-row `getHouseholdStanding` call: the admin's 148-row
// list would otherwise cost 148 round trips.
import type { D1Database } from '@cloudflare/workers-types';
import type { DirectoryVisibility, MembershipTier } from './member-types';
import { getRenewalGraceDays, getTierPrices } from './club-settings';
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from './member-normalize.js';

/** A household's renewal standing: `'current'` through its rolling paid-plus-one-year boundary,
 *  `'grace'` for the settings' own grace window past it, `'lapsed'` after that, `'none'` when the
 *  household has never had a non-refunded paid `memberships` row at all. Mirrors
 *  `member-auth/lib/standing.ts`'s own `HouseholdStandingStatus` vocabulary exactly (this module's
 *  own header explains why that is a duplicate, not a shared import). */
export type HouseholdStandingStatus = 'current' | 'grace' | 'lapsed' | 'none';

/** Parse a stored `paid_at` value, accepting either a bare civil date ("YYYY-MM-DD") or the
 *  schema's full SQLite-datetime shape ("YYYY-MM-DD HH:MM:SS"), reading both as UTC. Mirrors
 *  `member-auth/lib/standing.ts`'s own `parseStoredDate`. */
function parseStoredDate(value: string): Date {
  const iso = value.length <= 10 ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

function plusOneYear(date: Date): Date {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** The current/grace/lapsed/none transition off a household's grounding row: `paidAt` is `null`
 *  when the household has no non-refunded paid `memberships` row at all (`'none'`); otherwise
 *  `'current'` through `paidAt` plus one year, `'grace'` for `graceDays` past that, `'lapsed'`
 *  after. */
function standingStatusFor(paidAt: string | null, graceDays: number, now: Date): HouseholdStandingStatus {
  if (!paidAt) return 'none';
  const expiry = plusOneYear(parseStoredDate(paidAt));
  const graceEnd = plusDays(expiry, graceDays);
  return now <= expiry ? 'current' : now <= graceEnd ? 'grace' : 'lapsed';
}

/** One member's display chip in a household list row: display only (all member CRUD lives on the
 *  desk), so this carries just what the row needs to render and highlight a search match. */
export interface HouseholdMemberChip {
  id: string;
  name: string;
  archived: boolean;
  isPrimary: boolean;
  /** Whether this member's own name or email is what matched `opts.search`, so the list row can
   *  highlight the specific chip a household-name match would not explain. `false` when there is
   *  no active search, or when the household matched by its own name instead. */
  matchedSearch: boolean;
}

/** One row of the household-grouped Members list: the household's own standing, its latest
 *  membership's tier/amount (honestly flagged comped/discounted), its active-asset count, and its
 *  member chips. */
export interface HouseholdListRow {
  id: string;
  name: string;
  city: string | null;
  standing: HouseholdStandingStatus;
  /** The grounding membership row's own `season`, `null` when `standing` is `'none'`. */
  lastSeason: number | null;
  tier: MembershipTier | null;
  /** The grounding row's `price_paid` snapshot, whole dollars; `null` when `standing` is `'none'`. */
  amount: number | null;
  /** `amount === 0`: a $0 comp, rendered honestly rather than silently as a discount. */
  comped: boolean;
  /** `amount` is nonzero and differs from the settings' own current tier price: a real discount
   *  (Nancy Black's $324 family, the design spec's own example), never true for a comp. */
  discounted: boolean;
  /** Live `asset_assignments` rows with `status = 'active'`, joined through this household's
   *  memberships (assets attach to a membership, never a member; `assets-store.ts`'s own header). */
  activeAssets: number;
  /** `activeAssets > 0` and `standing !== 'current'`: an active assignment riding a stale
   *  membership (Elayne C Hunter's Yellow Laser against a 2024 row, the design spec's own example). */
  staleAssets: boolean;
  members: HouseholdMemberChip[];
}

export interface ListHouseholdsOptions {
  /** Case-insensitive; matches the household's own name, or any member's name or email. */
  search?: string;
  /** `'current'` keeps only `standing === 'current'`; `'lapsed'` keeps everything else (`grace`,
   *  `lapsed`, and `none` all read as "not yet current" for this coarse filter, matching the
   *  fixture screen's own three-option `all`/`current`/`lapsed` vocabulary, which never
   *  distinguished a grace window as its own bucket either). `'all'` (the default) applies no
   *  standing filter. */
  segment?: 'all' | 'current' | 'lapsed';
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
  tier: string | null;
  price_paid: number | null;
  paid_at: string | null;
  active_assets: number;
}

const HOUSEHOLD_GROUNDING_SQL = `
  SELECT h.id, h.name, h.city, h.primary_member_id,
         gm.season, gm.tier, gm.price_paid, gm.paid_at,
         COALESCE(assets.active_count, 0) AS active_assets
  FROM households h
  LEFT JOIN memberships gm ON gm.id = (
    SELECT id FROM memberships mm
    WHERE mm.household_id = h.id AND mm.paid_at IS NOT NULL AND mm.refunded_at IS NULL
    ORDER BY mm.paid_at DESC LIMIT 1
  )
  LEFT JOIN (
    SELECT ms.household_id AS household_id, COUNT(*) AS active_count
    FROM asset_assignments aa
    JOIN memberships ms ON ms.id = aa.membership_id
    WHERE aa.status = 'active'
    GROUP BY ms.household_id
  ) assets ON assets.household_id = h.id
  ORDER BY h.name
`;

interface MemberRosterRow {
  id: string;
  household_id: string;
  name: string;
  email: string | null;
  archived_at: string | null;
}

/** Every household, standing/tier/amount/asset-count computed off two set-based queries (this
 * module's own header): the grounding query above, and one plain `members` scan grouped in JS by
 * `household_id`, so filtering and search never cost a per-household round trip. `opts.search`
 * matches the household's own name or any member's name/email (case-insensitive); a matching
 * household whose match came from a member marks that member's own `matchedSearch`. Households
 * are dropped from the result (not merely unmarked) when neither the household name nor any
 * member matches a nonempty search, when `opts.segment` excludes their standing, or when every
 * member is archived and `opts.includeArchived` is not set.
 */
export async function listHouseholds(db: D1Database, opts: ListHouseholdsOptions = {}): Promise<HouseholdListRow[]> {
  const [groundingResult, memberResult, tierPrices, graceDays] = await Promise.all([
    db.prepare(HOUSEHOLD_GROUNDING_SQL).all<HouseholdGroundingRow>(),
    db.prepare('SELECT id, household_id, name, email, archived_at FROM members').all<MemberRosterRow>(),
    getTierPrices(db),
    getRenewalGraceDays(db),
  ]);

  const membersByHousehold = new Map<string, MemberRosterRow[]>();
  for (const member of memberResult.results) {
    const list = membersByHousehold.get(member.household_id) ?? [];
    list.push(member);
    membersByHousehold.set(member.household_id, list);
  }

  const now = new Date();
  const query = (opts.search ?? '').trim().toLowerCase();
  const includeArchived = opts.includeArchived ?? false;
  const segment = opts.segment ?? 'all';

  const rows: HouseholdListRow[] = [];
  for (const grounding of groundingResult.results) {
    const members = membersByHousehold.get(grounding.id) ?? [];
    if (members.length > 0 && !includeArchived && members.every((member) => member.archived_at !== null)) continue;

    const standing = standingStatusFor(grounding.paid_at, graceDays, now);
    if (segment === 'current' && standing !== 'current') continue;
    if (segment === 'lapsed' && standing === 'current') continue;

    const memberChips: HouseholdMemberChip[] = members.map((member) => ({
      id: member.id,
      name: member.name,
      archived: member.archived_at !== null,
      isPrimary: member.id === grounding.primary_member_id,
      matchedSearch:
        query !== '' &&
        (member.name.toLowerCase().includes(query) || (member.email?.toLowerCase().includes(query) ?? false)),
    }));

    const householdNameMatches = query !== '' && grounding.name.toLowerCase().includes(query);
    if (query !== '' && !householdNameMatches && !memberChips.some((chip) => chip.matchedSearch)) continue;

    const tier = grounding.tier as MembershipTier | null;
    const amount = grounding.price_paid;
    const comped = amount === 0;
    const discounted = comped ? false : amount != null && tier != null && amount !== tierPrices[tier];

    rows.push({
      id: grounding.id,
      name: grounding.name,
      city: grounding.city,
      standing,
      lastSeason: grounding.season,
      tier,
      amount,
      comped,
      discounted,
      activeAssets: grounding.active_assets,
      staleAssets: grounding.active_assets > 0 && standing !== 'current',
      members: memberChips,
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
