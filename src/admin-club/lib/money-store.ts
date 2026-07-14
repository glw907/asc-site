// The Money & Renewals screen's and the household desk's own reads against the ledger
// (`transactions`/`transaction_lines`, migration `0021_money_ledger`) and the season-flat
// `memberships` table (Task 3, docs/plans/2026-07-14-membership-admin.md). Same thin,
// `db`-as-parameter shape `households-store.ts` establishes: no validation or audit here, and no
// domain-schema join back the other way (`households-store.ts` deliberately leaves a membership's
// payment `source` for this module to answer, per that module's own `HouseholdMembershipRow`
// comment).
//
// `TimelineTransaction` is the one shared shape a ledger charge is read as everywhere: the
// household desk's own timeline, the Money & Renewals recent-transactions list, and (Task 6) the
// refund engine's own `buildRefundPlan(charge: TimelineTransaction, ...)` input. `refundable` and
// `apiEligible` are computed once, here, off every transaction read through this module, so a
// caller never re-derives Task 6's own eligibility rule in two places.
import type { D1Database } from '@cloudflare/workers-types';
import type { MembershipTier } from './member-types';
import type { LineItem, TransactionKind, TransactionSource } from './ledger';

/** One `transaction_lines` row, camelCased, nested under its `TimelineTransaction`. */
export interface TimelineLine {
  id: string;
  item: LineItem;
  description: string;
  amountCents: number;
  membershipId: string | null;
  enrollmentId: string | null;
  assignmentId: string | null;
}

/** One `transactions` row plus its lines, the shape every screen and the refund engine (Task 6)
 *  reads a ledger entry as. */
export interface TimelineTransaction {
  id: string;
  kind: TransactionKind;
  source: TransactionSource;
  occurredAt: string;
  amountTotalCents: number;
  feeCents: number | null;
  processorRef: string | null;
  refundsTransactionId: string | null;
  householdId: string | null;
  /** The household's own name, `null` for a non-member donor or when the caller reads a single
   *  household's own timeline (every row shares that household, so the caller already knows it). */
  householdName: string | null;
  payerName: string | null;
  payerEmail: string | null;
  memo: string | null;
  mwRef: string | null;
  lines: TimelineLine[];
  /** `kind === 'charge'` and the sum of any `refund` rows pointing at this one (via
   *  `refunds_transaction_id`) is still short of `amountTotalCents`: a fully refunded charge, or
   *  any `refund`/`void` row itself, is never refundable again. */
  refundable: boolean;
  /** Whether a refund against this charge can call the Stripe API (ruling 3): `source === 'stripe'`,
   *  no `mwRef` (an imported MembershipWorks row never has a live Stripe object behind it), and a
   *  `processorRef` this site's own checkout would have minted (`cs_...` a session, `pi_...` a
   *  payment intent). Imported MW rows, PayPal rows, and check/cash rows all read `false` here and
   *  take Task 6's record-only refund path instead. */
  apiEligible: boolean;
}

function isApiEligible(source: TransactionSource, mwRef: string | null, processorRef: string | null): boolean {
  if (source !== 'stripe' || mwRef != null || !processorRef) return false;
  return processorRef.startsWith('cs_') || processorRef.startsWith('pi_');
}

interface TransactionRawRow {
  id: string;
  kind: TransactionKind;
  source: TransactionSource;
  occurred_at: string;
  amount_total_cents: number;
  fee_cents: number | null;
  processor_ref: string | null;
  refunds_transaction_id: string | null;
  household_id: string | null;
  household_name: string | null;
  payer_name: string | null;
  payer_email: string | null;
  memo: string | null;
  mw_ref: string | null;
  refunded_so_far: number;
}

interface TransactionLineRawRow {
  id: string;
  transaction_id: string;
  item: LineItem;
  description: string;
  amount_cents: number;
  membership_id: string | null;
  enrollment_id: string | null;
  assignment_id: string | null;
}

/** How much has already come back against a charge, via any `refund` row that names it in
 *  `refunds_transaction_id`: the correlated subquery every transaction read in this module
 *  carries, so `refundable` never needs a second query. */
