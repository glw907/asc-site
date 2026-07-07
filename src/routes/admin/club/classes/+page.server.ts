// The Club section's Classes list (Task 6): moves off the read-only EVENTS_DB scaffold read
// (the retired ops registration_status stand-in, docs/club-admin-scaffold.md now stale on this
// point) onto the site's own asc-club store (classes-store.ts), the same CLUB_DB the Events
// screen already reads. Read-only navigation: create lives at `classes/new`, and edit plus the
// destructive delete and instructor assignment both live at `classes/[id]`.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { listClassesWithCounts, type ClassWithCounts } from '$admin-club/lib/classes-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return { classes: [] as ClassWithCounts[], error: 'CLUB_DB is not bound.' };
  try {
    const classes = await listClassesWithCounts(db);
    return { classes, error: null as string | null };
  } catch (err) {
    console.error('admin/club/classes: CLUB_DB read failed', err);
    return { classes: [] as ClassWithCounts[], error: 'Could not read the classes table.' };
  }
};
