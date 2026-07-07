// The public class signup/waitlist page's own `load` (Task 8): reads the class from asc-club
// directly (not through `$theme/events-data.ts`, which still reads asc-ops until Task 9), so this
// route works against the real signup source from day one regardless of the events listing's own
// repoint timing.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClassWithCounts } from '$admin-club/lib/classes-store';
import { getWaiverTextVersion } from '$admin-club/lib/club-settings';

// The class's fullness (and so whether this page enrolls or waitlists) is read live at request
// time, the same reason /events stays dynamic.
export const prerender = false;

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'Class signup is not available right now.');

  const cls = await getClassWithCounts(db, params.id);
  if (!cls || !cls.visible) error(404, 'No such class.');

  const waiverVersion = await getWaiverTextVersion(db);
  return { cls, waiverVersion };
};
