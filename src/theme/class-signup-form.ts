// The public class signup form's schema and handler logic, factored out of
// `class-signup.remote.ts` (Task 8): a `.remote.ts` file may only export remote functions
// (`form`/`query`/`command`/`prerender`), so the actually-testable logic lives here instead, in a
// plain module the test suite can import directly. `getRequestEvent()` only resolves inside a real
// SvelteKit request, so `handleClassSignup` takes the platform env and client address as plain
// arguments rather than pulling them off the ambient request event, the same reason
// `contact.remote.ts`'s own handler stays untested at this layer.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { signUpForClass, type SignUpForClassInput, type SignUpResult } from '$admin-club/lib/enrollments';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { getWaiverTextVersion } from '$admin-club/lib/club-settings';
import { normalizeEmail } from '$admin-club/lib/member-normalize.js';
import { getMemberStanding } from '$member-auth/lib/standing';
import { requestMemberLink } from '$member-auth/lib/auth';
import { siteConfig } from '$theme/cairn.config';
import { verifyTurnstile } from './turnstile';
import { checkRateLimitKeys, RATE_LIMIT_MESSAGE } from './rate-limit';

/** The site's established from-address, matching `join-apply-form.ts`'s own copy of the same
 *  constant (kept as this module's own copy for the same reason that file gives). */
const FROM_ADDRESS = 'noreply@aksailingclub.org';

export const classSignupSchema = v.object({
  classId: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your name.')),
  email: v.pipe(v.string(), v.trim(), v.email('Please enter a valid email address.')),
  phone: v.optional(v.pipe(v.string(), v.trim()), ''),
  interests: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(1000, 'Please keep your answer under 1000 characters.')),
    '',
  ),
  waiverAccepted: v.pipe(
    v.optional(v.boolean(), false),
    v.check((accepted) => accepted, 'Please check the box to accept the liability release before you sign up.'),
  ),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export type ClassSignupSubmission = v.InferOutput<typeof classSignupSchema>;

/** The class-door standing gate's no-match pivot outcome (`docs/2026-07-13-unified-signup-
 *  design.md`'s "The class door gate"): the submitted email does not resolve to a member at all.
 *  Carries the fields the visitor already typed so the page can render an invitation into
 *  `/join/apply` with them pre-filled. */
export interface ClassSignupJoinPivot {
  pivot: 'join';
  classId: string;
  name: string;
  email: string;
  phone?: string;
}

/** The class-door standing gate's `lapsed` pivot outcome (amended 2026-07-14, the same section):
 *  the submitted email resolves to a member whose household has lapsed. Joining fresh would
 *  duplicate that household, so the page offers to email the member's own sign-in link instead
 *  (the same `requestMemberLink` wiring the join door's own renewal handoff uses), never the join
 *  carry-over. */
export interface ClassSignupRenewPivot {
  pivot: 'renew';
  email: string;
}

/** `handleClassSignup`'s full result: today's enroll-or-waitlist outcome, or one of the standing
 *  gate's two pivots. */
export type ClassSignupOutcome = SignUpResult | ClassSignupJoinPivot | ClassSignupRenewPivot;

/** The class-door standing gate's own three-way answer: `'eligible'` proceeds through the
 *  ordinary enroll/waitlist path, `'no-match'` pivots into the join door, and `'lapsed'` pivots
 *  into the renewal handoff instead (joining fresh would duplicate an existing household). */
export type ClassEligibilityStatus = 'eligible' | 'lapsed' | 'no-match';

/**
 * The class-door standing gate: resolves `email` (normalized) to a member and that member's
 * household standing. `'eligible'` only for a `current` or `grace` household; a no-match answers
 * `'no-match'`, and a `lapsed` household (including one with no paid membership at all, which
 * `getMemberStanding` also reports as `lapsed`) answers `'lapsed'`. The caller
 * (`handleClassSignup`, or the email-blur probe in `class-signup.remote.ts`) pivots the visitor
 * accordingly instead of the ordinary enroll/waitlist path. This is the one gate the public
 * form's submission runs through; the signed-in portal class flow (`$member-portal/lib/classes.ts`)
 * never calls it, since a member reaching that page is already authenticated.
 */
export async function resolveClassEligibility(db: D1Database, email: string): Promise<ClassEligibilityStatus> {
  const normalized = normalizeEmail(email);
  const member = await db.prepare('SELECT id FROM members WHERE email = ?1 LIMIT 1').bind(normalized).first<{ id: string }>();
  if (!member) return 'no-match';

  const standing = await getMemberStanding(db, member.id);
  if (standing?.status === 'current' || standing?.status === 'grace') return 'eligible';
  return 'lapsed';
}

/** The slice of `App.Platform['env']` this handler actually reads, narrowed the same way
 *  `club-db.ts`'s own `resolveClubDb` narrows `platform.env`: a plain `env: unknown` argument,
 *  cast internally, so a caller (or a test) never has to satisfy the engine's full
 *  `CairnPlatformBindings` shape just to exercise this one form. `EMAIL` threads through to
 *  `signUpForClass`'s own optional `notify` (the class-reminder set's `welcome` touch); missing
 *  it (no binding wired) is a normal, silent no-op there, never a signup failure.
 *  `DISCORD_WEBHOOK_CLASSES` threads through to `signUpForClass`'s own optional `discord` (the
 *  classes-channel committee ping, `docs/discord-notifications-wiring.md`); missing it is
 *  `notifyDiscord`'s own silent no-op, same as a missing `EMAIL`. */
