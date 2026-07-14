// The public class signup form's schema and handler logic, factored out of
// `class-signup.remote.ts` (Task 8): a `.remote.ts` file may only export remote functions
// (`form`/`query`/`command`/`prerender`), so the actually-testable logic lives here instead, in a
// plain module the test suite can import directly. `getRequestEvent()` only resolves inside a real
// SvelteKit request, so `handleClassSignup` takes the platform env and client address as plain
// arguments rather than pulling them off the ambient request event, the same reason
// `contact.remote.ts`'s own handler stays untested at this layer.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { signUpForClass, type SignUpForClassInput, type SignUpResult } from '$admin-club/lib/enrollments';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { getWaiverTextVersion } from '$admin-club/lib/club-settings';
import { normalizeEmail } from '$admin-club/lib/member-normalize.js';
import { getMemberStanding } from '$member-auth/lib/standing';
import { verifyTurnstile } from './turnstile';

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

/** The class-door standing gate's pivot outcome (Task 4, `docs/2026-07-13-unified-signup-design.md`'s
 *  "The class door gate"): the submitted email never reached `signUpForClass`, because it does not
 *  resolve to a member whose household stands `current` or `grace`. Carries the fields the visitor
 *  already typed so the page can render an invitation into `/join/apply` with them pre-filled. */
export interface ClassSignupPivot {
  pivot: 'join';
  classId: string;
  name: string;
  email: string;
  phone?: string;
}

/** `handleClassSignup`'s full result: today's enroll-or-waitlist outcome, or the standing gate's
 *  pivot into the join door. */
export type ClassSignupOutcome = SignUpResult | ClassSignupPivot;

/**
 * The class-door standing gate: true only when `email` (normalized) resolves to a member whose
 * household currently stands `current` or `grace`. A no-match, or a `lapsed` household, answers
 * false, and the caller (`handleClassSignup`, or the email-blur probe in `class-signup.remote.ts`)
 * pivots the visitor into the join door instead of the ordinary enroll/waitlist path. This is the
 * one gate the public form's submission runs through; the signed-in portal class flow
 * (`$member-portal/lib/classes.ts`) never calls it, since a member reaching that page is already
 * authenticated.
 */
export async function resolveClassEligibility(db: D1Database, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const member = await db.prepare('SELECT id FROM members WHERE email = ?1 LIMIT 1').bind(normalized).first<{ id: string }>();
  if (!member) return false;

  const standing = await getMemberStanding(db, member.id);
  return standing?.status === 'current' || standing?.status === 'grace';
}

/** The slice of `App.Platform['env']` this handler actually reads, narrowed the same way
 *  `club-roles.ts`'s own `resolveClubDb` narrows `platform.env`: a plain `env: unknown` argument,
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
}

/** Sign up for a class from the public form's own submission: Turnstile-gated (degrading
 *  gracefully when no secret is configured, matching `contact.remote.ts`/`donate.remote.ts`),
 *  gated on the class-door standing check ({@link resolveClassEligibility}; a no-match or lapsed
 *  household pivots into the join door and never reaches the rest of this function), then reads
 *  the current liability-release wording version and hands off to `enrollments.ts`'s
 *  `signUpForClass` for the actual enroll-or-waitlist decision. */
export async function handleClassSignup(
  input: ClassSignupSubmission,
  env: unknown,
  clientAddress: string,
): Promise<ClassSignupOutcome> {
  const platformEnv = env as ClassSignupEnv | undefined;
  const secret = platformEnv?.TURNSTILE_SECRET_KEY;
  const token = input['cf-turnstile-response'];
  if (secret && !(await verifyTurnstile(token, clientAddress, secret))) {
    invalid('Spam check failed. Please try again.');
  }

  const db = platformEnv?.CLUB_DB;
  if (!db) {
    invalid('Class signup is not available right now. You can email board@aksailingclub.org instead.');
  }

  if (!(await resolveClassEligibility(db, input.email))) {
    return {
      pivot: 'join',
      classId: input.classId,
      name: input.name,
      email: input.email,
      phone: input.phone || undefined,
    };
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
