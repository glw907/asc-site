// The events deep-look pass: the real iCal feed. Ported from the legacy main-site Worker's own
// `src/lib/ics.js` (`buildICS`), which this rebuild's `/events/calendar.ics/+server.ts` reads with
// the same `EVENTS_DB` rows the full listing uses (`$theme/events-data.ts`'s `EventDetailRow`), so
// the calendar-subscribe bar's iCal/Apple and Google Calendar links resolve against a real,
// currently-correct feed rather than a static or placeholder file.
import type { EventDetailRow } from './events-data';

/** Escape the handful of characters the iCalendar spec reserves in a text property value. */
function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Build an iCalendar (ICS) feed from every row that carries a `start_date`; a genuinely TBD row (no
 * date at all) has nothing to schedule against and is excluded from the feed entirely, matching the
 * legacy feed's own behavior. `DTEND` is exclusive for an all-day event, so a single-day event's end
 * date is the day after its start.
 */
export function buildIcs(rows: EventDetailRow[], baseUrl: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alaska Sailing Club//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Alaska Sailing Club Events',
    'X-WR-TIMEZONE:America/Anchorage',
    'X-PUBLISHED-TTL:PT24H',
  ];

  for (const row of rows) {
    if (!row.start_date) continue;

    const dtstart = row.start_date.replace(/-/g, '');
    const endSource = row.end_date ?? row.start_date;
    const endObj = new Date(`${endSource}T00:00:00`);
    endObj.setDate(endObj.getDate() + 1);
    const dtend = endObj.toISOString().slice(0, 10).replace(/-/g, '');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${row.slug}@aksailingclub.org`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${dtend}`);
    lines.push(`SUMMARY:${icsEscape(row.title)}`);
    if (row.short_description) lines.push(`DESCRIPTION:${icsEscape(row.short_description)}`);
    lines.push(`URL:${baseUrl}/events/#${row.slug}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
