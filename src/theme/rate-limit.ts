// Wraps the Workers rate-limiting binding (the GA `RateLimit` type, declared per limit class in
// `wrangler.toml`'s `[[ratelimits]]` block) behind a small helper every write path and
// enumeration probe calls through, following the same degrade-to-open convention
// `turnstile.ts`'s callers already use for `TURNSTILE_SECRET_KEY`: a binding absent from the
// running environment (local dev, vitest, or a not-yet-provisioned deploy) never blocks a
// request, and a present binding fails closed once its key is over its limit.
import type { RateLimit } from '@cloudflare/workers-types';

/** The user-facing message every fail-closed rate-limit rejection uses, shared so a caller's
 *  `invalid()`/`fail()` text stays consistent across call sites. */
export const RATE_LIMIT_MESSAGE = 'Too many requests. Please wait a moment and try again.';

/**
 * Check one rate-limit binding for `key`. Answers `true` (allowed) whenever `binding` is
 * `undefined`: the degrade-to-open case for an environment with no `[[ratelimits]]` binding
 * wired, the same convention `verifyTurnstile`'s `if (secret && ...)` callers use for a missing
 * `TURNSTILE_SECRET_KEY`. When `binding` is present, delegates to its own `limit()` call and
 * answers `false` once the caller is over its limit.
 */
export async function checkRateLimit(binding: RateLimit | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  const { success } = await binding.limit({ key });
  return success;
}

/**
 * Check the same binding against several keys in turn (the "per IP AND per email" coverage the
 * public-POST and enumeration paths need: a scripted client that rotates emails from one IP
 * still trips the IP key, and a client that rotates IPs still trips the email key), short-
 * circuiting and answering `false` the moment any key is over its limit. An empty `keys` array
 * (nothing to check, the caller had no discriminating value to key on) always answers `true`.
 */
export async function checkRateLimitKeys(binding: RateLimit | undefined, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (!(await checkRateLimit(binding, key))) return false;
  }
  return true;
}
