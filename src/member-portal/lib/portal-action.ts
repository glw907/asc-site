// The portal's own action wrapper, mirroring `$admin-club/lib/club-action.ts`'s shape for the
// member-facing side: every `/my-account/**` write needs the same checks `clubAdminAction`
// composes for `/admin/club/**` (CSRF, a resolved DB, a verified identity), just against a member
// session instead of a club role, and with no engine `adminAction` to compose onto (a member
// session is not a cairn editor at all, `$member-auth/lib/auth.ts`'s own header on why the two
// stores never blur). Built directly on `validateMemberCsrfToken`/`getMemberSession`
// (`$member-auth/lib/auth.ts`), never a second copy of either's own token logic.
import { fail } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { getMemberSession, type MemberRow } from '$member-auth/lib/auth';
import { memberCsrfCookieName, memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';

/** The minimal event shape `portalAction` reads: enough to verify CSRF, resolve the session
 *  cookie, and read the form once, mirroring the engine's own narrow-event trick
 *  (`club-action.ts`'s own `AdminActionEvent` reuse) so a wrapped function still satisfies
 *  SvelteKit's own `Actions` shape for a route's `$types`. */
export interface PortalActionEvent {
  url: URL;
  request: Request;
  cookies: { get(name: string): string | undefined; set(name: string, value: string, opts: { path: string; [key: string]: unknown }): void };
  platform?: { env: unknown };
}

/** What a `portalAction` handler receives: the signed-in member's own row, the resolved `CLUB_DB`
 *  handle, and the household's own primary flag, all already checked by the wrapper. */
export interface PortalActionContext {
  member: MemberRow;
  db: D1Database;
  /** Whether `member` is their household's own primary (`households.primary_member_id`):
   *  household-write actions (leave-the-club, remove-a-member, set-anyone's-visibility) gate on
   *  this themselves; reading it here saves every such handler a repeat lookup. */
  isPrimary: boolean;
}

/** A length-checked constant-time compare (mirrors `$member-auth/lib/auth.ts`'s own private
 *  `tokensMatch`, reimplemented here rather than exported from that module purely for this one
 *  caller). */
function tokensMatch(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compose the checks every `/my-account/**` write needs, in order: CSRF (the double-submit token,
 * checked against the form's own `csrf` field, read once here), a resolved `CLUB_DB` binding (a
 * missing binding fails closed, 500, the same `club-action.ts` convention), and a live member
 * session (a missing or expired session fails closed, 401 — the route itself is reachable only
 * when signed in, so reaching this wrapper with no session means the cookie expired mid-visit,
 * not a normal refusal path a form ever needs to render specially). Mirrors `club-action.ts`'s own
 * `clubAdminAction` shape: a single `{ event, form, ctx }` handler, `form` read once by the
 * wrapper itself so no handler re-reads the request body.
 */
export function portalAction<T>(handler: (args: { event: PortalActionEvent; form: FormData; ctx: PortalActionContext }) => Promise<T>) {
  return async (event: PortalActionEvent) => {
    const form = await event.request.clone().formData();
    const cookie = event.cookies.get(memberCsrfCookieName(event.url.protocol === 'https:'));
    const submitted = String(form.get('csrf') ?? '');
    if (!cookie || !tokensMatch(submitted, cookie)) {
      return fail(403, { error: 'Please try again.' });
    }

    const db = resolveMemberDb(event.platform?.env);
    if (!db) return fail(500, { error: "This isn't available right now." });

    const cookieName = memberSessionCookieName(event.url.protocol === 'https:');
    const sessionId = event.cookies.get(cookieName);
    const member = sessionId ? await getMemberSession(db, sessionId) : null;
    if (!member) return fail(401, { error: 'Please sign in again.' });

    const household = await db
      .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
      .bind(member.householdId)
      .first<{ primary_member_id: string | null }>();
    const isPrimary = household?.primary_member_id === member.id;

    return handler({ event, form, ctx: { member, db, isPrimary } });
  };
}
