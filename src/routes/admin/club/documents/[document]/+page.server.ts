// The season rollup's own drill-through (member-waivers T6, spec decision 8): one document's
// signed and outstanding member lists for a season. Sits directly under /admin/club/documents/;
// the `member` and `signature` static siblings resolve ahead of this dynamic segment (SvelteKit's
// own static-over-dynamic precedence, the same shape `classes/new` next to `classes/[id]` already
// relies on), so a document id can never collide with either route.
//
// A miss (an unbound CLUB_DB, or a document id/season with nothing published) is never thrown as
// a SvelteKit `error()`: that would bubble past `/admin`'s own layout to the root `+error.svelte`,
// which rebuilds the PUBLIC site chrome, not the admin shell (the same reasoning `events/[id]/
// +page.server.ts`'s own header documents). It returns an honest `summary: null` instead, and the
// page renders a themed not-found state in the admin chrome.
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
  if (!db) {
    return { summary: null as SeasonDocumentSummary | null, season: null as number | null, error: 'CLUB_DB is not bound.' };
  }

  const currentSeason = await getCurrentSeason(db);
  const seasonParam = Number(event.url.searchParams.get('season'));
  const season = Number.isInteger(seasonParam) && seasonParam > 0 ? seasonParam : currentSeason;

  const publishedDocuments = loadPublishedDocuments(documents, season);
  const summaries = await loadSeasonDocumentSummaries(db, publishedDocuments, season);
  const summary = summaries.find((s) => s.documentId === event.params.document) ?? null;

  return {
    summary,
    season,
    error: summary ? null : `No document "${event.params.document}" is published for ${season}.`,
  };
};
