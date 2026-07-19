// Shared plumbing every /admin/club/** server file, hooks.server.ts, and the jobs runner use to
// read the site's own CLUB_DB binding (initiative 5 Task 2: this lived in club-roles.ts until the
// role-management table that module read went away with the roles collapse; CLUB_DB itself is not
// going anywhere, so its accessor moved to a home of its own rather than retiring with the rest).
import type { D1Database } from '@cloudflare/workers-types';
import type { Role } from '@glw907/cairn-cms';

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

/** The two role names with club access, named roles rather than owner CAPABILITY (see
 *  `club-action.ts`'s `clubAdminAction` doc comment for why that distinction matters). The one
 *  place this pair is written, so the `/admin/club` layout guard, `clubAdminAction`'s routine
 *  gate, and the navLayout tree's `roles` lists can never drift from each other. Renamed from
 *  `['owner', 'club-admin']` by the roles-adoption pass's T2 (docs/2026-07-19-asc-roles-adoption.md);
 *  the reserved `owner` role stays declared in `cairn.config.ts`'s vocabulary but is never granted
 *  again, so it carries no club access here either. */
export const CLUB_ROLES: Role[] = ['Administrator', 'Club manager'];
