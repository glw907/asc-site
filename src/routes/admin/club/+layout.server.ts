// The club-role authorization gate for the whole /admin/club/* section. The engine's own admin
// guard already resolved `locals.editor`, or redirected to login, before this layout load ever
// runs; `requireSession` here is defense-in-depth, the same pattern every Club screen's own load
// already uses. Initiative 5 Task 2 collapsed this onto the engine's own typed session: a club
// role is no longer a separate `club_roles` grant, it is `locals.editor.role` itself, narrowed to
// the site's declared vocabulary (`src/app.d.ts`'s `CairnRolesRegister` augmentation). A signed-in
// editor whose role is not `'owner'` or `'club-admin'` gets a clean 403, never a redirect, since
// they ARE signed in, just not into this section.
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { CLUB_ROLES } from '$admin-club/lib/club-db';

export const load: LayoutServerLoad = async (event) => {
  const editor = requireSession(event);
  if (!CLUB_ROLES.includes(editor.role)) {
    error(403, 'Your account has no club role. Ask a club owner to grant one.');
  }
  return {};
};
