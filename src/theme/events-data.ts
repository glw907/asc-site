// The events deep-look pass: the full `/events` listing (docs/events-manifest.md is the mini-spec
// this module originally built against, written against the ops-sourced schema; pass 2.1's Task 9
// repoints the read to asc-club, whose column names differ, noted inline below). Reads the same
// club-owned D1 tables `$theme/season-data.ts` already verified (`events` and `classes`, unioned,
// `classes` tagged with the synthesized `'class'` category), but pulls every display field the
// detailed page needs, not just the compact Season teaser's date/name/taxonomy triple. Shares the
// low-level date helpers with season-data.ts (`getOrderingDate`, `monthAndDay`, `formatDateRange`,
// `categorize`, `SEASON_MONTHS`, `DATE_TBD`) rather than a second copy of that logic; this module
// owns everything specific to the full detail view: the richer row shape, the type/registration-
// status label maps, hero-image resolution, and the month/off-season/meetings grouping (a
// governance row is pulled out of the month and off-season buckets entirely, by type, regardless
// of its date, mirroring the legacy main-site Worker's own `buildEventsPage`).
import type { D1Database } from '@cloudflare/workers-types';
import type { MediaResolve } from '@glw907/cairn-cms/media';
import { categorize, DATE_TBD, formatDateRange, monthAndDay, SEASON_MONTHS } from './season-data';
import { resolveEventImageUrl } from './event-images';

/** A raw event or class row from D1, the full column set the detailed listing reads (a superset of
 *  season-data.ts's own `EventRow`, structurally compatible with its exported date helpers). */
export interface EventDetailRow {
  title: string;
  slug: string;
  event_type: string;
  start_date: string | null;
  end_date: string | null;
  date_history: string | null;
  location: string | null;
  short_description: string | null;
  long_description: string | null;
  hero_image: string | null;
  hero_image_alt: string | null;
  registration_url: string | null;
  /** Only ever set on a synthesized `'class'` row; a real `events` row selects a literal `NULL`. */
  registration_status: string | null;
}

/** The events table's full-detail SELECT. asc-club's `events` (`migrations/asc-club/
 *  0001_substrate/`) carries no `registration_url` or `date_history` column (both ops-only, per
 *  `scripts/import/ops-events.README.md`'s field mapping), so both select as a literal `NULL`,
 *  keeping `EventDetailRow`'s shape unchanged for `buildEventsPage`'s date helpers. */
const EVENTS_QUERY = `SELECT title, slug, category AS event_type, start_date, end_date,
                              NULL AS date_history, location, short_description, long_description,
                              hero_image, hero_image_alt, NULL AS registration_url,
                              NULL AS registration_status
                       FROM events WHERE visible = 1`;
/** The classes table's full-detail SELECT, tagged with the synthesized `'class'` category. Three
 *  differences from the events query above, all forced by the ratified `classes` schema
 *  (`migrations/asc-club/0001_substrate/`), which was never designed to carry the public listing's
 *  richer row shape: (1) `classes` has one merged `description` column, not a short/long pair (see
 *  `scripts/import/ops-classes.README.md`: asc-club joined ops's `short_description` and
 *  `long_description` into it at import time), so the whole thing selects as `long_description`
 *  (markdown-rendered) and `short_description` is a literal `NULL`; (2) `classes` carries no
 *  `hero_image`/`hero_image_alt` at all (unlike `events`), so every class card falls back to the
 *  type-colored placeholder, a real loss against the ops-sourced read (5 of the imported classes
 *  had a photo there) this pass does not recover; (3) neither `registration_url` nor
 *  `registration_status` is a stored column (registration is now the internal enrollment/waitlist
 *  machine): the signup link is computed directly from the class's own `id` (collapsing the
 *  slug-join Task 8 did against a separate CLUB_DB read, now redundant since this query already
 *  reads CLUB_DB), and the status derives from live enrollment vs `capacity`, the same fullness
 *  rule `$admin-club/lib/classes-store.ts`'s `isFull` already uses, rather than a stored flag. */
const CLASSES_QUERY = `SELECT name AS title, slug, 'class' AS event_type, start_date, end_date,
                               NULL AS date_history, location, NULL AS short_description,
                               description AS long_description, NULL AS hero_image,
                               NULL AS hero_image_alt,
                               '/classes/' || id || '/signup' AS registration_url,
                               CASE WHEN (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = classes.id) >= capacity
                                    THEN 'full' ELSE 'open' END AS registration_status
                        FROM classes WHERE visible = 1`;