const REFUNDED_SO_FAR_SQL = `(
  SELECT COALESCE(SUM(r.amount_total_cents), 0) FROM transactions r
  WHERE r.refunds_transaction_id = t.id AND r.kind = 'refund'
) AS refunded_so_far`;

function toTimelineTransactions(txRows: TransactionRawRow[], lineRows: TransactionLineRawRow[]): TimelineTransaction[] {
  const linesByTransaction = new Map<string, TimelineLine[]>();
  for (const line of lineRows) {
    const list = linesByTransaction.get(line.transaction_id) ?? [];
    list.push({
      id: line.id,
      item: line.item,
      description: line.description,
      amountCents: line.amount_cents,
      membershipId: line.membership_id,
      enrollmentId: line.enrollment_id,
      assignmentId: line.assignment_id,
    });
    linesByTransaction.set(line.transaction_id, list);
  }

  return txRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    occurredAt: row.occurred_at,
    amountTotalCents: row.amount_total_cents,
    feeCents: row.fee_cents,
    processorRef: row.processor_ref,
    refundsTransactionId: row.refunds_transaction_id,
    householdId: row.household_id,
    householdName: row.household_name,
    payerName: row.payer_name,
    payerEmail: row.payer_email,
    memo: row.memo,
    mwRef: row.mw_ref,
    lines: linesByTransaction.get(row.id) ?? [],
    refundable: row.kind === 'charge' && row.refunded_so_far < row.amount_total_cents,
    apiEligible: isApiEligible(row.source, row.mw_ref, row.processor_ref),
  }));
}

/** Every ledger transaction for one household, with its lines, newest first: the household desk's
 *  own money-timeline block. Two set-based queries (transactions, then their lines), never
 *  per-transaction round trips. */
export async function getHouseholdTimeline(db: D1Database, householdId: string): Promise<TimelineTransaction[]> {
  const { results: txRows } = await db
    .prepare(
      `SELECT t.id, t.kind, t.source, t.occurred_at, t.amount_total_cents, t.fee_cents, t.processor_ref,
              t.refunds_transaction_id, t.household_id, NULL AS household_name, t.payer_name, t.payer_email,
              t.memo, t.mw_ref, ${REFUNDED_SO_FAR_SQL}
       FROM transactions t
       WHERE t.household_id = ?1
       ORDER BY t.occurred_at DESC, t.created_at DESC`,
    )
    .bind(householdId)
    .all<TransactionRawRow>();

  const { results: lineRows } = await db
    .prepare(
      `SELECT tl.id, tl.transaction_id, tl.item, tl.description, tl.amount_cents, tl.membership_id, tl.enrollment_id, tl.assignment_id
       FROM transaction_lines tl
       JOIN transactions t ON t.id = tl.transaction_id
       WHERE t.household_id = ?1`,
    )
    .bind(householdId)
    .all<TransactionLineRawRow>();

  return toTimelineTransactions(txRows, lineRows);
}

/** The most recent `limit` ledger transactions across every household, newest first, household
 *  name joined in for display: Money & Renewals' own recent-transactions list. */
