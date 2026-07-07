// The narrow, explained cast every member-auth route uses to read CLUB_DB off a platform env.
// Mirrors `$admin-club/lib/club-roles.ts`'s own `resolveClubDb` (same binding, same reasoning)
// but kept as this module's own copy rather than an import, so `src/member-auth/` stays
// independent of `src/admin-club/` (this tree's own boundary, stated in `auth.ts`'s header: the
// member-facing identity, not the club-admin surface). `CLUB_DB` is the SAME asc-club database
// both trees read (member auth tables live alongside the club-admin domain tables,
// `migrations/asc-club/0008_member_auth/`), just through two separate accessors that happen to
// agree, the same way the engine's own `AuthEnv` is a structural subset a caller casts to rather
// than a shared import.
import type { D1Database } from '@cloudflare/workers-types';

/** Read the site's `CLUB_DB` binding off a platform env, or `undefined` if it is not configured
 *  (a misconfigured environment fails closed rather than throwing). */
export function resolveMemberDb(env: unknown): D1Database | undefined {
  return (env as { CLUB_DB?: D1Database } | undefined)?.CLUB_DB;
}
