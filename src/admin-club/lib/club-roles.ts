// The Club section's own authorization axis (Task 4): a signed-in cairn editor's CONTENT role
// (owner/editor) says nothing about whether they may see or act on /admin/club/*, so asc-club
// carries a second table, `club_roles`, that this module is the one reader and writer of. The
// stored vocabulary ('owner', 'club-admin', 'instructor') and the API vocabulary ('owner',
// 'admin', null) deliberately differ: the schema's ratified enum names the seat a member holds
// day to day ("club-admin"), while every caller here (the layout guard, the nav filter, the
// settings screen) only ever needs the shorter word. An instructor grant carries no admin
// surface at all (the member-facing roster is 2.2's), so it maps to the same `null` a bare email
// with no grant gets.
import type { D1Database } from '@cloudflare/workers-types';
import type { Editor } from '@glw907/cairn-cms';
import type { ContentEvent, ResolvedNavItem } from '@glw907/cairn-cms/sveltekit';

/** The API-facing club role: the seat an /admin/club/* action or guard checks against. */
export type ClubRole = 'owner' | 'admin';

/** One granted row as the settings screen's role-management list reads it. Only 'owner' and
 *  'admin' grants are listed here; an instructor row (Task 6's member-level role) is a separate
 *  concern the classes screen manages, not this section. */
export interface ClubRoleGrant {
  email: string;
  role: ClubRole;
  grantedBy: string;
  grantedAt: string;
}

const STORED_ROLE: Record<ClubRole, string> = { owner: 'owner', admin: 'club-admin' };

/** The narrow, explained bridge every server file in this section uses to read the site's own
 *  `CLUB_DB` binding off a platform env. The engine types the events it hands sites (`ContentEvent`,
 *  `AdminActionEvent`) narrowly by its own need (`BackendEnv`, `AuthEnv`), so `CLUB_DB`, a binding
 *  this site alone declares (`app.d.ts`, `wrangler.toml`), is never on those types; widening an
 *  engine type for one site's binding would be the wrong fix. The real runtime object always
 *  carries the full `Platform.env` intersection regardless of which narrower type a given engine
 *  seam declares for it, so this cast is safe, just not expressible without it. */
export function resolveClubDb(env: unknown): D1Database | undefined {
  return (env as { CLUB_DB?: D1Database } | undefined)?.CLUB_DB;
}

/** Read a signed-in editor's club role. An email can hold more than one granted row over time
 *  (a role change adds rather than replaces, by design: see {@link setClubRole}); 'owner'
 *  outranks 'admin' when both are present. No row, or an instructor-only row, both answer null:
 *  from this module's callers' point of view, neither one gets into /admin/club/*. */
export async function getClubRole(db: D1Database, email: string): Promise<ClubRole | null> {
  const { results } = await db
    .prepare('SELECT role FROM club_roles WHERE email = ?1')
    .bind(email)
    .all<{ role: string }>();
  const stored = new Set(results.map((row) => row.role));
  if (stored.has('owner')) return 'owner';
  if (stored.has('club-admin')) return 'admin';
  return null;
}

/** True if `email` holds any club role at all (owner or admin). The section's routine, non-
 *  owner-only actions (Task 5's events, Task 6's classes) gate their writes on this rather than
 *  re-deriving it inline: the layout guard (`../+layout.server.ts`) only runs before a page's own
 *  GET render, never before a POST action (SvelteKit dispatches a matched action directly, with
 *  no preceding ancestor `load`; see `@sveltejs/kit`'s own `runtime/server/page/actions.js`), so a
 *  routine write path needs this same check inside the action itself, the same way Settings'
 *  owner-only actions already re-check `getClubRole` rather than trusting the layout alone. */
export async function hasAnyClubRole(db: D1Database, email: string): Promise<boolean> {
  return (await getClubRole(db, email)) !== null;
}

