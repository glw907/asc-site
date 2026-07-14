// The public class signup/waitlist form's remote functions (Task 8's `joinClass`, Task 4's
// `checkClassEligibility`), following `contact.remote.ts`/`donate.remote.ts` as the family
// precedent. The actual schema and handler logic live in class-signup-form.ts (a `.remote.ts`
// file may only export remote functions), so this file is just the thin wiring.
import * as v from 'valibot';
import { form, query, getRequestEvent } from '$app/server';
import { classSignupSchema, handleClassSignup, resolveClassEligibility } from './class-signup-form';

export const joinClass = form(classSignupSchema, async (input) => {
  const { platform, getClientAddress } = getRequestEvent();
  return handleClassSignup(input, platform?.env, getClientAddress());
});

/** The email-blur standing probe (Task 4, `docs/2026-07-13-unified-signup-design.md`'s "The class
 *  door gate"): after `checkKnownEmail` (`join-apply.remote.ts`) confirms the email belongs to a
 *  member, this answers whether that household's standing lets the visitor proceed on this page,
 *  so the page can pivot into the join door before the rest of the form is filled. Fails open
 *  (`eligible: true`) when CLUB_DB is unavailable; the real gate always runs again at submit,
 *  inside `handleClassSignup`. */
export const checkClassEligibility = query(v.pipe(v.string(), v.trim()), async (email) => {
  const db = getRequestEvent().platform?.env.CLUB_DB;
  if (!db) return { eligible: true };
  return { eligible: await resolveClassEligibility(db, email) };
});
