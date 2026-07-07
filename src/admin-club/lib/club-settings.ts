// The `settings` table's per-key reads and writes the Club settings screen needs (Task 4): a
// key-value row, not a per-setting column, so a later setting (the season rollover, say) reads
// the same row shape rather than a new migration. `offer_window_hours` has a reader/writer pair;
// `waiver_text_version` (Task 8) has a reader only, since the wording it stamps lives in
// `$theme/waiver-text.ts`, not this table (editing that wording is a manual, deliberate act, not
// a Club settings-screen write path this pass).
import type { D1Database } from '@cloudflare/workers-types';

/** The ratified default (Geoff, 2026-07-07), also the migration's own seed value: used only if
 *  the row is ever missing, which should not happen post-migration. */
const DEFAULT_OFFER_WINDOW_HOURS = 72;

/** The waitlist offer's expiry window, in hours. */
export async function getOfferWindowHours(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'offer_window_hours'").first<{ value: string }>();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFER_WINDOW_HOURS;
}

/** Update the waitlist offer's expiry window. The caller validates `hours` (a positive integer)
 *  before this ever runs; this module trusts its argument the same way the other club-settings
 *  writers do. */
export async function setOfferWindowHours(db: D1Database, hours: number, updatedBy: string): Promise<void> {
  await db
    .prepare("UPDATE settings SET value = ?1, updated_at = datetime('now'), updated_by = ?2 WHERE key = 'offer_window_hours'")
    .bind(String(hours), updatedBy)
    .run();
}

/** The current UTC year: used only as a last-resort fallback for `getCurrentSeason`, which
 *  should not happen post-migration (the 0001 migration always seeds a `current_season` row). */
const FALLBACK_SEASON = new Date().getUTCFullYear();

/** The active season a new class is created into (Task 6): classes are per-season instances
 *  (`classes.season`), and the season rollover that creates the next one is a later pass's own
 *  write path; this module only ever reads the current value. */
export async function getCurrentSeason(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'current_season'").first<{ value: string }>();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : FALLBACK_SEASON;
}

/** The migration's own seed value: used only if the row is ever missing, which should not happen
 *  post-migration. */
const DEFAULT_WAIVER_TEXT_VERSION = '2026-01';

/** Which version of the liability-release wording (`$theme/waiver-text.ts`) a signer's acceptance
 *  should be stamped with: the public class-signup form (Task 8) and 2.2's join flow both read
 *  this at the moment of acceptance, so a `waiver_acceptances` row always records what the signer
 *  actually saw, not today's wording read back later. */
export async function getWaiverTextVersion(db: D1Database): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'waiver_text_version'").first<{ value: string }>();
  return row?.value ?? DEFAULT_WAIVER_TEXT_VERSION;
}

/** The migration's own seed value (`migrations/asc-club/0008_member_auth`): used only if the row
 *  is ever missing, which should not happen post-migration. */
const DEFAULT_RENEWAL_GRACE_DAYS = 30;

/**
 * How many days after a household's own renewal boundary (`memberships.paid_at` plus one year)
 * it stays in a 'grace' standing before reading as fully 'lapsed' (Geoff's 2026-07-07
 * rolling-renewal ruling: standing derives from a household's own paid date, not a season
 * boundary). `src/member-auth/lib/standing.ts`'s `getMemberStanding` is the one reader today; a
 * future renewal-reminder cadence and an asset-retention rule are both expected to key on the
 * same value, per the ruling's own reasoning, hence a Club setting rather than a constant.
 */
export async function getRenewalGraceDays(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'renewal_grace_days'").first<{ value: string }>();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_RENEWAL_GRACE_DAYS;
}