/** Every owner/admin grant, for the settings screen's role-management list. Ordered owners
 *  first, then alphabetically by email within a role, so the seat that can revoke everyone
 *  else's access always reads at the top. */
export async function listClubRoles(db: D1Database): Promise<ClubRoleGrant[]> {
  const { results } = await db
    .prepare(
      "SELECT email, role, granted_by, granted_at FROM club_roles WHERE role IN ('owner','club-admin') ORDER BY role, email",
    )
    .all<{ email: string; role: string; granted_by: string; granted_at: string }>();
  return results.map((row) => ({
    email: row.email,
    role: row.role === 'owner' ? 'owner' : 'admin',
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  }));
}

/** Thrown when a role change would leave the club with zero owners. The settings screen's
 *  actions (the only callers of `setClubRole`/`removeClubRole`) catch this specifically and
 *  surface it as a `fail(400, ...)`, auditing the rejected attempt like any other refusal;
 *  nothing else should ever let this escape as an unhandled 500. */
export class LastOwnerError extends Error {
  constructor() {
    super('the club must keep at least one owner');
  }
}

/** Refuses a change that would strip the club's last owner seat: if `email` currently holds
 *  'owner' and `nextRole` is not also 'owner' (a demotion or an outright removal), the change
 *  only proceeds when at least one OTHER email still carries 'owner'. A grant that keeps or
 *  newly gives someone 'owner' never needs this check (the owner count can only grow). */
async function assertKeepsAnOwner(db: D1Database, email: string, nextRole: ClubRole | null): Promise<void> {
  if (nextRole === 'owner') return;
  if ((await getClubRole(db, email)) !== 'owner') return;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM club_roles WHERE role = 'owner'").first<{ n: number }>();
  const ownerCount = row?.n ?? 0;
  if (ownerCount <= 1) throw new LastOwnerError();
}

/** Grant (or change) an email's owner/admin seat: any existing owner/admin row for that email is
 *  replaced, so a person holds exactly one of the two at a time even though the table's own
 *  primary key would allow both. An instructor row for the same email, if any, is untouched: the
 *  two axes (admin access, instructor assignment) are independent. Refuses (see
 *  {@link LastOwnerError}) a demotion that would leave the club with no owner at all. */
export async function setClubRole(db: D1Database, email: string, role: ClubRole, grantedBy: string): Promise<void> {
  await assertKeepsAnOwner(db, email, role);
  await db.batch([
    db.prepare("DELETE FROM club_roles WHERE email = ?1 AND role IN ('owner','club-admin')").bind(email),
    db.prepare('INSERT INTO club_roles (email, role, granted_by) VALUES (?1, ?2, ?3)').bind(email, STORED_ROLE[role], grantedBy),
  ]);
}

/** Revoke an email's owner/admin seat entirely (an instructor row, if any, is untouched).
 *  Refuses (see {@link LastOwnerError}) removing the club's last owner. */
export async function removeClubRole(db: D1Database, email: string): Promise<void> {
  await assertKeepsAnOwner(db, email, null);
  await db.prepare("DELETE FROM club_roles WHERE email = ?1 AND role IN ('owner','club-admin')").bind(email).run();
}

/** The site's `navFilter` (the engine's Part C per-request nav-hiding seam): drops the Club
 *  section for a signed-in editor with no club role, so the sidebar never teases a link the
 *  layout guard (`+layout.server.ts`) would then refuse. A missing `CLUB_DB` binding (a
 *  misconfigured environment) fails closed the same way a missing role does, rather than
 *  showing a section that would 403 on click. */
export async function filterClubNav(
  items: ResolvedNavItem[],
  ctx: { editor: Editor; event: ContentEvent },
): Promise<ResolvedNavItem[]> {
  const db = resolveClubDb(ctx.event.platform?.env);
  const role = db ? await getClubRole(db, ctx.editor.email) : null;
  return role ? items : items.filter((item) => item.label !== 'Club');
}
