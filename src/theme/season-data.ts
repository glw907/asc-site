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
// Taxonomy mapping (the C7-gold recipe): `class` (the synthesized tag above) gets the gold dot,
// since the club's own mission-first emphasis is education; `racing` stays plain ink with no dot
// at all, since racing is the season's other headline activity and its own plain-ink default.
// `categorize()` below keeps that original two-way split (dot/muted booleans), still read by the
// full `/events` listing's own badge (`events-data.ts`).
//
// The home Season band's calendar rebuild (round-3 design review, 2026-07-07) replaces its own
// font-weight "muted ink" category coding with a richer per-category DOT, since a font-treatment
// split reads as an unintentionally weaker row rather than a deliberate marker (Geoff's live
// finding). `seasonDotKind()` below is a second, home-band-only mapping over the same real D1
// `category` values, kept separate from `categorize()` so the full listing's own boolean taxonomy
// is untouched: `social` gets its own sage dot and `operations`/`governance` (the club's
// administrative categories) share a slate dot, both real category values already in the ratified
// DDL's CHECK constraint, not an invented taxonomy.
import type { D1Database } from '@cloudflare/workers-types';

/** The home Season band's per-category dot kind (see the header comment): `class` for the gold
 *  mission-first accent, `social` for a sage dot, `business` for a slate dot marking the club's
 *  administrative categories (`operations`, `governance`). `racing`, the season's plain-ink
 *  default, carries no dot at all. */
export type SeasonDotKind = 'class' | 'social' | 'business';

/** One event row in the Season listing: its date range, its name, and its dot kind (undefined for
 *  a racing event, the season's plain-ink default). Every event name renders at the same body-scale
 *  reading ink; only the dot slot carries category emphasis (the round-3 calendar rebuild). */
export interface SeasonEvent {
  dateRange: string;
  name: string;
  /** The `/events/[id]` route segment (`routeIdOf`), so the home page's Season band can link
   *  each event name to its own page. */
  routeId: string;
  dot?: SeasonDotKind;
}

/** One month's (or the off-season's) group of events; a month with no events is omitted, and
 *  groups never split across the template's two-column layout (`break-inside: avoid`). */
export interface SeasonMonth {
  label: string;
  events: SeasonEvent[];
}

/** A raw event or class row, already read from D1. `event_type` is the stored column for a real
 *  `events` row, or the synthesized `'class'` tag this module's own queries attach to a `classes`
 *  row (see the header comment's recorded schema gap). `id` and `slug` back `routeIdOf` below;
 *  `$theme/events-data.ts`'s own richer row shape is structurally compatible with this one. */
interface EventRow {
  id: string;
  title: string;
  slug: string;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  date_history: string | null;
}

/** The per-event page's own URL segment (also the events-redesign pass's spine-row and Season-
 *  link anchor): an `events` row's `slug` is globally unique, but a `classes` row's `slug` is only
 *  unique within its season (`UNIQUE (season, slug)`), so a class row routes on its real primary
 *  key instead. Shared by `$theme/events-data.ts`, which reads the identical `event_type`/`slug`/
 *  `id` triple off its own richer row shape. */
export function routeIdOf(row: Pick<EventRow, 'event_type' | 'slug' | 'id'>): string {
  return row.event_type === 'class' ? row.id : row.slug;
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
const EVENTS_QUERY = `SELECT id, title, slug, category AS event_type, start_date, end_date, NULL AS date_history
                       FROM events WHERE visible = 1`;
/** The classes table's SELECT, tagged with the synthesized `'class'` category (see the header
 *  comment on why `classes` carries no category column of its own). */
const CLASSES_QUERY = `SELECT id, name AS title, slug, 'class' AS event_type, start_date, end_date, NULL AS date_history
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

/** The full `/events` listing's own two-way emphasis: `dot` for a class or clinic, `muted` for
 *  everything routine and non-racing, plain ink for a racing event. Kept as its own boolean shape
 *  (not `SeasonEvent`'s richer `SeasonDotKind`) since `events-data.ts`'s badge reads exactly this
 *  pair; see the header comment for why the home Season band now reads a separate mapping. */
export function categorize(eventType: string): { dot?: boolean; muted?: boolean } {
  if (eventType === 'class') return { dot: true };
  if (eventType === 'racing') return {};
  return { muted: true };
}

/** The home Season band's per-category dot (see the header comment): `class` keeps the sanctioned
 *  gold accent, `social` gets a sage dot, and `operations`/`governance` (the club's administrative
 *  categories) share a slate dot. `racing` returns undefined, the season's plain-ink default. */
export function seasonDotKind(eventType: string): SeasonDotKind | undefined {
  if (eventType === 'class') return 'class';
  if (eventType === 'social') return 'social';
  if (eventType === 'operations' || eventType === 'governance') return 'business';
  return undefined;
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
    routeId: routeIdOf(row),
    dot: seasonDotKind(row.event_type),
    inSeason: month >= 5 && month <= 9,
    month,
    sortDay,
  };
}

function toSeasonEvent({ dateRange, name, routeId, dot }: WorkingEvent): SeasonEvent {
  return { dateRange, name, routeId, dot };
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
