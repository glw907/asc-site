// The Assets screen's typed reads/writes against asc-club's own `asset_types`,
// `asset_assignments`, `asset_payments`, and `asset_waitlist` tables (Part 2, this pass): the
// same thin data-access-layer shape `classes-store.ts` and `events-store.ts` already establish.
// Validation lives in the route's own form-parsing helpers; the audit emit stays in the action
// layer (`clubAdminAction`'s `ctx.audit`), never here.
//
// ASSETS ATTACH TO MEMBERSHIPS, NEVER MEMBERS (the ratified schema's own header comment, and
// `scripts/import/ops-assets.mjs`'s own governing correction of asc-ops's workaround model): every
// read here joins an assignment back to its membership, then that membership's household, for
// display. The by-asset and by-person lenses read the exact same underlying rows
// (`listActiveAssignments`); the two admin screens differ only in how they GROUP the same list,
// never in what they query.
import type { D1Database } from '@cloudflare/workers-types';

/** One `asset_types` row, camelCased. */
export interface AssetTypeRow {
  id: string;
  name: string;
  fee: number;
  capacity: number | null;
  sortOrder: number;
}

/** How an assignment's current-season billing stands, derived from `asset_payments` (never a
 *  stored flag): `'not-billed'` means no payment row exists at all for this season, `'outstanding'`
 *  means one exists but `paid_at` is still null (an invoice sent, unpaid -- the shape
 *  `scripts/import/ops-assets.mjs`'s imported `'sent'` rows carry), `'paid'` means `paid_at` is
 *  set. */
export type AssetPaymentStanding = 'not-billed' | 'outstanding' | 'paid';

/** One `asset_assignments` row, joined out to everything the admin screens display: the asset
 *  type's own name, and the household/primary-member names a membership resolves to (never the
 *  bare ids an editor would otherwise have to look up separately). */
export interface AssignmentDisplayRow {
  id: string;
  assetType: string;
  assetTypeName: string;
  membershipId: string;
  householdId: string;
  householdName: string;
  primaryMemberName: string | null;
  description: string | null;
  status: 'active' | 'released';
  createdAt: string;
  paymentStanding: AssetPaymentStanding;
  paymentId: string | null;
}

/** One `asset_waitlist` row, joined out to the asset type's name and the waitlisted member's
 *  display name/email. */
export interface AssetWaitlistDisplayRow {
  id: string;
  assetType: string;
  assetTypeName: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  position: number;
  requestedAt: string;
  notes: string | null;
}

/** One selectable option for the assign form's household picker: a household's CURRENT-season
 *  membership, the only kind of membership an assignment can ever attach to (this module's own
 *  header). */
export interface MembershipOption {
  membershipId: string;
  householdId: string;
  householdName: string;
  primaryMemberName: string | null;
}

/** One selectable option for the waitlist form's member picker: the waitlist attaches to a
 *  MEMBER directly (`asset_waitlist.member_id`, unlike an assignment's membership edge), per the
 *  ratified schema's own column. */
export interface MemberOption {
  memberId: string;
  name: string;
  email: string | null;
  householdName: string;
}

/** Every member, household name attached, for the waitlist form's picker. Same
 *  plain-filterable-list scale reasoning as `listMembershipOptions`. */
