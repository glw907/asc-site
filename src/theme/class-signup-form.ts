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
import { getWaiverTextVersion } from '$admin-club/lib/club-settings';
import { verifyTurnstile } from './turnstile';

export const classSignupSchema = v.object({
  classId: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your name.')),
  email: v.pipe(v.string(), v.trim(), v.email('Please enter a valid email address.')),
  phone: v.optional(v.pipe(v.string(), v.trim()), ''),
  waiverAccepted: v.pipe(
    v.optional(v.boolean(), false),
    v.check((accepted) => accepted, 'Please check the box to accept the liability release before you sign up.'),
  ),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export type ClassSignupSubmission = v.InferOutput<typeof classSignupSchema>;

/** The slice of `App.Platform['env']` this handler actually reads, narrowed the same way
 *  `club-roles.ts`'s own `resolveClubDb` narrows `platform.env`: a plain `env: unknown` argument,
 *  cast internally, so a caller (or a test) never has to satisfy the engine's full
 *  `CairnPlatformBindings` shape just to exercise this one form. */
interface ClassSignupEnv {
  CLUB_DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
}

/** Sign up for a class from the public form's own submission: Turnstile-gated (degrading
 *  gracefully when no secret is configured, matching `contact.remote.ts`/`donate.remote.ts`),
 *  reads the current liability-release wording version, then hands off to `enrollments.ts`'s
 *  `signUpForClass` for the actual enroll-or-waitlist decision. */
export async function handleClassSignup(
  input: ClassSignupSubmission,
  env: unknown,
  clientAddress: string,
): Promise<SignUpResult> {
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

  const waiverVersion = await getWaiverTextVersion(db);
  const signupInput: SignUpForClassInput = {
    classId: input.classId,
    name: input.name,
    email: input.email,
    phone: input.phone || undefined,
    waiverVersion,
  };
  const result = await signUpForClass(db, signupInput);
  if ('error' in result) invalid(result.error);

  return result;
}
