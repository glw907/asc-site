import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, EntryGenerator } from './$types';
import { site } from '$chassis/content';
import { REDIRECTS } from '$theme/redirects';
import { isRoutable } from '$theme/routable-concepts';
import { routes } from '$theme/public-routes';

export const prerender = true;

export const entries: EntryGenerator = () => [
  // routes.entries() is site.entries(), which (a cairn-cms engine gap; see
  // $theme/routable-concepts.ts) does not exclude an `embedded` concept's entries. Filter through
  // site.all() instead, which still carries the `concept` field entries() itself discards.
  ...site
    .all()
    .filter(isRoutable)
    // '/events' is shadowed by (site)/events/+page.server.ts (Task 4's live D1 route, which
    // cannot be prerendered), so this route must never try to generate it.
    .filter((summary) => summary.permalink !== '/events')
    .map((summary) => ({ path: summary.permalink.replace(/^\//, '') })),
  // Prerender the old redirect sources too, so the crawler bakes a static redirect page for each
  // rather than skipping a path `routes.entries()` never lists.
  ...Object.keys(REDIRECTS).map((path) => ({ path })),
];

export const load: PageServerLoad = async ({ url, params }) => {
  // The old Hugo site nested governance and member pages under their own section path; cairn's
  // flat `pages` concept collapses that to one segment (see $theme/redirects.ts's header comment).
  // A hit here is a permanent move, so it redirects before content resolution, not a 404.
  const target = REDIRECTS[params.path];
  if (target) redirect(301, `/${target}/`);
  const data = await routes.entryLoad({ url });
  // Same engine gap as above: entryLoad resolves an `embedded` concept's entry same as a routable
  // one. It has no public page by declared intent, so treat a direct hit as a miss.
  if (!isRoutable(data)) error(404, `Not found: ${url.pathname}`);
  return data;
};