interface ClassSignupEnv {
  CLUB_DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL?: EmailBindingEnv['EMAIL'];
  DISCORD_WEBHOOK_CLASSES?: string;
  RATE_LIMIT_PUBLIC_POST?: RateLimit;
}

/** Sign up for a class from the public form's own submission: Turnstile-gated (degrading
 *  gracefully when no secret is configured, matching `contact.remote.ts`/`donate.remote.ts`),
 *  gated on the class-door standing check ({@link resolveClassEligibility}; a no-match pivots into
 *  the join door and a `lapsed` household pivots into the renewal handoff, both never reaching the
 *  rest of this function), then reads the current liability-release wording version and hands off
 *  to `enrollments.ts`'s `signUpForClass` for the actual enroll-or-waitlist decision. */
export async function handleClassSignup(
  input: ClassSignupSubmission,
  env: unknown,
  clientAddress: string,
): Promise<ClassSignupOutcome> {
  const platformEnv = env as ClassSignupEnv | undefined;

  // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b): every
  // public POST, keyed per IP and per email.
  const rateLimitAllowed = await checkRateLimitKeys(platformEnv?.RATE_LIMIT_PUBLIC_POST, [`ip:${clientAddress}`, `email:${input.email.toLowerCase()}`]);
  if (!rateLimitAllowed) invalid(RATE_LIMIT_MESSAGE);

  const secret = platformEnv?.TURNSTILE_SECRET_KEY;
  const token = input['cf-turnstile-response'];
  if (secret && !(await verifyTurnstile(token, clientAddress, secret))) {
    invalid('Spam check failed. Please try again.');
  }

  const db = platformEnv?.CLUB_DB;
  if (!db) {
    invalid('Class signup is not available right now. You can email board@aksailingclub.org instead.');
  }

  const eligibility = await resolveClassEligibility(db, input.email);
  if (eligibility === 'no-match') {
    return {
      pivot: 'join',
      classId: input.classId,
      name: input.name,
      email: input.email,
      phone: input.phone || undefined,
    };
  }
  if (eligibility === 'lapsed') {
    return { pivot: 'renew', email: input.email };
  }

  const waiverVersion = await getWaiverTextVersion(db);
  const signupInput: SignUpForClassInput = {
    classId: input.classId,
    name: input.name,
    email: input.email,
    phone: input.phone || undefined,
    interests: input.interests || undefined,
    waiverVersion,
  };
  const result = await signUpForClass(
    db,
    signupInput,
    platformEnv?.EMAIL ? { EMAIL: platformEnv.EMAIL } : undefined,
    { DISCORD_WEBHOOK_CLASSES: platformEnv?.DISCORD_WEBHOOK_CLASSES },
  );
  if ('error' in result) invalid(result.error);

  return result;
}

/** The renew pivot's own "email me a sign-in link" button's schema (2026-07-15 Turnstile
 *  hardening pass): pulled out of `class-signup.remote.ts` alongside the other schemas in this
 *  file so it stays testable (a `.remote.ts` file may only export remote functions). */
export const requestClassRenewLinkSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email()),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export type RequestClassRenewLinkSubmission = v.InferOutput<typeof requestClassRenewLinkSchema>;

/** The renew pivot's own "email me a sign-in link" button (`docs/2026-07-13-unified-signup-
 *  design.md`'s "The class door gate", 2026-07-14 amendment): the same enumeration-safe
 *  `requestMemberLink` wiring the join door's own renewal handoff uses. Turnstile-gated
 *  (2026-07-15 hardening pass), degrading gracefully when no secret is configured, matching
 *  {@link handleClassSignup}. Always answers `{ sent: true }`, whether or not `email` resolves to
 *  a member (that safety property, and the reason, live on `requestMemberLink` itself) or `EMAIL`
 *  is bound at all (a missing binding degrades silently, matching `handleClassSignup`'s own
 *  optional-`EMAIL` convention above). */
export async function handleRequestClassRenewLink(
  input: RequestClassRenewLinkSubmission,
  env: unknown,
  clientAddress: string,
  origin: string,
): Promise<{ sent: true }> {
  const platformEnv = env as ClassSignupEnv | undefined;

  // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b): every
  // public POST, keyed per IP and per email. Blunts scripted mailing of the send path.
  const rateLimitAllowed = await checkRateLimitKeys(platformEnv?.RATE_LIMIT_PUBLIC_POST, [`ip:${clientAddress}`, `email:${input.email.toLowerCase()}`]);
  if (!rateLimitAllowed) invalid(RATE_LIMIT_MESSAGE);

  const secret = platformEnv?.TURNSTILE_SECRET_KEY;
  const token = input['cf-turnstile-response'];
  if (secret && !(await verifyTurnstile(token, clientAddress, secret))) {
    invalid('Spam check failed. Please try again.');
  }

  const db = platformEnv?.CLUB_DB;
  if (db && platformEnv?.EMAIL) {
    const emailBinding = platformEnv.EMAIL;
    await requestMemberLink(db, input.email, (message) => emailBinding.send(message), {
      origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
    });
  }
  return { sent: true };
}
