// The events deep-look pass: the real calendar-subscribe feed the /events hero's "iCal / Apple"
// and "Google Calendar" links both point at. Shadows the (site)/[...path] catch-all the same way
// (site)/events/+page.server.ts already does, since D1 is read at request time; never prerendered
// (a static bake would freeze the ops stack's live calendar at build time, exactly the risk the
// dedicated /events route already avoids for the page itself).
import type { RequestHandler } from './$types';
import { ORIGIN } from '$chassis/content';
import { readEventRows } from '$theme/events-data';
import { buildIcs } from '$theme/ics';

export const prerender = false;

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform?.env.EVENTS_DB;
  const rows = db ? await readEventRows(db) : [];
  const body = buildIcs(rows, ORIGIN);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="asc-events.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