export async function listRecentTransactions(db: D1Database, limit: number): Promise<TimelineTransaction[]> {
  const { results: txRows } = await db
    .prepare(
      `SELECT t.id, t.kind, t.source, t.occurred_at, t.amount_total_cents, t.fee_cents, t.processor_ref,
              t.refunds_transaction_id, t.household_id, h.name AS household_name, t.payer_name, t.payer_email,
              t.memo, t.mw_ref, ${REFUNDED_SO_FAR_SQL}
       FROM transactions t
       LEFT JOIN households h ON h.id = t.household_id
       ORDER BY t.occurred_at DESC, t.created_at DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all<TransactionRawRow>();

  if (txRows.length === 0) return [];

  const placeholders = txRows.map((_, index) => `?${index + 1}`).join(', ');
  const { results: lineRows } = await db
    .prepare(
      `SELECT id, transaction_id, item, description, amount_cents, membership_id, enrollment_id, assignment_id
       FROM transaction_lines WHERE transaction_id IN (${placeholders})`,
    )
    .bind(...txRows.map((row) => row.id))
    .all<TransactionLineRawRow>();

  return toTimelineTransactions(txRows, lineRows);
}

/** One row of the season-flat memberships table: household, tier, amount, paid date, source, and
 *  refunded state. */
export interface SeasonMembershipRow {
  id: string;
  householdId: string;
  householdName: string;
  season: number;
  tier: MembershipTier;
  pricePaid: number;
  paidAt: string | null;
  refundedAt: string | null;
  /** The most recent `dues` ledger line's own transaction source for this membership, `null` when
   *  no ledger transaction has ever been linked (an invoiced-but-unpaid row, `paidAt === null`).
   *  A membership can carry more than one `dues` charge (the Oliver household's two-charge 2024
   *  season, `docs/STATUS.md`'s own live example): the most recent one grounds this display field,
   *  the full breakdown lives on the household's own `getHouseholdTimeline`. */
  source: TransactionSource | null;
}

interface SeasonMembershipRawRow {
  id: string;
  household_id: string;
  household_name: string;
  season: number;
  tier: string;
  price_paid: number;
  paid_at: string | null;
  refunded_at: string | null;
  source: string | null;
}

/** The flat memberships table for one season, household name joined in, source read off the
 *  latest linked `dues` ledger charge: Money & Renewals' own season-picker table. */
export async function listSeasonMemberships(db: D1Database, season: number): Promise<SeasonMembershipRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.household_id, h.name AS household_name, m.season, m.tier, m.price_paid, m.paid_at, m.refunded_at,
              (
                SELECT tx.source FROM transaction_lines tl JOIN transactions tx ON tx.id = tl.transaction_id
                WHERE tl.membership_id = m.id AND tl.item = 'dues'
                ORDER BY tx.occurred_at DESC LIMIT 1
              ) AS source
       FROM memberships m
       JOIN households h ON h.id = m.household_id
       WHERE m.season = ?1
       ORDER BY h.name`,
    )
    .bind(season)
    .all<SeasonMembershipRawRow>();

  return results.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    householdName: row.household_name,
    season: row.season,
    tier: row.tier as MembershipTier,
    pricePaid: row.price_paid,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    source: row.source as TransactionSource | null,
  }));
}

/** One household whose latest paid, non-refunded membership season is the season immediately
 *  before the one asked about: a renewal prospect, read-only per the design doc's ruling 6 (no
 *  per-row send button; the automated reminders already exist). */
export interface RenewalCandidateRow {
  householdId: string;
  householdName: string;
  lastSeason: number;
  tier: MembershipTier;
  pricePaid: number;
  paidAt: string;
}

interface RenewalCandidateRawRow {
  household_id: string;
  household_name: string;
  season: number;
  tier: string;
  price_paid: number;
  paid_at: string;
}

/** Every household whose latest paid, non-refunded membership season is `season - 1`: the same
 * grounding-row idea `households-store.ts`'s `listHouseholds` uses, scoped to exactly the prior
 * season so a household that already renewed for `season` (or whose only `season - 1` row was
 * refunded) never appears.
 */
