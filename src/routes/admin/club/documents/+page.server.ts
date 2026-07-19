// The Club section's "is the club protected" rollup (member-waivers T6, spec decision 8): each
// signable document for a season, with its signed and outstanding counts, and a link into the
// per-document drill-through ([document]/+page.server.ts). Read-only, like Signups and Money's own
// load: no Actions here, and `requireSession` is defense-in-depth (the `/admin/club` layout guard
// already gates the whole section on a club role -- see club-layout-guard.test.ts).
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { documents } from '$chassis/content';
import { loadPublishedDocuments } from '$theme/documents';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { loadSeasonDocumentSummaries, type SeasonDocumentSummary } from '$admin-club/lib/documents-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  const currentSeason = await (db ? getCurrentSeason(db) : Promise.resolve(new Date().getUTCFullYear()));

  const seasonParam = Number(event.url.searchParams.get('season'));
  const selectedSeason = Number.isInteger(seasonParam) && seasonParam > 0 ? seasonParam : currentSeason;

  if (!db) {
    return { summaries: [] as SeasonDocumentSummary[], currentSeason, selectedSeason, error: 'CLUB_DB is not bound.' };
  }

  const publishedDocuments = loadPublishedDocuments(documents, selectedSeason);
  const summaries = await loadSeasonDocumentSummaries(db, publishedDocuments, selectedSeason);
  return { summaries, currentSeason, selectedSeason, error: null as string | null };
};
