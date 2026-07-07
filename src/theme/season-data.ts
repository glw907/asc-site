// The Season/events D1 read (Task 4, repointed by pass 2.1's Task 9): the club's own domain store
// (`asc-club`, bound as `CLUB_DB`) is the source of truth for events and classes. Reads and writes
// both live here now; the admin screens under `/admin/club` write through this same database
// (`$admin-club/lib/events-store.ts`, `classes-store.ts`), and this module only ever SELECTs. The
// prior source, the ops stack's own `asc-ops` (bound as `EVENTS_DB`), is retired from every read
// path; its binding stays in `wrangler.toml`, unused, for a documented rollback (see that file's
// own comment).
//
// Schema note: `events.category` (the ratified DDL, `migrations/asc-club/0001_substrate/`) is a
// NOT NULL, CHECK-constrained column (`racing`, `class`, `operations`, `social`, `governance`);
// `classes` carries no category column of its own, by design, not a gap, since a class always
// displays as the synthesized `'class'` tag. This module ports the same union-and-synthesize
// pattern the ops-sourced read used (`SELECT ..., 'class' AS event_type FROM classes`), now against
// asc-club's own tables; the field name `event_type` is kept on the row shape below for continuity
// with `$theme/events-data.ts`'s own row shape, even though the source column is `category`.
//
// Taxonomy mapping (the C7-gold recipe, resolved against the ratified north star's actual pixels,
// not just its stub's paraphrase): `class` (the synthesized tag above) gets the gold dot, since the
// club's own mission-first emphasis is education; `racing` stays plain ink, since racing is the
// other headline activity; everything else (`operations`, `social`, `governance`) reads muted, the
// quieter "routine, non-racing" ink. The north star's own off-season group confirms this: BNAC
// (a racing event) stays full ink there while "End-of-Season Celebration" (a `social` entry) and
// "Annual Meeting" (a `governance` entry) both render muted, so the rule is "everything but racing
// and education", not literally only "operations and governance" as an earlier stub's doc comment
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

/** The display text for an event with no resolvable current-year date. Shared with the full
 *  `/events` listing (`$theme/events-data.ts`), which reads the same D1 rows. */
export const DATE_TBD = 'Date TBD';

// The racing season's own months; anything outside this range (including a genuinely undated
// entry) groups into one trailing "Off-season" bucket instead of a named month, mirroring the
// legacy main-site Worker's own `buildEventsPage` (its `buildSeasonCalendar`, used only for the
// home teaser, silently dropped an out-of-range month instead; this module never drops an event).
/** The season's own months, in order. Shared with the full `/events` listing. */
export const SEASON_MONTHS: readonly { month: number; label: string }[] = [
  { month: 5, label: 'May' },
  { month: 6, label: 'June' },
  { month: 7, label: 'July' },
  { month: 8, label: 'August' },
  { month: 9, label: 'September' },
];
const OFF_SEASON_LABEL = 'Off-season';

/** The events table's own SELECT; `visible = 1` matches the legacy ops-sourced read's public
 *  filter. `date_history` has no asc-club equivalent (the ratified DDL carries no such column, see
 *  the header comment); selected as a literal `NULL` so the row shape below, and its shared date
 *  helpers, stay unchanged. */
const EVENTS_QUERY = `SELECT title, category AS event_type, start_date, end_date, NULL AS date_history
                       FROM events WHERE visible = 1`;
/** The classes table's SELECT, tagged with the synthesized `'class'` category (see the header
 *  comment on why `classes` carries no category column of its own). */
const CLASSES_QUERY = `SELECT name AS title, 'class' AS event_type, start_date, end_date, NULL AS date_history
                        FROM classes WHERE visible = 1`;

/** The best available date for ordering an event with no current-year `start_date`: its most
 *  recent `date_history` entry, or null when the row carries no date at all (a genuinely TBD
 *  event). Ported from the legacy Worker's `getOrderingDate`; exported for the full `/events`
 *  listing, which reuses this exact fallback rather than a second copy of it. */
export function getOrderingDate(row: Pick<EventRow, 'start_date' | 'date_history'>): string | null {
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
 *  outside the range). Exported for the full `/events` listing. */
export function monthAndDay(
  row: Pick<EventRow, 'start_date' | 'date_history'>,
  currentYear: number,
): { month: number; sortDay: number } {
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
export function formatDateRange(startIso: string, endIso: string | null): string {
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
 *  non-racing, plain ink for a racing event. See the header comment for how this resolves against
 *  the north star's actual rendered colors. Exported for the full `/events` listing, whose type
 *  badge reads the same three-way split rather than inventing a second taxonomy. */
export function categorize(eventType: string): Pick<SeasonEvent, 'dot' | 'muted'> {
  if (eventType === 'class') return { dot: true };
  if (eventType === 'racing') return {};
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
    console.error('season-data: CLUB_DB read failed', err);
    return [];
  }
}
