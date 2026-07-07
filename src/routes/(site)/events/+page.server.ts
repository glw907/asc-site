// Task 4's dedicated /events route: it shadows the general (site)/[...path] catch-all for this
// one literal path (SvelteKit always prefers a literal segment route over a rest-parameter one),
// so the "events" pages content entry keeps its editable editorial intro (rendered through the
// exact same plumbing the catch-all uses, via the shared `routes` in $theme/public-routes), while
// the listing below it reads the club's live D1 events (Task 4's own site-owned surface).
import type { PageServerLoad } from './$types';
import { routes } from '$theme/public-routes';
import { loadSeasonMonths } from '$theme/season-data';

// The season listing below the intro reads D1 at request time, so this page cannot be prerendered
// the static way every other content page is; left dynamic (the project default), same as /admin.
export const prerender = false;

export const load: PageServerLoad = async ({ url, platform }) => {
  const entry = await routes.entryLoad({ url });
  const db = platform?.env.EVENTS_DB;
  const season = db ? await loadSeasonMonths(db) : [];
  return { ...entry, season };
};