/** Read every visible event and class row, full detail. Degrades to an empty list on any D1
 *  failure, the same safe failure `season-data.ts`'s `loadSeasonMonths` uses. */
export async function readEventRows(db: D1Database): Promise<EventDetailRow[]> {
  try {
    const [events, classes] = await Promise.all([
      db.prepare(EVENTS_QUERY).all<EventDetailRow>(),
      db.prepare(CLASSES_QUERY).all<EventDetailRow>(),
    ]);
    return [...(events.results ?? []), ...(classes.results ?? [])];
  } catch (err) {
    console.error('events-data: CLUB_DB read failed', err);
    return [];
  }
}

const TYPE_LABELS: Record<string, string> = {
  racing: 'Racing',
  class: 'Class',
  operations: 'Operations',
  social: 'Social Event',
  governance: 'Governance',
};

/** The type-colored placeholder's glyph, one per type, all already in `$theme/markdown/icons.ts`'s
 *  `ICON_PATHS` (Phosphor paths ported verbatim from the pre-rebuild Hugo site's own vendored
 *  icons, which happen to be the exact same shapes the legacy events page's own fallback SVGs
 *  used: `wrench` for operations, `handshake` for a social event, `scales` for governance). */
const TYPE_ICONS: Record<string, string> = {
  racing: 'sailboat',
  class: 'graduation-cap',
  operations: 'wrench',
  social: 'handshake',
  governance: 'scales',
};

/** The registration-status label map, the events-page's own extended form (`closed` reads longer
 *  here than the ops dashboard's plain "Closed", since a member reading the public page needs the
 *  waitlist pointer the ops-side pill doesn't). */
const REG_STATUS_LABELS: Record<string, string> = {
  not_scheduled: 'Not Scheduled',
  upcoming: 'Coming Soon',
  open: 'Open',
  full: 'Full',
  closed: 'Closed (Waitlist Open)',
};

/** The badge's color role, one of the reserved semantic tokens (never the club-grounds palette;
 *  see theme.css's own header comment on why info/success/warning/error stay separate). */
export type RegStatusKind = 'success' | 'info' | 'warning' | 'error' | 'muted';

const REG_STATUS_KIND: Record<string, RegStatusKind> = {
  not_scheduled: 'muted',
  upcoming: 'info',
  open: 'success',
  full: 'warning',
  closed: 'error',
};

/** One event or class, display-ready: every field its card variant (full or compact) needs. */
export interface EventCard {
  slug: string;
  title: string;
  typeLabel: string;
  /** The placeholder glyph's name (a key into `ICON_PATHS`), shown only when the row has no
   *  `hero_image` (or the type is `governance`, which never shows an image slot at all). */
  typeIcon: string;
  /** The C7 taxonomy, reused verbatim from `season-data.ts`'s `categorize()`: `dot` for a class or
   *  clinic (the gold accent), `muted` for a routine non-racing entry, plain ink for a racing
   *  event. */
  dot?: boolean;
  muted?: boolean;
  dateDisplay: string;
  isTbd: boolean;
  location?: string;
  shortDescription?: string;
  /** Pre-rendered markdown (the async render step runs once, in the page's own server load). */
  longDescriptionHtml?: string;
  registrationUrl?: string;
  registrationStatusLabel?: string;
  registrationStatusKind?: RegStatusKind;
  image?: { url: string; alt: string };
}

/** One month's (or Off-Season's) section, in the full listing's own shape (distinct from
 *  season-data.ts's `SeasonMonth`: this carries the section's anchor id alongside its events). */
export interface EventSection {
  id: string;
  label: string;
  events: EventCard[];
}

/** One TOC jump link: only ever built for a section that actually has events. */
export interface TocLink {
  href: string;
  label: string;
}

/** The full `/events` page's data: the TOC, the populated month sections, Off-Season, and
 *  Meetings & Governance, plus whether the whole calendar came back empty. */
export interface EventsPageData {
  tocLinks: TocLink[];
  monthSections: EventSection[];
  offSeason: EventCard[];
  meetings: EventCard[];
  isEmpty: boolean;
}

