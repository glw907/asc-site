// The public join door's own `load` (Task 3): the current tier prices, and every visible
// current-season class with its live fee and fullness (a full class still lists, so a member can
// still pick it and land on the waitlist, per the design's own "Classes (optional)" section).
// Read live at request time, the same reason the class-signup page and the class-schedule island
// both stay dynamic.
//
// The class-door standing gate (Task 4): a visitor arriving from the class door's own invitation
// (`/join/apply?class=<id>&name=…&email=…&phone=…`) carries the fields they already typed there,
// so this door's own form seeds from them instead of asking again. `class` only prefills the
// purchaser's own pick when it names a real, visible, current-season class; an unknown or stale
// id is silently dropped rather than failing the whole page load.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listClassesWithCounts, isPubliclyOpen } from '$admin-club/lib/classes-store';
import { hasActiveOfferForClass } from '$admin-club/lib/offers';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';

export const prerender = false;

export const load: PageServerLoad = async ({ platform, url }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'Joining online is not available right now.');

  const [prices, season, allClasses] = await Promise.all([
    getTierPrices(db),
    getCurrentSeason(db),
    listClassesWithCounts(db),
  ]);

  const seasonClasses = allClasses.filter((cls) => cls.season === season && cls.visible);
  const classes = await Promise.all(
    seasonClasses.map(async (cls) => ({
      id: cls.id,
      name: cls.name,
      fee: cls.fee,
      isFull: !isPubliclyOpen(cls, await hasActiveOfferForClass(db, cls.id)),
    })),
  );

  const carriedClassId = url.searchParams.get('class');
  const prefill = {
    name: url.searchParams.get('name') ?? '',
    email: url.searchParams.get('email') ?? '',
    phone: url.searchParams.get('phone') ?? '',
    classId: carriedClassId && classes.some((cls) => cls.id === carriedClassId) ? carriedClassId : '',
  };

  return { prices, season, classes, prefill };
};
