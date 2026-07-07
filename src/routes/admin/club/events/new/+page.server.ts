// The Events create screen (Task 5, migrated onto `clubAdminAction` in Task 6's rider 1): the
// club-role precondition (any club role suffices; owner is not required, unlike Settings' own
// role-management writes) is now the wrapper's own check, not a hand-rolled one here.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { createEvent, getEvent } from '$admin-club/lib/events-store';
import { parseEventForm } from '../event-form-input';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};

export const actions: Actions = {
  create: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseEventForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'create', entity: 'event', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = parsed.write.slug;
      if (await getEvent(ctx.db, id)) {
        ctx.audit({ action: 'create', entity: 'event', entityId: id, detail: 'rejected: slug already exists' });
        return fail(400, { error: 'An event with that slug already exists.' });
      }
      await createEvent(ctx.db, id, parsed.write);
      ctx.audit({ action: 'create', entity: 'event', entityId: id });
      redirect(303, `/admin/club/events/${id}`);
    },
    { action: 'create', entity: 'event', deniedMessage: 'A club role is required to manage events.' },
  ),
};
