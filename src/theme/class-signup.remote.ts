// The public class signup/waitlist form's remote functions (`joinClass`, `checkClassEligibility`,
// `requestRenewLink`), following `contact.remote.ts`/`donate.remote.ts` as the family precedent.
// The actual schema and handler logic live in class-signup-form.ts (a `.remote.ts` file may only
// export remote functions), so this file is just the thin wiring.
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { form, query, getRequestEvent } from '$app/server';
import {
  classSignupSchema,
  handleClassSignup,
  requestClassRenewLinkSchema,
  handleRequestClassRenewLink,
  resolveClassEligibility,
} from './class-signup-form';
import { checkRateLimitKeys, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';
import { normalizeEmail } from '$admin-club/lib/member-normalize.js';

export const joinClass = form(classSignupSchema, async (input) => {
  const { platform, getClientAddress } = getRequestEvent();
  return handleClassSignup(input, platform?.env, getClientAddress());
});

/** The email-blur standing probe (`docs/2026-07-13-unified-signup-design.md`'s "The class door
 *  gate"): after `checkKnownEmail` (`join-apply.remote.ts`) confirms the email belongs to a
 *  member, this answers whether that household's standing lets the visitor proceed on this page,
 *  so the page can pivot into the join door or the renewal handoff before the rest of the form is
 *  filled. Fails open (`status: 'eligible'`) when CLUB_DB is unavailable; the real gate always
 *  runs again at submit, inside `handleClassSignup`. */
export const checkClassEligibility = query(v.pipe(v.string(), v.trim()), async (email) => {
  const { platform, getClientAddress } = getRequestEvent();

  // Coverage table item 4 (docs/2026-07-15-payments-live-smoke-design.md section 2b): this probe
  // answers a member's household standing, so it's kept per IP and per probed email to blunt a
  // scripted sweep without blocking the normal one-check-per-blur a real visitor's form triggers.
  const rateLimitAllowed = await checkRateLimitKeys(platform?.env.RATE_LIMIT_ENUMERATION, [`ip:${getClientAddress()}`, `email:${normalizeEmail(email)}`]);
  if (!rateLimitAllowed) error(429, RATE_LIMIT_MESSAGE);

  const db = platform?.env.CLUB_DB;
  if (!db) return { status: 'eligible' as const };
  return { status: await resolveClassEligibility(db, email) };
});

/** The renew pivot's own "email me a sign-in link" button (2026-07-14 amendment): wires
 *  `handleRequestClassRenewLink` to the live request's platform env and origin. */
export const requestRenewLink = form(requestClassRenewLinkSchema, async (input) => {
  const { platform, getClientAddress, url } = getRequestEvent();
  return handleRequestClassRenewLink(input, platform?.env, getClientAddress(), url.origin);
});
