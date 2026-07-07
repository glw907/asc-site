// The Club section's Events list (Task 5): moves off the read-only EVENTS_DB scaffold read
// (docs/club-admin-scaffold.md, now stale on this point) onto the site's own asc-club store
// (events-store.ts), the same CLUB_DB the layout guard and Settings screen already read. The
// list is read-only navigation: create lives at `events/new`, and edit plus the destructive
// delete both live at `events/[id]` (the mockups' build-tier refinement moves destructive
// actions behind the detail's confirm, so there is deliberately no per-row delete here).
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { listEvents, type EventRow } from '$admin-club/lib/events-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return { events: [] as EventRow[], error: 'CLUB_DB is not bound.' };
  try {
    const events = await listEvents(db);
    return { events, error: null as string | null };
  } catch (err) {
    // Degrade to an honestly-labeled empty list rather than a raw 500, the same failure
    // posture the retired EVENTS_DB read used for this same screen.
    console.error('admin/club/events: CLUB_DB read failed', err);
    return { events: [] as EventRow[], error: 'Could not read the events table.' };
  }
};
