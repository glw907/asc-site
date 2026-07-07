// The Season/events D1 read (Task 4): the club's own ops stack (`asc-ops`, a Cloudflare D1 the
// existing ops.aksailingclub.org dashboard owns and writes to) is the source of truth for events
// and classes. This site only ever SELECTs from it (the `EVENTS_DB` binding in wrangler.toml is a
// read intent this module's own code upholds, not a Cloudflare-enforced restriction); the ops
// stack keeps every write, matching the coexistence strategy the phase-1 design spec locks in.
//
// Schema verification (read-only, against the LIVE database, not the retired prior migration's
// `db/` directory, which carried no schema file at all): `events` has a NOT NULL `event_type`
// column (`regatta`, `work_party`, `meeting`, `social`, confirmed live via `wrangler d1 execute
// asc-ops --remote`); `classes` is a wholly separate table with no category column of its own.
// SCHEMA GAP for the ops absorption: a unified query across both tables has no single stored
// category to group on, so the retiring main-site Worker's own `injection.js` synthesizes one by
// table membership (`SELECT ... , 'class' AS event_type FROM classes`), and this module ports that
// exact pattern rather than inventing a new one. A future ops pass that wants to query "every
// class or clinic" without a UNION would need `classes` to carry its own category column; recorded
// here rather than fixed, since ops owns that schema.
//
// Taxonomy mapping (the C7-gold recipe, resolved against the ratified north star's actual pixels,
// not just its stub's paraphrase): `class` (the synthesized tag above) gets the gold dot, since the
// club's own mission-first emphasis is education; `regatta` stays plain ink, since racing is the
// other headline activity; everything else (`work_party`, `meeting`, `social`) reads muted, the
// quieter "routine, non-racing" ink. The north star's own off-season group confirms this: BNAC
// (a regatta) stays full ink there while "End-of-Season Celebration" (a `social` entry) and
// "Annual Meeting" (a `meeting`) both render muted, so the rule is "everything but racing and
// education", not literally only "work parties and meetings" as an earlier stub's doc comment
// paraphrased it.
import type { D1Database } from '@cloudflare/workers-types';

/** One event row in the Season listing: its date range, its name, and the two independent
 *  emphasis flags the C7 recipe uses. `dot` marks a class or clinic (the gold accent dot); `muted`
 *  marks a routine, non-racing entry that reads in the quieter ink. */
export interface SeasonEvent {
  dateRange: string;
  name: string;
  dot?: boolean;
  muted?: boolean;
}

/** One month's (or the off-season's) group of events; a month with no events is omitted, and
 *  groups never split across the template's two-column layout (`break-inside: avoid`). */
export interface SeasonMonth {
  label: string;
  events: SeasonEvent[];
}

/** A raw event or class row, already read from D1. `event_type` is the stored column for a real
 *  `events` row, or the synthesized `'class'` tag this module's own queries attach to a `classes`
 *  row (see the header comment's recorded schema gap). */
interface EventRow {
  title: string;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  date_history: string | null;
}

const DATE_TBD = 'Date TBD';

// The racing season's own months; anything outside this range (including a genuinely undated
// entry) groups into one trailing "Off-season" bucket instead of a named month, mirroring the
// legacy main-site Worker's own `buildEventsPage` (its `buildSeasonCalendar`, used only for the
// home teaser, silently dropped an out-of-range month instead; this module never drops an event).
const SEASON_MONTHS: readonly { month: number; label: string }[] = [
  { month: 5, label: 'May' },
  { month: 6, label: 'June' },
  { month: 7, label: 'July' },
  { month: 8, label: 'August' },
  { month: 9, label: 'September' },
];
const OFF_SEASON_LABEL = 'Off-season';

/** The events table's own SELECT; `visible = 1` matches the legacy Worker's public read. */
const EVENTS_QUERY = `SELECT title, event_type, start_date, end_date, date_history
                       FROM events WHERE visible = 1`;
/** The classes table's SELECT, tagged with the synthesized `'class'` category (the recorded
 *  schema gap above). */
const CLASSES_QUERY = `SELECT name AS title, 'class' AS event_type, start_date, end_date, date_history
                        FROM classes WHERE visible = 1`;

/** The best available date for ordering an event with no current-year `start_date`: its most
 *  recent `date_history` entry, or null when the row carries no date at all (a genuinely TBD
 *  event). Ported from the legacy Worker's `getOrderingDate`. */
function getOrderingDate(row: Pick<EventRow, 'start_date' | 'date_history'>): string | null {
  if (row.start_date) return row.start_date;
  try {
    const history = JSON.parse(row.date_history ?? 'null') as Record<string, { start_date?: string }> | null;
    if (!history) return null;
    const latestYear = Object.keys(history)
      .map(Number)
      .sort((a, b) => b - a)[0];
    return history[latestYear]?.start_date ?? null;
  } catch {
    return null;
  }
}

