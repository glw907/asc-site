// Screen-agnostic presentation primitives every /admin/club/* screen shares, so the office-list
// table recipe, the civil-date parse, and the whole-dollar formatting each have one home rather
// than a copy per screen (the same extraction member-format.ts did for the member-specific chip
// vocabularies once a second consumer needed them). Member-domain chips and labels stay in
// member-format.ts, which reads `ChipStyle` from here.

/** One chip's display: the label it reads, and the badge classes carrying its color. */
export interface ChipStyle {
  label: string;
  cls: string;
}

/** The uppercase micro-label the screens share for an eyebrow and every table column header:
 *  one design token so a header can't drift a screen at a time. */
export const HEADER_CELL = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';

/** The two-state ops visibility badge the Events and Classes rows both render off a SQLite
 *  `visible` boolean: the shown state gets the filled primary tint, hidden stays a ghost chip.
 *  Distinct from member-format.ts's three-state directory `VISIBILITY_CHIP`, which answers a
 *  different question (how a member appears in the public directory). */
export const OPS_VISIBILITY_CHIP: Record<'visible' | 'hidden', ChipStyle> = {
  visible: { label: 'Visible', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
  hidden: { label: 'Hidden', cls: 'badge-ghost badge-sm font-medium' },
};

const civilDateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** A civil date ("the regatta is on the 24th", "joined on the 2nd") is a calendar day, not an
 *  instant, so it parses at local midnight on purpose: appending T00:00:00 keeps `Date` from
 *  reading a bare YYYY-MM-DD as UTC and shifting it a day west of Greenwich. `fallback` is the
 *  empty-date word the screen wants ("TBD" for an unscheduled ops date, the default "Not yet"
 *  for a date that simply hasn't happened). */
export function formatCivilDate(iso: string | null, fallback = 'Not yet'): string {
  if (!iso) return fallback;
  // Some writers store a full SQLite datetime ("2026-06-14 19:22:57"); the civil-date
  // portion is the display contract either way.
  const civil = iso.slice(0, 10);
  const parsed = new Date(`${civil}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : civilDateFmt.format(parsed);
}

/** Whole US dollars (every dues, fee, and payment amount in this data is a plain integer, no
 *  cents anywhere), so this is string formatting, not currency math. A null amount reads as an
 *  em dash. */
export function formatDollars(amount: number | null): string {
  return amount == null ? '—' : `$${amount}`;
}

/** US dollars and cents off the ledger's own signed integer-cents amounts (`transactions.
 *  amount_total_cents`, `transaction_lines.amount_cents`): the money-ledger domain is the one
 *  place in this app that carries fractional dollars (a `$324` dues row is still whole, but a
 *  processor fee or a partial refund is not), so this stays a separate formatter from the whole-
 *  dollar `formatDollars` above rather than folding cents-awareness into every caller of that one. */
export function formatCents(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(amountCents) / 100).toFixed(2)}`;
}

// Pinned to the club's own timezone rather than `undefined` (the runtime's local zone): this
// renders on the server, and a Cloudflare Worker's runtime zone is UTC, not Alaska's. `undefined`
// would print a SQLite UTC timestamp as if it were already Anchorage wall-clock, nine or eight
// hours off (depending on daylight saving) for the one audience who actually reads this, the
// club's own admins.
const clubTimestampFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Anchorage',
});

/** Format a SQLite `datetime('now')`-shaped UTC string ("YYYY-MM-DD HH:MM:SS", no offset) as an
 *  Anchorage-local date and time: swapping the space for `T` and appending `Z` keeps `Date`
 *  reading the input as UTC rather than local time, the same reasoning `formatCivilDate`'s own
 *  comment gives for a bare calendar day. The waitlist offer's countdown
 *  (`class_offers.expires_at`) is this module's own consumer. */
export function formatClubTimestamp(sqliteDatetime: string): string {
  const parsed = new Date(`${sqliteDatetime.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? sqliteDatetime : clubTimestampFmt.format(parsed);
}
