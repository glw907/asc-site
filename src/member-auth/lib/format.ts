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

/**
 * Format an integer-cent amount for a MEMBER-facing surface: "$250" for a whole-dollar amount,
 * "$247.50" when there really are cents to show.
 *
 * Distinct from `$admin-club/lib/ui`'s own `formatCents`, which always renders two decimals. That
 * is right for the admin's ledger and money screens, where a column of amounts wants a fixed
 * decimal place to scan against, and wrong for a member reading their own short receipts list:
 * all 298 live charges are whole dollars (verified 2026-07-16), so a hard `.00` is noise on every
 * row anyone will actually see, and mock D's ratified receipts read "$250" and "$150". The cents
 * still render whenever they exist, so an odd amount is never silently rounded away.
 *
 * This is the ONE member-facing money formatter: the receipts list, the action row's amount, and
 * the gear page's fees all render through it. Do not reach for a bare
 * `` `$${(cents / 100).toLocaleString()}` `` at a call site instead. That shape looks equivalent
 * and is not: `toLocaleString` drops a trailing zero, so 24750 renders "$247.5" rather than
 * "$247.50". It reads as correct against whole-dollar fixture data and misprints the first real
 * amount that carries cents.
 */
export function formatMemberCents(amountCents: number): string {
  const sign = amountCents < 0 ? '-' : '';
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const cents = abs % 100;
  const amount = cents === 0 ? dollars : `${dollars}.${String(cents).padStart(2, '0')}`;
  return `${sign}$${amount}`;
}