export async function listRenewalCandidates(db: D1Database, season: number): Promise<RenewalCandidateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT h.id AS household_id, h.name AS household_name, gm.season, gm.tier, gm.price_paid, gm.paid_at
       FROM households h
       JOIN (
         SELECT mm.household_id, mm.season, mm.tier, mm.price_paid, mm.paid_at
         FROM memberships mm
         WHERE mm.paid_at IS NOT NULL AND mm.refunded_at IS NULL
           AND mm.id = (
             SELECT id FROM memberships m2
             WHERE m2.household_id = mm.household_id AND m2.paid_at IS NOT NULL AND m2.refunded_at IS NULL
             ORDER BY m2.paid_at DESC LIMIT 1
           )
       ) gm ON gm.household_id = h.id
       WHERE gm.season = ?1
       ORDER BY h.name`,
    )
    .bind(season - 1)
    .all<RenewalCandidateRawRow>();

  return results.map((row) => ({
    householdId: row.household_id,
    householdName: row.household_name,
    lastSeason: row.season,
    tier: row.tier as MembershipTier,
    pricePaid: row.price_paid,
    paidAt: row.paid_at,
  }));
}

/** One active asset assignment whose household lacks a paid, non-refunded membership for the
 *  season asked about (Elayne C Hunter's Yellow Laser against a 2024 membership, the design doc's
 *  own live example): the Money & Renewals attention list, each row linking to its household desk. */
export interface AttentionRow {
  assignmentId: string;
  householdId: string;
  householdName: string;
  assetTypeName: string;
  /** The assignment's own grounding membership's season, e.g. `2024`, for the "against a stale
   *  membership" display. */
  membershipSeason: number;
}

interface AttentionRawRow {
  assignment_id: string;
  household_id: string;
  household_name: string;
  asset_type_name: string;
  membership_season: number;
}

/** Every active assignment whose household has no paid, non-refunded membership for `season`: the
 *  `NOT EXISTS` scan over the same `memberships` predicate `listRenewalCandidates` and
 *  `listHouseholds` both use, so "current for a season" means the same thing everywhere in this
 *  module. */
export async function listAttentionItems(db: D1Database, season: number): Promise<AttentionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT aa.id AS assignment_id, h.id AS household_id, h.name AS household_name, at.name AS asset_type_name,
              ms.season AS membership_season
       FROM asset_assignments aa
       JOIN asset_types at ON at.id = aa.asset_type
       JOIN memberships ms ON ms.id = aa.membership_id
       JOIN households h ON h.id = ms.household_id
       WHERE aa.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM memberships cur
           WHERE cur.household_id = h.id AND cur.season = ?1 AND cur.paid_at IS NOT NULL AND cur.refunded_at IS NULL
         )
       ORDER BY h.name`,
    )
    .bind(season)
    .all<AttentionRawRow>();

  return results.map((row) => ({
    assignmentId: row.assignment_id,
    householdId: row.household_id,
    householdName: row.household_name,
    assetTypeName: row.asset_type_name,
    membershipSeason: row.membership_season,
  }));
}

/** The Money & Renewals screen's four stat tiles: plain numbers, no charts (the design doc's own
 *  ruling). */
export interface MoneyOverview {
  /** Households with a paid, non-refunded membership for `season` itself (a season-scoped count,
   *  distinct from the Members list's rolling per-household standing). */
  currentHouseholds: number;
  totalHouseholds: number;
  /** The sum of `price_paid` across every paid, non-refunded membership for `season`: dues income,
   *  not the full ledger (a partial dues refund leaves `price_paid` as the original snapshot per
   *  ruling 4, so this stays the "what was invoiced and paid" figure the design doc's own $30,044
   *  example names, not a net-of-refunds figure). */
  duesCollected: number;
  renewalCandidates: number;
  attentionCount: number;
}

async function countAllHouseholds(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM households').first<{ n: number }>();
  return row?.n ?? 0;
}

async function countCurrentHouseholds(db: D1Database, season: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(DISTINCT household_id) AS n FROM memberships WHERE season = ?1 AND paid_at IS NOT NULL AND refunded_at IS NULL')
    .bind(season)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function sumDuesCollected(db: D1Database, season: number): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(price_paid), 0) AS total FROM memberships WHERE season = ?1 AND paid_at IS NOT NULL AND refunded_at IS NULL')
    .bind(season)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** The four stat tiles, composed from this module's own `listRenewalCandidates`/`listAttentionItems`
 *  (their `.length`) plus three plain scalar queries, all run in parallel. */
export async function getMoneyOverview(db: D1Database, season: number): Promise<MoneyOverview> {
  const [totalHouseholds, currentHouseholds, duesCollected, renewalCandidates, attentionItems] = await Promise.all([
    countAllHouseholds(db),
    countCurrentHouseholds(db, season),
    sumDuesCollected(db, season),
    listRenewalCandidates(db, season),
    listAttentionItems(db, season),
  ]);
  return {
    currentHouseholds,
    totalHouseholds,
    duesCollected,
    renewalCandidates: renewalCandidates.length,
    attentionCount: attentionItems.length,
  };
}
