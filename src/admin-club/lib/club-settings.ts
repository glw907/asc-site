// The `settings` table's per-key reads and writes the Club settings screen needs (Task 4): a
// key-value row, not a per-setting column, so a later setting (the season rollover, say) reads
// the same row shape rather than a new migration. `offer_window_hours` has a reader/writer pair;
// `waiver_text_version` (Task 8) has a reader only, since the wording it stamps lives in
// `$theme/waiver-text.ts`, not this table (editing that wording is a manual, deliberate act, not
// a Club settings-screen write path this pass). `getCurrentSeason` is also the season rollover's
// own read of "the season closing" (`rollover.ts`); the rollover itself writes `current_season`
// directly rather than through a setter here, since its write must ride the same `db.batch()` as
// its audit row (see `rollover.ts`'s own header on why).
import type { D1Database } from '@cloudflare/workers-types';
import type { MembershipTier } from './demo-members';

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

/** The `settings.key` each tier's price is stored under (migration 0010_tier_prices). */
const TIER_PRICE_KEY: Record<MembershipTier, string> = {
  individual: 'tier_price_individual',
  family: 'tier_price_family',
  'young-adult': 'tier_price_young_adult',
};

/** The migration's own seed values: used only if a row is ever missing, which should not happen
 *  post-migration. Matches `demo-members.ts`'s `TIER_PRICING` fixture exactly, though that
 *  constant stays fixture-only; this is the real, admin-editable source once a caller reads it. */
const DEFAULT_TIER_PRICE: Record<MembershipTier, number> = { individual: 250, family: 500, 'young-adult': 100 };

/** The three membership tiers' current prices, whole dollars: the join/renewal flow's own read
 *  (a later pass), never a code constant, per the design suite's own ruling. Reads all three in
 *  one query rather than three round trips, since the settings screen always shows all three
 *  together. */
export async function getTierPrices(db: D1Database): Promise<Record<MembershipTier, number>> {
  const { results } = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('tier_price_individual', 'tier_price_family', 'tier_price_young_adult')")
    .all<{ key: string; value: string }>();
  const byKey = new Map(results.map((row) => [row.key, row.value]));
  const prices = {} as Record<MembershipTier, number>;
  for (const tier of Object.keys(TIER_PRICE_KEY) as MembershipTier[]) {
    const raw = byKey.get(TIER_PRICE_KEY[tier]);
    const parsed = raw == null ? NaN : Number(raw);
    prices[tier] = Number.isFinite(parsed) ? parsed : DEFAULT_TIER_PRICE[tier];
  }
  return prices;
}

/** Update one tier's price. The caller validates `dollars` (a positive integer) before this ever
 *  runs, matching {@link setOfferWindowHours}'s own trust boundary. A price change here only ever
 *  affects a MEMBERSHIP CREATED AFTER this write: every existing `memberships.price_paid` row is
 *  a snapshot taken at purchase and never re-reads this setting. */
export async function setTierPrice(db: D1Database, tier: MembershipTier, dollars: number, updatedBy: string): Promise<void> {
  await db
    .prepare("UPDATE settings SET value = ?1, updated_at = datetime('now'), updated_by = ?2 WHERE key = ?3")
    .bind(String(dollars), updatedBy, TIER_PRICE_KEY[tier])
    .run();
}

/** The migration's own seed value (`migrations/asc-club/0009_member_auth`): used only if the row
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

/** The migration's own seed values (`migrations/asc-club/0012_class_reminders`): used only if a
 *  row is ever missing, which should not happen post-migration. */
const DEFAULT_REFUND_WINDOW_DAYS = 14;
const DEFAULT_REFUND_NOTICE_LEAD_DAYS = 3;

/**
 * How many days before a class's own `start_date` a paid enrollment's refund/voucher deadline
 * falls (the education page's own published policy): `src/jobs/class-refund-window-notice.ts`'s
 * one reader, a Club setting rather than a constant for the same reason every other cadence
 * number here is (`getOfferWindowHours`'s own precedent).
 */
export async function getRefundWindowDays(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'refund_window_days'").first<{ value: string }>();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_REFUND_WINDOW_DAYS;
}

/**
 * How many days BEFORE the refund cutoff (`getRefundWindowDays` days before `start_date`) the
 * refund-window-notice job warns a paid enrollee, so the notice lands with time to act rather
 * than on the cutoff itself.
 */
export async function getRefundNoticeLeadDays(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'refund_notice_lead_days'").first<{ value: string }>();
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_REFUND_NOTICE_LEAD_DAYS;
}
