// The `settings` table's per-key reads and writes the Club settings screen needs (Task 4): a
// key-value row, not a per-setting column, so a later setting (the season rollover, say) reads
// the same row shape rather than a new migration. Only `offer_window_hours` has a reader/writer
// pair today; the season and waiver-version rows the 0001 migration also seeds are read by other
// modules (or not yet at all this pass).
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
