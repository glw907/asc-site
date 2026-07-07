// The Events edit screen (Task 5): the detail form's load, plus the update and delete actions.
// A miss on `id` is not thrown as a SvelteKit `error(404)` (that would bubble past `/admin`'s own
// layout to the root `+error.svelte`, which rebuilds the PUBLIC site chrome, not the admin shell,
// the same reasoning the Member detail's own load already documents); it returns an honest
// `event: null` instead, and the page renders a themed not-found state in the admin chrome.
//
// Both actions re-check the acting editor's club role (see club-roles.ts's `hasAnyClubRole`
// comment for why the layout guard alone does not cover a POST action): events are the routine
// domain, so any club role suffices, unlike Settings' owner-only role-management writes.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminAction, requireSession } from '@glw907/cairn-cms/sveltekit';
import { hasAnyClubRole, resolveClubDb } from '$admin-club/lib/club-roles';
import { deleteEvent, getEvent, updateEvent, type EventRow } from '$admin-club/lib/events-store';
import { parseEventForm } from '../event-form-input';

/** `AdminActionEvent`'s own type is narrowed to what `adminAction` itself needs (cookies,
 *  locals, platform), the same way `AuthEnv` narrows `platform.env` elsewhere in this site (see
 *  club-roles.ts's `resolveClubDb` comment for the identical reasoning). The real underlying
 *  SvelteKit `RequestEvent` this dynamic route dispatches always carries `params.id`, so this is
 *  a narrow, explained cast, not a widening of the engine's own public event type. */
function routeId(event: unknown): string {
  return (event as { params: { id: string } }).params.id;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return { event: null as EventRow | null, error: 'CLUB_DB is not bound.' };
  const row = await getEvent(db, event.params.id);
  return { event: row, error: null as string | null };
};

export const actions: Actions = {
  update: adminAction(async ({ event, form, ctx }) => {
    const id = routeId(event);
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'update', entity: 'event', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, { error: 'CLUB_DB is not bound.' });
    }
    if (!(await hasAnyClubRole(db, ctx.editor.email))) {
      ctx.audit({ action: 'update', entity: 'event', entityId: id, detail: 'rejected: no club role' });
      return fail(403, { error: 'A club role is required to manage events.' });
    }
    if (!(await getEvent(db, id))) {
      ctx.audit({ action: 'update', entity: 'event', entityId: id, detail: 'rejected: no such event' });
      return fail(404, { error: 'No such event.' });
    }
    const parsed = parseEventForm(form);
    if ('error' in parsed) {
      ctx.audit({ action: 'update', entity: 'event', entityId: id, detail: `rejected: ${parsed.error}` });
      return fail(400, { error: parsed.error });
    }
    await updateEvent(db, id, parsed.write);
    ctx.audit({ action: 'update', entity: 'event', entityId: id });
    return { ok: true };
  }),

  delete: adminAction(async ({ event, ctx }) => {
    const id = routeId(event);
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'delete', entity: 'event', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, { error: 'CLUB_DB is not bound.' });
    }
    if (!(await hasAnyClubRole(db, ctx.editor.email))) {
      ctx.audit({ action: 'delete', entity: 'event', entityId: id, detail: 'rejected: no club role' });
      return fail(403, { error: 'A club role is required to manage events.' });
    }
    if (!(await getEvent(db, id))) {
      ctx.audit({ action: 'delete', entity: 'event', entityId: id, detail: 'rejected: no such event' });
      return fail(404, { error: 'No such event.' });
    }
    await deleteEvent(db, id);
    ctx.audit({ action: 'delete', entity: 'event', entityId: id });
    throw redirect(303, '/admin/club/events');
  }),
};
