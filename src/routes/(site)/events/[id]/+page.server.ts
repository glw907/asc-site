// The events-redesign pass: one event or class's own page. Shadows the (site)/[...path] catch-all
// the same way (site)/events/+page.server.ts already does (a literal `events` segment always wins
// over the catch-all's rest parameter), reading CLUB_DB at request time since the calendar is live
// data, never prerendered. `params.id` is `routeIdOf`'s own route segment: an event's slug (global-
// ly unique) or a class's id (its slug is only unique within its season, see `$theme/season-data.ts`).
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { buildSeoMeta } from '@glw907/cairn-cms/delivery';
import { ORIGIN, SITE_DESCRIPTION } from '$chassis/content';
import { publicMediaResolver, renderMarkdown, siteConfig } from '$theme/cairn.config';
import { buildEventOrder, readEventRows, toEventCard } from '$theme/events-data';
import { routeIdOf } from '$theme/season-data';

export const prerender = false;

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'Events are not available right now.');

  const rows = await readEventRows(db);
  const row = rows.find((candidate) => routeIdOf(candidate) === params.id);
  if (!row) error(404, 'No such event.');

  const currentYear = new Date().getFullYear();
  const event = await toEventCard(row, currentYear, publicMediaResolver, renderMarkdown);

  const order = buildEventOrder(rows, currentYear);
  const index = order.findIndex((link) => link.routeId === params.id);
  const prev = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined;

  return {
    event,
    prev,
    next,
    seo: buildSeoMeta({
      title: event.title,
      description: event.summary ?? SITE_DESCRIPTION,
      canonicalUrl: `${ORIGIN}/events/${params.id}`,
      siteName: siteConfig.siteName,
      image: event.image ? ORIGIN + event.image.url : undefined,
      imageAlt: event.image?.alt,
    }),
  };
};
