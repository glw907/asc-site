// The events-redesign pass: the per-event page's own add-to-calendar endpoint, one VEVENT rather
// than the whole season (`(site)/events/calendar.ics`, which every row feeds). Shadows the
// (site)/[...path] catch-all the same way every other events route does; never prerendered, since
// CLUB_DB is read at request time.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ORIGIN } from '$chassis/content';
import { readEventRows } from '$theme/events-data';
import { routeIdOf } from '$theme/season-data';
import { buildSingleEventIcs } from '$theme/ics';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform }) => {
  const db = platform?.env.CLUB_DB;
  if (!db) error(503, 'Events are not available right now.');

  const rows = await readEventRows(db);
  const row = rows.find((candidate) => routeIdOf(candidate) === params.id);
  if (!row) error(404, 'No such event.');

  const body = buildSingleEventIcs(row, ORIGIN);
  if (!body) error(404, 'This event has no date to add to a calendar yet.');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${params.id}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
