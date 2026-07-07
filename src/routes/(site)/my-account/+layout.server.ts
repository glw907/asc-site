// The member-session resolver for /my-account/**: reads the member session cookie (or its
// non-secure fallback in local dev), resolves it against CLUB_DB, and hands the result down as
// `locals.member` / `data.member`. Deliberately never redirects or errors on a missing or invalid
// session: every page under this group renders its own signed-out state instead (the landing
// doubles as the sign-in form, mockup frame 01; the confirm flow must work while signed out by
// definition, since it is the very mechanism that creates a session) — "signed-out -> the sign-in
// page, not an error" is this task's own instruction for this file.
import type { LayoutServerLoad } from './$types';
import { getMemberSession } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

export const load: LayoutServerLoad = async (event) => {
  const db = resolveMemberDb(event.platform?.env);
  const cookieName = memberSessionCookieName(event.url.protocol === 'https:');
  const sessionId = event.cookies.get(cookieName);
  const member = db && sessionId ? await getMemberSession(db, sessionId) : null;
  event.locals.member = member;
  return { member };
};