/** The raw calendar month (1-12) and day-of-month to sort by, or `99`/`99` for a row with no
 *  resolvable date at all. `month` is the real month number even outside the May-September season,
 *  so the off-season bucket can still order Oct before Nov (see the header comment on months
 *  outside the range). */
function monthAndDay(row: EventRow, currentYear: number): { month: number; sortDay: number } {
  if (row.start_date) {
    const d = new Date(`${row.start_date}T00:00:00`);
    if (d.getFullYear() === currentYear) return { month: d.getMonth() + 1, sortDay: d.getDate() };
  }
  const ordering = getOrderingDate(row);
  if (ordering) {
    const d = new Date(`${ordering}T00:00:00`);
    return { month: d.getMonth() + 1, sortDay: d.getDate() };
  }
  return { month: 99, sortDay: 99 };
}

/** Format a single date or a date range for display, e.g. `"May 16"` or `"Jun 12–14"`; the
 *  year never appears (the template shows one season at a time), so a stray wrong-year value in a
 *  row's `end_date` cannot surface as a visibly broken range. Ported from the legacy Worker's
 *  `formatSeasonDate`. */
function formatDateRange(startIso: string, endIso: string | null): string {
  const start = new Date(`${startIso}T00:00:00`);
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  if (!endIso || endIso === startIso) return `${startMonth} ${start.getDate()}`;
  const end = new Date(`${endIso}T00:00:00`);
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}`
    : `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

/** The C7-gold taxonomy: `dot` for a class or clinic, `muted` for everything routine and
 *  non-racing, plain ink for a regatta. See the header comment for how this resolves against the
 *  north star's actual rendered colors. */
function categorize(eventType: string): Pick<SeasonEvent, 'dot' | 'muted'> {
  if (eventType === 'class') return { dot: true };
  if (eventType === 'regatta') return {};
  return { muted: true };
}

/** One row, enriched with its display fields and its sort key, before grouping. */
interface WorkingEvent extends SeasonEvent {
  inSeason: boolean;
  month: number;
  sortDay: number;
}

function toWorkingEvent(row: EventRow, currentYear: number): WorkingEvent {
  const { month, sortDay } = monthAndDay(row, currentYear);
  return {
    dateRange: row.start_date ? formatDateRange(row.start_date, row.end_date) : DATE_TBD,
    name: row.title,
    ...categorize(row.event_type),
    inSeason: month >= 5 && month <= 9,
    month,
    sortDay,
  };
}

function toSeasonEvent({ dateRange, name, dot, muted }: WorkingEvent): SeasonEvent {
  return { dateRange, name, dot, muted };
}

const byMonthThenDay = (a: WorkingEvent, b: WorkingEvent) =>
  a.month !== b.month ? a.month - b.month : a.sortDay - b.sortDay;

/** The pure grouping step: every row to the month-grouped, taxonomy-tagged shape the Season
 *  template reads. Exported so its behavior is directly unit-testable without a real D1 binding. */
export function buildSeasonMonths(rows: EventRow[], currentYear: number): SeasonMonth[] {
  const working = rows.map((row) => toWorkingEvent(row, currentYear));

  const months: SeasonMonth[] = SEASON_MONTHS.map(({ month, label }) => ({
    label,
    events: working
      .filter((e) => e.inSeason && e.month === month)
      .sort(byMonthThenDay)
      .map(toSeasonEvent),
  })).filter((m) => m.events.length > 0);

  const offSeasonEvents = working
    .filter((e) => !e.inSeason)
    .sort(byMonthThenDay)
    .map(toSeasonEvent);
  if (offSeasonEvents.length > 0) months.push({ label: OFF_SEASON_LABEL, events: offSeasonEvents });

  return months;
}

/** Read the live events and classes tables and group them into the Season shape. On any D1
 *  failure (a binding hiccup, a query error) this degrades to an empty season rather than
 *  throwing, the same safe failure this theme already uses for a missing photo (`home-images.ts`):
 *  a quiet, honest gap reads better than a broken page. */
export async function loadSeasonMonths(db: D1Database, currentYear = new Date().getFullYear()): Promise<SeasonMonth[]> {
  try {
    const [events, classes] = await Promise.all([
      db.prepare(EVENTS_QUERY).all<EventRow>(),
      db.prepare(CLASSES_QUERY).all<EventRow>(),
    ]);
    return buildSeasonMonths([...(events.results ?? []), ...(classes.results ?? [])], currentYear);
  } catch (err) {
    console.error('season-data: EVENTS_DB read failed', err);
    return [];
  }
}
