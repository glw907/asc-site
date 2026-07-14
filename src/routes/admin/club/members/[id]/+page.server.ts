// The Club section's household desk (Task 4, docs/plans/2026-07-14-membership-admin.md): the
// read side of the household-grouped Members screen's own detail route, replacing the fixture-
// backed member-detail screen (demo-members.ts) this route previously carried. `id` in the URL is
// a household id; a member id (any surviving link to the old per-member detail route) resolves
// through `resolveMemberHousehold` and redirects to the household it belongs to, per the design
// doc's own household-desk section. `getHouseholdStanding` (from `$member-auth/lib/standing`,
// Task 2) grounds the header's standing summary: it is the single-household lookup that module's
// own header names as the admin's shared vocabulary with the class/join doors, distinct from
// `households-store.ts`'s own duplicated batch math for the list screen's 148-row read. Write
// actions (roster CRUD, household surgery, manual payments, tier change, refunds) are all later
// tasks (5-6); this load is read-only.
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { getHouseholdDesk, resolveMemberHousehold, type HouseholdDesk } from '$admin-club/lib/households-store';
import { getHouseholdTimeline, type TimelineTransaction } from '$admin-club/lib/money-store';
import { getHouseholdStanding, type HouseholdStanding } from '$member-auth/lib/standing';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  const id = event.params.id;

  if (!db) {
    return {
      desk: null as HouseholdDesk | null,
      timeline: [] as TimelineTransaction[],
      standing: null as HouseholdStanding | null,
      error: 'CLUB_DB is not bound.',
    };
  }

  const desk = await getHouseholdDesk(db, id);
  if (!desk) {
    const householdId = await resolveMemberHousehold(db, id);
    if (householdId) redirect(307, `/admin/club/members/${householdId}`);
    return { desk: null, timeline: [] as TimelineTransaction[], standing: null as HouseholdStanding | null, error: null as string | null };
  }

  const [timeline, standing] = await Promise.all([getHouseholdTimeline(db, desk.id), getHouseholdStanding(db, desk.id)]);

  return { desk, timeline, standing, error: null as string | null };
};
