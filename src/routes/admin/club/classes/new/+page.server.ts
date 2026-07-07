// The Classes create screen (Task 6): any club role suffices (the routine domain, like Events),
// via `clubAdminAction` (Task 6's rider 1). `season` is not a form field: it is the site's
// current season (club-settings.ts's `getCurrentSeason`), read once at creation.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { createClass, getClass } from '$admin-club/lib/classes-store';
import { parseClassForm } from '../class-form-input';

export const load: PageServerLoad = (event) => {
  requireSession(event);
  return {};
};

export const actions: Actions = {
  create: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseClassForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'create', entity: 'class', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = parsed.write.slug;
      if (await getClass(ctx.db, id)) {
        ctx.audit({ action: 'create', entity: 'class', entityId: id, detail: 'rejected: slug already exists' });
        return fail(400, { error: 'A class with that slug already exists.' });
      }
      const season = await getCurrentSeason(ctx.db);
      await createClass(ctx.db, id, season, parsed.write);
      ctx.audit({ action: 'create', entity: 'class', entityId: id });
      redirect(303, `/admin/club/classes/${id}`);
    },
    { action: 'create', entity: 'class', deniedMessage: 'A club role is required to manage classes.' },
  ),
};
