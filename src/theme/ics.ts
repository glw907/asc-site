// The events deep-look pass: the real iCal feed. Ported from the legacy main-site Worker's own
// `src/lib/ics.js` (`buildICS`), which this rebuild's `/events/calendar.ics/+server.ts` reads with
// the same rows the full listing uses (`$theme/events-data.ts`'s `EventDetailRow`, sourced from
// `CLUB_DB` as of pass 2.1's Task 9), so the calendar-subscribe bar's iCal/Apple and Google
// Calendar links resolve against a real, currently-correct feed rather than a static or
// placeholder file. The events-redesign pass adds `buildSingleEventIcs`, the per-event page's own
// one-VEVENT feed (`/events/[id].ics`), sharing the VCALENDAR wrapper and the VEVENT line-builder
// below rather than duplicating either.
import type { EventDetailRow } from './events-data';

/** Escape the handful of characters the iCalendar spec reserves in a text property value. */
function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

const VCALENDAR_HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Alaska Sailing Club//Events//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:Alaska Sailing Club Events',
  'X-WR-TIMEZONE:America/Anchorage',
  'X-PUBLISHED-TTL:PT24H',
];

/** One row's `VEVENT` block, or `null` for a genuinely TBD row (no `start_date`, nothing to
 *  schedule against), matching the legacy feed's own behavior. `DTEND` is exclusive for an
 *  all-day event, so a single-day event's end date is the day after its start. */
function vEventLines(row: EventDetailRow, baseUrl: string): string[] | null {
  if (!row.start_date) return null;

  const dtstart = row.start_date.replace(/-/g, '');
  const endSource = row.end_date ?? row.start_date;
  const endObj = new Date(`${endSource}T00:00:00`);
  endObj.setDate(endObj.getDate() + 1);
  const dtend = endObj.toISOString().slice(0, 10).replace(/-/g, '');

  const lines = [
    'BEGIN:VEVENT',
    `UID:${row.slug}@aksailingclub.org`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${icsEscape(row.title)}`,
  ];
  if (row.short_description) lines.push(`DESCRIPTION:${icsEscape(row.short_description)}`);
  lines.push(`URL:${baseUrl}/events/#${row.slug}`, 'END:VEVENT');
  return lines;
}

/**
 * Build an iCalendar (ICS) feed from every row that carries a `start_date`; a genuinely TBD row
 * has nothing to schedule against and is excluded from the feed entirely.
 */
export function buildIcs(rows: EventDetailRow[], baseUrl: string): string {
  const lines = [...VCALENDAR_HEADER];
  for (const row of rows) {
    const vevent = vEventLines(row, baseUrl);
    if (vevent) lines.push(...vevent);
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build a single-`VEVENT` iCalendar feed for one row, the per-event page's own add-to-calendar
 * endpoint (`/events/[id].ics`). Returns `null` for a genuinely TBD row, the same as the full
 * feed's own exclusion; the caller 404s in that case rather than serving an empty calendar.
 */
export function buildSingleEventIcs(row: EventDetailRow, baseUrl: string): string | null {
  const vevent = vEventLines(row, baseUrl);
  if (!vevent) return null;
  return [...VCALENDAR_HEADER, ...vevent, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
