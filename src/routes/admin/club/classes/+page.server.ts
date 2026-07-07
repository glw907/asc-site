// The Club section's Classes screen, wired read-only to the same live ops D1 the Events
// screen reads (EVENTS_DB). Unlike events, `classes` has a TEXT primary key and carries
// the registration lifecycle this screen exists to surface: the registration_status
// state machine (not_scheduled -> upcoming -> open -> full -> closed, CHECK-constrained
// in the ops schema) that pass 2.1 will make editable.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';

/** One raw `classes` row off asc-ops's D1, the columns this list renders. */
export interface ClubClassRow {
  id: string;
  name: string;
  slug: string;
  registration_status: 'not_scheduled' | 'upcoming' | 'open' | 'full' | 'closed';
  registration_url: string | null;
  fee: number | null;
  start_date: string | null;
  location: string | null;
  /** SQLite boolean: 1 visible, 0 hidden (the schema has no BOOLEAN type). */
  visible: 0 | 1;
}

const CLASSES_QUERY = `SELECT id, name, slug, registration_status, registration_url, fee,
                              start_date, location, visible
                       FROM classes ORDER BY sort_order ASC, name ASC`;

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = event.platform?.env.EVENTS_DB;
  if (!db) return { classes: [] as ClubClassRow[], error: 'EVENTS_DB is not bound.' };
  try {
    const { results } = await db.prepare(CLASSES_QUERY).all<ClubClassRow>();
    return { classes: results ?? [], error: null as string | null };
  } catch (err) {
    console.error('admin/club/classes: EVENTS_DB read failed', err);
    return { classes: [] as ClubClassRow[], error: 'Could not read the classes table.' };
  }
};
