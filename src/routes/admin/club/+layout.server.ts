// The authorization gate for the whole /admin/club/* section. The engine's own admin guard
// already resolved `locals.editor`, or redirected to login, before this layout load ever runs;
// `requireAccess` re-checks it anyway (defense-in-depth, the same pattern every Club screen's own
// load already uses) and additionally reads `locals.cairnAccess` (the site's map,
// `src/theme/access.ts`, wired into the guard by `hooks.server.ts`) for this request's path. The
// roles-adoption pass's T4 (docs/2026-07-19-asc-roles-adoption.md) retired the hardcoded
// `CLUB_ROLES.includes(editor.role)` check in favor of this: the map is now the single authority
// for who reaches `/admin/club`, so enforcement here and the Publisher widening on
// `/admin/club/email`/`/admin/club/announce` can never drift apart. A signed-in editor the map
// does not admit for this path gets a clean 403, never a redirect, since they ARE signed in, just
// not into this section.
import type { LayoutServerLoad } from './$types';
import { requireAccess } from '@glw907/cairn-cms/sveltekit';

export const load: LayoutServerLoad = async (event) => {
  requireAccess(event);
  return {};
};