const MONTH_TOC_LABELS: Record<number, string> = { 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep' };
const MONTH_IDS: Record<number, string> = {
  5: 'may',
  6: 'june',
  7: 'july',
  8: 'august',
  9: 'september',
};
/** The Off-Season and Meetings & Governance section anchor ids, exported so the page component
 *  can set the matching `id="section-<id>"` the TOC links jump to. */
export const OFF_SEASON_ID = 'off-season';
export const MEETINGS_ID = 'meetings';

/** Render a row's markdown fields and resolve its photo, the two async steps a bare D1 row needs
 *  before it is display-ready. */
async function toEventCard(
  row: EventDetailRow,
  currentYear: number,
  resolveMedia: MediaResolve,
  renderMarkdown: (md: string) => Promise<string>,
): Promise<EventCard> {
  const isTbd =
    !row.start_date || new Date(`${row.start_date}T00:00:00`).getFullYear() !== currentYear;
  const dateDisplay = isTbd ? DATE_TBD : formatDateRange(row.start_date as string, row.end_date);

  const imageUrl = resolveEventImageUrl(row.hero_image, resolveMedia);
  const card: EventCard = {
    slug: row.slug,
    title: row.title,
    typeLabel: TYPE_LABELS[row.event_type] ?? row.event_type,
    typeIcon: TYPE_ICONS[row.event_type] ?? 'sailboat',
    ...categorize(row.event_type),
    dateDisplay,
    isTbd,
    location: row.location ?? undefined,
    shortDescription: row.short_description ?? undefined,
    // A class row's registration_url is computed straight off asc-club by the query above (its own
    // `id`, this database's internal signup route); a plain events row selects a literal `NULL`.
    registrationUrl: row.registration_url ?? undefined,
    image: imageUrl && row.hero_image ? { url: imageUrl, alt: row.hero_image_alt ?? row.title } : undefined,
  };
  if (row.long_description) {
    card.longDescriptionHtml = await renderMarkdown(row.long_description);
  }
  // A registration-status badge only ever marks a class or clinic, never a plain events row (see
  // docs/events-manifest.md's #3: this is independent of whether the row itself has a
  // registration_url, matching the legacy events page exactly).
  if (row.event_type === 'class' && row.registration_status) {
    card.registrationStatusLabel = REG_STATUS_LABELS[row.registration_status] ?? row.registration_status;
    card.registrationStatusKind = REG_STATUS_KIND[row.registration_status] ?? 'muted';
  }
  return card;
}

const byMonthThenDay = (a: { month: number; sortDay: number }, b: { month: number; sortDay: number }) =>
  a.month !== b.month ? a.month - b.month : a.sortDay - b.sortDay;

/** Build the full `/events` page's data from every visible row: the enriched cards, grouped into
 *  month sections, Off-Season, and Meetings & Governance, plus the TOC that only lists a populated
 *  section. */
export async function buildEventsPage(
  rows: EventDetailRow[],
  opts: {
    currentYear?: number;
    resolveMedia: MediaResolve;
    renderMarkdown: (md: string) => Promise<string>;
  },
): Promise<EventsPageData> {
  const currentYear = opts.currentYear ?? new Date().getFullYear();

  const enriched = await Promise.all(
    rows.map(async (row) => ({
      row,
      ...monthAndDay(row, currentYear),
      card: await toEventCard(row, currentYear, opts.resolveMedia, opts.renderMarkdown),
    })),
  );

  const monthBuckets = new Map<number, typeof enriched>();
  const offSeasonRows: typeof enriched = [];
  const meetingRows: typeof enriched = [];

  for (const item of enriched) {
    if (item.row.event_type === 'governance') {
      meetingRows.push(item);
    } else if (item.month >= 5 && item.month <= 9) {
      const bucket = monthBuckets.get(item.month) ?? [];
      bucket.push(item);
      monthBuckets.set(item.month, bucket);
    } else {
      offSeasonRows.push(item);
    }
  }

  const monthSections: EventSection[] = [];
  const tocLinks: TocLink[] = [];
  for (const { month, label } of SEASON_MONTHS) {
    const bucket = monthBuckets.get(month);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort(byMonthThenDay);
    monthSections.push({ id: MONTH_IDS[month], label, events: bucket.map((b) => b.card) });
    tocLinks.push({ href: `#section-${MONTH_IDS[month]}`, label: MONTH_TOC_LABELS[month] });
  }

  offSeasonRows.sort(byMonthThenDay);
  if (offSeasonRows.length > 0) tocLinks.push({ href: `#section-${OFF_SEASON_ID}`, label: 'Off-Season' });

  meetingRows.sort(byMonthThenDay);
  if (meetingRows.length > 0) tocLinks.push({ href: `#section-${MEETINGS_ID}`, label: 'Meetings' });

  return {
    tocLinks,
    monthSections,
    offSeason: offSeasonRows.map((r) => r.card),
    meetings: meetingRows.map((r) => r.card),
    isEmpty: monthSections.length === 0 && offSeasonRows.length === 0 && meetingRows.length === 0,
  };
}
