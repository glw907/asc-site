// /my-account: the member landing (signed in) and the sign-in form (signed out), one route for
// both per the design doc's own IA ("the landing" doubles as sign-in when no session exists) and
// mockup frames 01/02. This task keeps the signed-in state auth-focused (name + standing card
// only); the full task-list/receipts/household composition is a later pass's own work.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestMemberLink, destroyMemberSession, issueMemberCsrfToken, validateMemberCsrfToken } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getMemberStanding } from '$member-auth/lib/standing';
import { siteConfig } from '$theme/cairn.config';

export const prerender = false;

// The site's established from-address, matching contact.remote.ts's own FROM_ADDRESS constant
// (kept as this route's own copy rather than importing that module, since member-auth's send
// path should not depend on the contact form's).
const FROM_ADDRESS = 'noreply@aksailingclub.org';

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) return { member: null, csrf, standing: null };

  const db = resolveMemberDb(event.platform?.env);
  const standing = db ? await getMemberStanding(db, member.id) : null;
  return { member, csrf, standing };
};

export const actions: Actions = {
  requestLink: async (event) => {
    if (!(await validateMemberCsrfToken(event))) return fail(403, { error: 'Please try again.' });

    const form = await event.request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { error: 'Please enter your email address.' });

    const db = resolveMemberDb(event.platform?.env);
    if (!db) return fail(503, { error: "This isn't available right now. Please try again shortly." });
    const emailBinding = event.platform?.env.EMAIL;
    if (!emailBinding) return fail(503, { error: 'Mail service is not configured yet. Contact the club instead.' });

    const result = await requestMemberLink(db, email, (message) => emailBinding.send(message), {
      origin: event.url.origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
    });
    if (result.status === 'send_error') {
      return fail(500, { error: 'Something went wrong sending your link. Please try again.' });
    }
    return { sent: true as const };
  },

  signOut: async (event) => {
    const db = resolveMemberDb(event.platform?.env);
    const cookieName = memberSessionCookieName(event.url.protocol === 'https:');
    const sessionId = event.cookies.get(cookieName);
    if (db && sessionId) await destroyMemberSession(db, sessionId);
    event.cookies.delete(cookieName, { path: '/' });
    redirect(303, '/my-account');
  },
};
