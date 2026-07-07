// The Events edit screen (Task 5): the detail form's load, plus the update and delete actions,
// migrated onto `clubAdminAction` in Task 6's rider 1. A miss on `id` is not thrown as a
// SvelteKit `error(404)` (that would bubble past `/admin`'s own layout to the root
// `+error.svelte`, which rebuilds the PUBLIC site chrome, not the admin shell, the same
// reasoning the Member detail's own load already documents); it returns an honest `event: null`
// instead, and the page renders a themed not-found state in the admin chrome.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
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

const DENIED_MESSAGE = 'A club role is required to manage events.';

export const actions: Actions = {
  update: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      if (!(await getEvent(ctx.db, id))) {
        ctx.audit({ action: 'update', entity: 'event', entityId: id, detail: 'rejected: no such event' });
        return fail(404, { error: 'No such event.' });
      }
      const parsed = parseEventForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'update', entity: 'event', entityId: id, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      await updateEvent(ctx.db, id, parsed.write);
      ctx.audit({ action: 'update', entity: 'event', entityId: id });
      return { ok: true };
    },
    { action: 'update', entity: 'event', deniedMessage: DENIED_MESSAGE },
  ),

  delete: clubAdminAction(
    async ({ event, ctx }) => {
      const id = routeId(event);
      if (!(await getEvent(ctx.db, id))) {
        ctx.audit({ action: 'delete', entity: 'event', entityId: id, detail: 'rejected: no such event' });
        return fail(404, { error: 'No such event.' });
      }
      await deleteEvent(ctx.db, id);
      ctx.audit({ action: 'delete', entity: 'event', entityId: id });
      redirect(303, '/admin/club/events');
    },
    { action: 'delete', entity: 'event', deniedMessage: DENIED_MESSAGE },
  ),
};
