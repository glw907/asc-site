// The Club section's Committees admin screen (member-directory pass T6, docs/plans/2026-07-17-
// member-directory.md and docs/2026-07-17-roles-committees-design.md): a minimal CRUD data-access
// layer over the whole roles model (`committees`, `committee_members`, `member_positions`),
// migration 0027_directory_domain. Follows `assets-store.ts`'s own shape (a thin read/write layer,
// validation in the route's own form-parsing helpers, the audit emit staying in `clubAdminAction`).
//
// This screen is a deliberate stopgap: the queued admin-nav-reorg + admin-roles pass absorbs it
// later (the roles spec's own "Seams and sequencing" section). Archive-not-delete for committees
// mirrors `households-store.ts`'s `setMemberArchived` idiom exactly, reversible the same way.
// Decline and remove both delete a `committee_members` row outright (never a soft archive): the
// roles spec's own ratified rule (decision 4), since a declined request or a departed member
// carries no roster history worth keeping.
import type { D1Database } from '@cloudflare/workers-types';

/** The two `committees.kind` values migration 0027's CHECK allows. */
export const COMMITTEE_KINDS = ['standing', 'established'] as const;

/** One allowed `committees.kind` value. */
export type CommitteeKind = (typeof COMMITTEE_KINDS)[number];

/** The three `committee_members.role` values migration 0027's CHECK allows. */
export const COMMITTEE_ROLES = ['chair', 'co-chair', 'member'] as const;

/** One allowed `committee_members.role` value. */
export type CommitteeRole = (typeof COMMITTEE_ROLES)[number];

/** The three `member_positions.kind` values migration 0027's CHECK allows. Authorization
 *  elsewhere in this app reads this column directly (`kind IN ('officer','director')` for "is a
 *  board member"), never a title-string match; this admin screen only assigns and displays it. */
export const POSITION_KINDS = ['officer', 'director', 'appointed'] as const;

/** One allowed `member_positions.kind` value. */
export type PositionKind = (typeof POSITION_KINDS)[number];

/** One `committees` row, camelCased, `archived` derived from `archived_at` the same way
 *  `households-store.ts`'s member roster reads `archived_at !== null`. */
export interface CommitteeRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: CommitteeKind;
  sortOrder: number;
  archived: boolean;
}

/** One `committee_members` row, joined out to the committee's own name and the member's own
 *  name (never bare ids an admin would otherwise have to look up), for the screen's by-committee
 *  grouping. */
export interface CommitteeMemberRow {
  id: string;
  committeeId: string;
  committeeName: string;
  memberId: string;
  memberName: string;
  role: CommitteeRole;
  status: 'pending' | 'active';
}

/** One `member_positions` row, joined out to the member's own name, for the screen's
 *  group-by-title view. */
export interface MemberPositionRow {
  id: string;
  memberId: string;
  memberName: string;
  kind: PositionKind;
  title: string;
  sortOrder: number;
}

/** A minimal, dependency-free slug: lowercase, non-alphanumeric runs collapse to one hyphen,
 *  leading/trailing hyphens trimmed. The same idiom `scripts/import/committee-seed.mjs`'s own
 *  `slugify` uses, kept as its own small copy here rather than importing a script module into
 *  the app's server runtime. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every `committees` row, sort order first. Excludes archived committees unless
 *  `opts.includeArchived` is set (the admin screen's own "show archived" toggle; every OTHER
 *  member-facing surface never sets this, per the roles spec's archive-not-delete rule). */
export async function listCommittees(db: D1Database, opts: { includeArchived?: boolean } = {}): Promise<CommitteeRow[]> {
  const where = opts.includeArchived ? '' : 'WHERE archived_at IS NULL';
  const { results } = await db
    .prepare(`SELECT id, slug, name, description, kind, sort_order, archived_at FROM committees ${where} ORDER BY sort_order, name`)
    .all<{ id: string; slug: string; name: string; description: string | null; kind: string; sort_order: number; archived_at: string | null }>();
  return results.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    kind: r.kind as CommitteeKind,
    sortOrder: r.sort_order,
    archived: r.archived_at !== null,
  }));
}

/** Create a new committee, deriving its slug from its name (the seed's own natural key; a name
 *  collision surfaces as the schema's own `UNIQUE` constraint on `slug`, not a check here). */
export async function createCommittee(
  db: D1Database,
  args: { name: string; description: string | null; kind: CommitteeKind; sortOrder: number },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO committees (id, slug, name, description, kind, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, slugify(args.name), args.name, args.description, args.kind, args.sortOrder)
    .run();
  return id;
}

/** Edit a committee's name, description, kind, and sort order. The slug stays fixed once minted
 *  (a rename never rewrites the natural key a seed re-run matches on). */
export async function updateCommittee(
  db: D1Database,
  id: string,
  args: { name: string; description: string | null; kind: CommitteeKind; sortOrder: number },
): Promise<void> {
  await db
    .prepare('UPDATE committees SET name = ?1, description = ?2, kind = ?3, sort_order = ?4, updated_at = datetime(\'now\') WHERE id = ?5')
    .bind(args.name, args.description, args.kind, args.sortOrder, id)
    .run();
}

/** Archive or restore a committee, `households-store.ts`'s `setMemberArchived` idiom exactly:
 *  archiving keeps the row (and its roster history) but the roles spec's own rule is that an
 *  archived committee vanishes from every member surface (the directory read and portal query
 *  filter on `archived_at IS NULL`, never this admin screen). */
export async function setCommitteeArchived(db: D1Database, id: string, archived: boolean): Promise<void> {
  const clearOrStamp = archived ? "datetime('now')" : 'NULL';
  await db
    .prepare(`UPDATE committees SET archived_at = ${clearOrStamp}, updated_at = datetime('now') WHERE id = ?1`)
    .bind(id)
    .run();
}

