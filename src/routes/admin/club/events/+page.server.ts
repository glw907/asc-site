// The Club section's first real screen (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Pass 2.1's own proof): a plain custom /admin/ route (per docs/guides/add-a-custom-
// admin-screen.md), reading the club's live ops D1 (the same read-only EVENTS_DB binding
// $theme/season-data.ts already uses for the public Season section and /events). This scaffold
// pass wires the read only; season-data.ts's own header comment carries the schema notes this
// query reuses (a NOT NULL event_type, a nullable start_date/end_date for a TBD event).
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';

/** One raw `events` row, read straight off asc-ops's D1. There is no stored primary key column
 *  (see the schema in e2e/fixtures/events-seed.sql), so `rowid` (SQLite's implicit one) stands in
 *  as the row's id for this read-only list. */
export interface ClubEventRow {
  id: number;
  title: string;
  slug: string | null;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  visible: number;
}

const EVENTS_QUERY = `SELECT rowid AS id, title, slug, event_type, start_date, end_date, visible
                       FROM events ORDER BY start_date IS NULL, start_date ASC`;

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = event.platform?.env.EVENTS_DB;
  if (!db) return { events: [] as ClubEventRow[], error: 'EVENTS_DB is not bound.' };
  try {
    const { results } = await db.prepare(EVENTS_QUERY).all<ClubEventRow>();
    return { events: results ?? [], error: null as string | null };
  } catch (err) {
    // Degrade to an empty, honestly-labeled list rather than a raw 500, the same failure mode
    // season-data.ts's loadSeasonMonths already uses for this same binding.
    console.error('admin/club/events: EVENTS_DB read failed', err);
    return { events: [] as ClubEventRow[], error: 'Could not read the events table.' };
  }
};
