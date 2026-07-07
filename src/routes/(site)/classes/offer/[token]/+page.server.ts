// The public waitlist-offer claim/decline page (Task 8): the token an admin mints from the Club
// classes screen (Task 7's `offerSpot`) lands here. `load` only ever previews (never mutates), so
// viewing the page before deciding never itself resolves anything; the real claim or decline goes
// through the `claim`/`decline` actions below, which do mutate (and lazily expire a stale row).
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { claimOffer, declineOffer, previewOffer, toSqliteDatetime } from '$admin-club/lib/offers';

export const prerender = false;

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'This link is not available right now.');

  const preview = await previewOffer(db, params.token);
  if ('error' in preview) error(404, preview.error);

  const isExpired = preview.resolved === null && preview.expiresAt <= toSqliteDatetime(new Date());
  return { offer: preview, isExpired };
};

export const actions: Actions = {
  claim: async ({ params, platform }) => {
    const db = platform?.env.CLUB_DB;
    if (!db) return fail(503, { error: 'This link is not available right now.' });

    const result = await claimOffer(db, params.token);
    if ('error' in result) return fail(400, { error: result.error });
    return { claimed: true as const, result };
  },

  decline: async ({ params, platform }) => {
    const db = platform?.env.CLUB_DB;
    if (!db) return fail(503, { error: 'This link is not available right now.' });

    const result = await declineOffer(db, params.token);
    if ('error' in result) return fail(400, { error: result.error });
    return { declined: true as const };
  },
};