/** Every `committee_members` row across every committee, pending and active alike (the admin
 *  screen's own single read; the pending queue and the active roster are the same list, grouped
 *  by `status` in the template), sort order following the committee's own, then the member's name. */
export async function listCommitteeMembers(db: D1Database): Promise<CommitteeMemberRow[]> {
  const { results } = await db
    .prepare(
      `SELECT cm.id, cm.committee_id, c.name AS committee_name, cm.member_id, m.name AS member_name, cm.role, cm.status
       FROM committee_members cm
       JOIN committees c ON c.id = cm.committee_id
       JOIN members m ON m.id = cm.member_id
       ORDER BY c.sort_order, c.name, m.name`,
    )
    .all<{ id: string; committee_id: string; committee_name: string; member_id: string; member_name: string; role: string; status: string }>();
  return results.map((r) => ({
    id: r.id,
    committeeId: r.committee_id,
    committeeName: r.committee_name,
    memberId: r.member_id,
    memberName: r.member_name,
    role: r.role as CommitteeRole,
    status: r.status === 'active' ? 'active' : 'pending',
  }));
}

/** Add a member directly to a committee, active from the start: an admin-add stands in for the
 *  roles spec's own "chair-add" and "board appointment" paths (decision 4), both of which write
 *  `active` immediately rather than `pending`. */
export async function addCommitteeMember(
  db: D1Database,
  args: { committeeId: string; memberId: string; role: CommitteeRole },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO committee_members (id, committee_id, member_id, role, status) VALUES (?1, ?2, ?3, ?4, 'active')")
    .bind(id, args.committeeId, args.memberId, args.role)
    .run();
  return id;
}

/** Approve a pending join request: `status` `'pending'` -> `'active'`. */
export async function approveCommitteeMember(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE committee_members SET status = 'active', updated_at = datetime('now') WHERE id = ?1").bind(id).run();
}

/** Change an active member's role (`'chair'` / `'co-chair'` / `'member'`), the election-time
 *  update this screen exists for. */
export async function setCommitteeMemberRole(db: D1Database, id: string, role: CommitteeRole): Promise<void> {
  await db.prepare("UPDATE committee_members SET role = ?1, updated_at = datetime('now') WHERE id = ?2").bind(role, id).run();
}

/** Delete one `committee_members` row outright. The one function both the route's "decline" (a
 *  pending request) and "remove" (an active member) actions call: the roles spec's own rule that
 *  decline and leave both delete the row (decision 4), so there is no soft state to distinguish
 *  at the data layer between the two -- only the route's audit label differs. */
export async function removeCommitteeMember(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM committee_members WHERE id = ?1').bind(id).run();
}

/** Every `member_positions` row, sort order first, joined out to the member's own name. */
export async function listMemberPositions(db: D1Database): Promise<MemberPositionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT mp.id, mp.member_id, m.name AS member_name, mp.kind, mp.title, mp.sort_order
       FROM member_positions mp
       JOIN members m ON m.id = mp.member_id
       ORDER BY mp.sort_order, mp.title`,
    )
    .all<{ id: string; member_id: string; member_name: string; kind: string; title: string; sort_order: number }>();
  return results.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name,
    kind: r.kind as PositionKind,
    title: r.title,
    sortOrder: r.sort_order,
  }));
}

/** Assign a new position, appended to the end of the whole list (`MAX(sort_order) + 1`, the same
 *  tail-append idiom `assets-store.ts`'s `addToWaitlist` uses for its own queue). */
export async function createMemberPosition(
  db: D1Database,
  args: { memberId: string; kind: PositionKind; title: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const tail = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM member_positions').first<{ max_order: number }>();
  const sortOrder = (tail?.max_order ?? -1) + 1;
  await db
    .prepare('INSERT INTO member_positions (id, member_id, kind, title, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, args.memberId, args.kind, args.title, sortOrder)
    .run();
  return id;
}

/** Edit a position's kind and title. Sort order changes only through `moveMemberPosition`, never
 *  a direct field edit: this keeps the whole list's ordering internally consistent (no two
 *  editors independently typing the same order number). */
export async function updateMemberPosition(db: D1Database, id: string, args: { kind: PositionKind; title: string }): Promise<void> {
  await db
    .prepare("UPDATE member_positions SET kind = ?1, title = ?2, updated_at = datetime('now') WHERE id = ?3")
    .bind(args.kind, args.title, id)
    .run();
}

/** Remove a position outright (an officer stepping down, a mis-assigned row). */
export async function removeMemberPosition(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM member_positions WHERE id = ?1').bind(id).run();
}

/** Move one position up or down one slot in the whole list's sort order, swapping its
 *  `sort_order` with its immediate neighbor's (a two-statement `batch`, so the swap is atomic).
 *  A no-op when the position is already at that end of the list -- the election-time reorder is a
 *  repeated "nudge", and nudging past either end should do nothing rather than error. */
export async function moveMemberPosition(db: D1Database, id: string, direction: 'up' | 'down'): Promise<void> {
  const { results } = await db
    .prepare('SELECT id, sort_order FROM member_positions ORDER BY sort_order, id')
    .all<{ id: string; sort_order: number }>();
  const index = results.findIndex((r) => r.id === id);
  if (index === -1) return;
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= results.length) return;
  const current = results[index];
  const neighbor = results[neighborIndex];
  await db.batch([
    db.prepare('UPDATE member_positions SET sort_order = ?1 WHERE id = ?2').bind(neighbor.sort_order, current.id),
    db.prepare('UPDATE member_positions SET sort_order = ?1 WHERE id = ?2').bind(current.sort_order, neighbor.id),
  ]);
}