export async function listMemberOptions(db: D1Database): Promise<MemberOption[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id AS member_id, m.name, m.email, h.name AS household_name
       FROM members m
       JOIN households h ON h.id = m.household_id
       WHERE m.archived_at IS NULL
       ORDER BY m.name`,
    )
    .all<{ member_id: string; name: string; email: string | null; household_name: string }>();
  return results.map((r) => ({ memberId: r.member_id, name: r.name, email: r.email, householdName: r.household_name }));
}

/** Every `asset_types` row, sort order first (the same order the by-asset lens groups by). */
export async function listAssetTypes(db: D1Database): Promise<AssetTypeRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, fee, capacity, sort_order FROM asset_types ORDER BY sort_order, name')
    .all<{ id: string; name: string; fee: number; capacity: number | null; sort_order: number }>();
  return results.map((r) => ({ id: r.id, name: r.name, fee: r.fee, capacity: r.capacity, sortOrder: r.sort_order }));
}

/** Every ACTIVE assignment (the "who holds what now" lens both `listAssetTypes` groupings share),
 *  joined out for display, with its current-season payment standing. A released assignment is
 *  never returned here: it stays in the table as history (`scripts/import/ops-assets.mjs`'s own
 *  header on why released rows are imported at all), but neither admin lens surfaces it. */
export async function listActiveAssignments(db: D1Database, currentSeason: number): Promise<AssignmentDisplayRow[]> {
  const { results } = await db
    .prepare(
      `SELECT aa.id, aa.asset_type, at.name AS asset_type_name, aa.membership_id, h.id AS household_id,
              h.name AS household_name, pm.name AS primary_member_name, aa.description, aa.status,
              aa.created_at, ap.id AS payment_id, ap.paid_at
       FROM asset_assignments aa
       JOIN asset_types at ON at.id = aa.asset_type
       JOIN memberships m ON m.id = aa.membership_id
       JOIN households h ON h.id = m.household_id
       LEFT JOIN members pm ON pm.id = h.primary_member_id
       LEFT JOIN asset_payments ap ON ap.assignment_id = aa.id AND ap.season = ?1
       WHERE aa.status = 'active'
       ORDER BY at.sort_order, h.name`,
    )
    .bind(currentSeason)
    .all<{
      id: string;
      asset_type: string;
      asset_type_name: string;
      membership_id: string;
      household_id: string;
      household_name: string;
      primary_member_name: string | null;
      description: string | null;
      status: string;
      created_at: string;
      payment_id: string | null;
      paid_at: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    assetType: r.asset_type,
    assetTypeName: r.asset_type_name,
    membershipId: r.membership_id,
    householdId: r.household_id,
    householdName: r.household_name,
    primaryMemberName: r.primary_member_name,
    description: r.description,
    status: r.status === 'active' ? 'active' : 'released',
    createdAt: r.created_at,
    paymentId: r.payment_id,
    paymentStanding: !r.payment_id ? 'not-billed' : r.paid_at ? 'paid' : 'outstanding',
  }));
}

/** One assignment by id, or `null`: the release and payment-recording actions' own precondition
 *  read. */
export async function getAssignment(db: D1Database, id: string): Promise<{ id: string; status: 'active' | 'released'; assetType: string } | null> {
  const row = await db
    .prepare('SELECT id, status, asset_type FROM asset_assignments WHERE id = ?1')
    .bind(id)
    .first<{ id: string; status: string; asset_type: string }>();
  return row ? { id: row.id, status: row.status === 'active' ? 'active' : 'released', assetType: row.asset_type } : null;
}

/** Every household's CURRENT-season membership, for the assign form's picker. At the club's real
 *  scale (~93 memberships, the task's own note) a plain filterable client-side list is enough; no
 *  server-side search is wired here. */
export async function listMembershipOptions(db: D1Database, currentSeason: number): Promise<MembershipOption[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id AS membership_id, h.id AS household_id, h.name AS household_name, pm.name AS primary_member_name
       FROM memberships m
       JOIN households h ON h.id = m.household_id
       LEFT JOIN members pm ON pm.id = h.primary_member_id
       WHERE m.season = ?1
       ORDER BY h.name`,
    )
    .bind(currentSeason)
    .all<{ membership_id: string; household_id: string; household_name: string; primary_member_name: string | null }>();
  return results.map((r) => ({
    membershipId: r.membership_id,
    householdId: r.household_id,
    householdName: r.household_name,
    primaryMemberName: r.primary_member_name,
  }));
}

/** Create a new active assignment. `id` is a fresh random id (no natural key at the admin's own
 *  creation point, unlike the import's `ops-assignment-<n>` provenance ids). */
export async function assignAsset(
  db: D1Database,
  args: { assetType: string; membershipId: string; description: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO asset_assignments (id, asset_type, membership_id, description, status) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, args.assetType, args.membershipId, args.description, 'active')
    .run();
  return id;
}

/** Release an assignment (`status = 'active'` -> `'released'`), gated by the detail screen's own
 *  confirm dialog. A no-op (still `{ ok: true }`) if the assignment is already released, matching
 *  the idempotent-write convention the rest of this section's actions already follow. */
export async function releaseAssignment(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE asset_assignments SET status = 'released' WHERE id = ?1").bind(id).run();
}

/** The three ways a payment actually arrives (migration 0008's own `CHECK` vocabulary). */
export const PAYMENT_METHODS = ['card', 'check', 'cash'] as const;

