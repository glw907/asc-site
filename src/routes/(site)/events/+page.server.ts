// Task 4's dedicated /events route: it shadows the general (site)/[...path] catch-all for this
// one literal path (SvelteKit always prefers a literal segment route over a rest-parameter one),
// so the "events" pages content entry keeps its editable editorial intro (rendered through the
// exact same plumbing the catch-all uses, via the shared `routes` in $theme/public-routes), while
// the full calendar below it is the events deep-look pass's own detailed listing
// ($theme/events-data.ts, against docs/events-manifest.md's re-enumeration of the live page).
import type { PageServerLoad } from './$types';
import { routes } from '$theme/public-routes';
import { ORIGIN } from '$chassis/content';
import { publicMediaResolver, renderMarkdown } from '$theme/cairn.config';
import { buildEventsPage, readEventRows } from '$theme/events-data';

// The full calendar reads D1 at request time, so this page cannot be prerendered the static way
// every other content page is; left dynamic (the project default), same as /admin.
export const prerender = false;

export const load: PageServerLoad = async ({ url, platform }) => {
  const entry = await routes.entryLoad({ url });
  const db = platform?.env.EVENTS_DB;
  const rows = db ? await readEventRows(db) : [];
  const events = await buildEventsPage(rows, {
    resolveMedia: publicMediaResolver,
    renderMarkdown: (md) => renderMarkdown(md),
  });
  const icsUrl = `${ORIGIN}/events/calendar.ics`;
  return {
    ...entry,
    events,
    icsUrl,
    webcalUrl: icsUrl.replace(/^https?:/, 'webcal:'),
    googleCalendarUrl: `https://www.google.com/calendar/render?cid=${encodeURIComponent(icsUrl.replace(/^https?:/, 'webcal:'))}`,
  };
};
