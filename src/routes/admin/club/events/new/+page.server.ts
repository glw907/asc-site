// The Events create screen (Task 5). The layout guard (../../+layout.server.ts) only runs
// before this page's own GET render, never before the POST below (SvelteKit dispatches a
// matched action directly; see club-roles.ts's hasAnyClubRole comment for the traced source),
// so the action re-checks the acting editor's club role itself: events are the routine domain
// (any club role suffices; owner is not required, unlike Settings' role-management writes).
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminAction, requireSession } from '@glw907/cairn-cms/sveltekit';
import { hasAnyClubRole, resolveClubDb } from '$admin-club/lib/club-roles';
import { createEvent, getEvent } from '$admin-club/lib/events-store';
import { parseEventForm } from '../event-form-input';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};

export const actions: Actions = {
  create: adminAction(async ({ event, form, ctx }) => {
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'create', entity: 'event', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, { error: 'CLUB_DB is not bound.' });
    }
    if (!(await hasAnyClubRole(db, ctx.editor.email))) {
      ctx.audit({ action: 'create', entity: 'event', detail: 'rejected: no club role' });
      return fail(403, { error: 'A club role is required to manage events.' });
    }
    const parsed = parseEventForm(form);
    if ('error' in parsed) {
      ctx.audit({ action: 'create', entity: 'event', detail: `rejected: ${parsed.error}` });
      return fail(400, { error: parsed.error });
    }
    const id = parsed.write.slug;
    if (await getEvent(db, id)) {
      ctx.audit({ action: 'create', entity: 'event', entityId: id, detail: 'rejected: slug already exists' });
      return fail(400, { error: 'An event with that slug already exists.' });
    }
    await createEvent(db, id, parsed.write);
    ctx.audit({ action: 'create', entity: 'event', entityId: id });
    throw redirect(303, `/admin/club/events/${id}`);
  }),
};