/** One allowed `asset_payments.method` value. */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Record a received payment for one assignment's current season: an upsert on the schema's own
 * `UNIQUE (assignment_id, season)`, so recording twice for the same season CORRECTS the earlier
 * row rather than erroring or duplicating it (a treasurer fixing a typo'd amount, say).
 * `paid_at` is always stamped "now" -- this action means "we received this money", never "we
 * billed for it" (there is no separate "mark billed" admin action this pass; an outstanding
 * `'sent'` standing is only ever an import-carried state, per `listActiveAssignments`'s own
 * `paymentStanding` derivation).
 */
export async function recordPayment(
  db: D1Database,
  args: { assignmentId: string; season: number; amount: number; method: PaymentMethod; reference: string | null },
): Promise<void> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO asset_payments (id, assignment_id, season, amount, method, reference, paid_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
       ON CONFLICT (assignment_id, season) DO UPDATE SET
         amount = excluded.amount, method = excluded.method, reference = excluded.reference, paid_at = excluded.paid_at`,
    )
    .bind(id, args.assignmentId, args.season, args.amount, args.method, args.reference)
    .run();
}

/** Every `asset_waitlist` row across every asset type: THE single polymorphic queue (the
 *  redesign's own naming for it), asset type first then position, so the admin screen's type
 *  chips group naturally without a second query per type. */
export async function listAssetWaitlist(db: D1Database): Promise<AssetWaitlistDisplayRow[]> {
  const { results } = await db
    .prepare(
      `SELECT aw.id, aw.asset_type, at.name AS asset_type_name, aw.member_id, m.name AS member_name,
              m.email AS member_email, aw.position, aw.requested_at, aw.notes
       FROM asset_waitlist aw
       JOIN asset_types at ON at.id = aw.asset_type
       JOIN members m ON m.id = aw.member_id
       ORDER BY at.sort_order, aw.position`,
    )
    .all<{
      id: string;
      asset_type: string;
      asset_type_name: string;
      member_id: string;
      member_name: string;
      member_email: string | null;
      position: number;
      requested_at: string;
      notes: string | null;
    }>();
  return results.map((r) => ({
    id: r.id,
    assetType: r.asset_type,
    assetTypeName: r.asset_type_name,
    memberId: r.member_id,
    memberName: r.member_name,
    memberEmail: r.member_email,
    position: r.position,
    requestedAt: r.requested_at,
    notes: r.notes,
  }));
}

/** Add a member to one asset type's waitlist, at the end of it (`MAX(position) + 1` for that
 *  type; `0` when the type's queue is currently empty). */
export async function addToWaitlist(
  db: D1Database,
  args: { assetType: string; memberId: string; notes: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  const tail = await db
    .prepare('SELECT COALESCE(MAX(position), 0) AS max_position FROM asset_waitlist WHERE asset_type = ?1')
    .bind(args.assetType)
    .first<{ max_position: number }>();
  const position = (tail?.max_position ?? 0) + 1;
  await db
    .prepare('INSERT INTO asset_waitlist (id, asset_type, member_id, position, notes) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, args.assetType, args.memberId, position, args.notes)
    .run();
  return id;
}

/** Remove one waitlist entry by id (a member declining, or an admin correcting a bad entry). */
export async function removeFromWaitlist(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM asset_waitlist WHERE id = ?1').bind(id).run();
}

/** One waitlist entry's own asset type, or `null`: `moveToEndOfWaitlist`'s own precondition read
 *  (it needs to know which type's queue to re-tail into). */
export async function getWaitlistEntry(db: D1Database, id: string): Promise<{ id: string; assetType: string } | null> {
  const row = await db.prepare('SELECT id, asset_type FROM asset_waitlist WHERE id = ?1').bind(id).first<{ id: string; asset_type: string }>();
  return row ? { id: row.id, assetType: row.asset_type } : null;
}

/** Move one waitlist entry to the end of its own asset type's queue (a "let this person keep
 *  their spot open a bit longer" admin action, distinct from removing them outright): sets its
 *  `position` past every OTHER entry currently in that type's queue. */
export async function moveToEndOfWaitlist(db: D1Database, id: string, assetType: string): Promise<void> {
  await db
    .prepare(
      `UPDATE asset_waitlist SET position = (
         SELECT COALESCE(MAX(position), 0) + 1 FROM asset_waitlist WHERE asset_type = ?2 AND id != ?1
       ) WHERE id = ?1`,
    )
    .bind(id, assetType)
    .run();
}
