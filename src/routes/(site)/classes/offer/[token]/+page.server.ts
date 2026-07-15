// The public waitlist-offer claim/decline page (Task 8): the token an admin mints from the Club
// classes screen (Task 7's `offerSpot`) lands here. `load` only ever previews (never mutates), so
// viewing the page before deciding never itself resolves anything; the real claim or decline goes
// through the `claim`/`decline` actions below, which do mutate (and lazily expire a stale row).
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { claimOffer, declineOffer, previewOffer, toSqliteDatetime } from '$admin-club/lib/offers';
import { verifyTurnstile } from '$theme/turnstile';

export const prerender = false;

/**
 * `claim`/`decline` carry no CSRF token today (the offer token itself already limits who can
 * reach these actions). The Turnstile hardening pass (2026-07-15) adds a same-origin check as
 * the token's replacement, matching `svelte.config.js`'s own `csrf.checkOrigin: false` note that
 * the engine's global origin check is handed over to the admin's own guard: this route needs its
 * own, narrower check instead. Tolerant of a missing `Origin` header (a JS-free form POST
 * sometimes sends none), refusing only a header that names a different origin.
 */
function isCrossOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin !== url.origin;
}

/** The friction tradeoff (spec `2026-07-15-payments-live-smoke-design.md` section 2a): a member
 *  reaches this page from their own offer email, so a Turnstile challenge on `claim`/`decline`
 *  adds friction to an already token-gated action. The ruling stands (Turnstile everywhere on a
 *  public unauthenticated POST) unless Geoff overrides in review. */
async function verifiedOrTurnstileFailure(request: Request, url: URL, env: { TURNSTILE_SECRET_KEY?: string } | undefined, getClientAddress: () => string): Promise<string | null> {
  if (isCrossOrigin(request, url)) return 'Please try again.';

  const secret = env?.TURNSTILE_SECRET_KEY;
  if (!secret) return null;
  const form = await request.formData();
  const token = String(form.get('cf-turnstile-response') ?? '');
  if (!(await verifyTurnstile(token, getClientAddress(), secret))) return 'Spam check failed. Please try again.';
  return null;
}

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'This link is not available right now.');

  const preview = await previewOffer(db, params.token);
  if ('error' in preview) error(404, preview.error);

  const isExpired = preview.resolved === null && preview.expiresAt <= toSqliteDatetime(new Date());
  return { offer: preview, isExpired };
};

export const actions: Actions = {
  claim: async ({ params, platform, request, url, getClientAddress }) => {
    const turnstileError = await verifiedOrTurnstileFailure(request, url, platform?.env, getClientAddress);
    if (turnstileError) return fail(400, { error: turnstileError });

    const db = platform?.env.CLUB_DB;
    if (!db) return fail(503, { error: 'This link is not available right now.' });

    // The class-reminder set's own `welcome` touch (`class-welcome.ts`'s own header): a claimed
    // offer is as real an enrollment moment as a direct signup, so it gets the same welcome.
    const notify = platform?.env.EMAIL ? { EMAIL: platform.env.EMAIL } : undefined;
    const result = await claimOffer(db, params.token, notify);
    if ('error' in result) return fail(400, { error: result.error });
    return { claimed: true as const, result };
  },

  decline: async ({ params, platform, request, url, getClientAddress }) => {
    const turnstileError = await verifiedOrTurnstileFailure(request, url, platform?.env, getClientAddress);
    if (turnstileError) return fail(400, { error: turnstileError });

    const db = platform?.env.CLUB_DB;
    if (!db) return fail(503, { error: 'This link is not available right now.' });

    const result = await declineOffer(db, params.token);
    if ('error' in result) return fail(400, { error: result.error });
    return { declined: true as const };
  },
};
