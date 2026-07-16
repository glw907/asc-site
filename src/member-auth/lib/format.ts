// The one member-facing date formatter (round 3 of the basic-polish pass, 2026-07-16): every
// screen a signed-in member reads a date on (the standing card's own statusLine, my-account's
// receipts, my-account/classes' start dates) renders the same long civil-date wording ("July 7,
// 2027"), never a raw ISO/SQLite string. Lives here rather than in `$member-portal` because
// `$member-auth/lib/standing.ts` is this format's original source (the standing card's
// statusLine predates this pass) and `$member-portal` is already built on top of `$member-auth`
// per the alias boundary (svelte.config.js's own comment), so the direction of the dependency
// stays the same either way.
const LONG_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/** Parse a stored date value into a `Date`, accepting either a bare civil date ("YYYY-MM-DD") or
 *  this schema's full SQLite-datetime shape ("YYYY-MM-DD HH:MM:SS"), reading both as UTC so the
 *  display never shifts a civil date across a local timezone boundary. */
export function parseMemberDate(value: string): Date {
  const iso = value.length <= 10 ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

/** Format a stored date value (or an already-parsed `Date`) as a long civil date ("July 7,
 *  2027"). Accepts a raw string directly so a `+page.svelte` can call it inline on a data field
 *  without importing {@link parseMemberDate} separately. */
export function formatMemberDate(value: Date | string): string {
  const date = typeof value === 'string' ? parseMemberDate(value) : value;
  return LONG_DATE.format(date);
}
