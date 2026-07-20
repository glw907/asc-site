// The cross-class Class waitlist overview (pass B T4, docs/2026-07-19-asc-sidebar-build.md):
// waitlists otherwise live only inside each class's own detail page
// (`classes/[id]/+page.server.ts`), so an admin has to open every current-season class in turn to
// see who is queued anywhere. This screen reads the same tables that page does and lists every
// current-season class that has a nonempty waitlist in one place, read-only: it links into each
// class's own detail page for the offer/cancel actions that already exist there rather than
// duplicating them.
//
// Reachability rides the `/admin/club` section default (`src/theme/access.ts`): its admitted
// roles, `[Administrator, 'Club manager']`, already equal this screen's own roles, so no deeper
// map key is added (a deeper key would be redundant, not more correct -- `canReach`'s
// deepest-path-segment-prefix match already covers this child path).
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { listClassesWithCounts, listWaitlist, type ClassWithCounts, type WaitlistRow } from '$admin-club/lib/classes-store';
import { expireStaleOffers, listOutstandingOffers, type OfferRow } from '$admin-club/lib/offers';

/** One queued waitlist entry paired with its active offer, if any: the same pairing the per-class
 *  detail page's own `waitlistView` derives, reused here across classes. */
export interface ClassWaitlistEntry {
  entry: WaitlistRow;
  activeOffer: OfferRow | null;
}

/** One current-season class's outstanding waitlist state: its queued members and, if it has a
 *  free seat with someone still queued behind it, a flag the row template highlights. A class
 *  can be full and still carry a waitlist (people queued for a spot that has not opened yet) --
 *  that is the ordinary case this screen also lists, not the flagged one. */
export interface ClassWaitlistOverviewRow {
  cls: ClassWithCounts;
  entries: ClassWaitlistEntry[];
  freedSeatNoOffer: boolean;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { rows: [] as ClassWaitlistOverviewRow[], error: 'CLUB_DB is not bound.' };
  }
  try {
    // The same lazy sweep the per-class detail page's load runs before reading anything else, so
    // a stale, past-expiry offer never counts as active on this cross-class read either.
    await expireStaleOffers(db);
    const [season, classes, outstandingOffers] = await Promise.all([
      getCurrentSeason(db),
      listClassesWithCounts(db),
      listOutstandingOffers(db),
    ]);
    const currentSeasonWithWaitlist = classes.filter((cls) => cls.season === season && cls.waitlistCount > 0);
    const rows = await Promise.all(
      currentSeasonWithWaitlist.map(async (cls): Promise<ClassWaitlistOverviewRow> => {
        const waitlist = await listWaitlist(db, cls.id);
        const classOffers = outstandingOffers.filter((offer) => offer.classId === cls.id);
        const entries = waitlist.map((entry) => ({
          entry,
          activeOffer: classOffers.find((offer) => offer.waitlistId === entry.id) ?? null,
        }));
        return {
          cls,
          entries,
          freedSeatNoOffer: !cls.isFull && entries.some(({ activeOffer }) => activeOffer === null),
        };
      }),
    );
    return { rows, error: null as string | null };
  } catch (err) {
    console.error('admin/club/classes/waitlist: CLUB_DB read failed', err);
    return { rows: [] as ClassWaitlistOverviewRow[], error: 'Could not read the classes/waitlist tables.' };
  }
};
