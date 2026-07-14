// The manual (check/cash/comp) membership payment plan builder (Task 5, docs/plans/2026-07-14-
// membership-admin.md, the design doc's own "Manual payments" section): membership row plus
// ledger transaction, one `db.batch()`, through `buildTransactionStatements`'s own sum-invariant
// enforcement so this module never hand-writes a `transactions` row. A season already carrying a
// non-refunded membership refuses (the `UNIQUE(household_id, season)` constraint this module
// never wants a caller to hit at write time); a REFUNDED row for the same season reclaims in
// place instead of inserting (ruling 4, "rejoining the same season reclaims the row").
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { MembershipTier } from './member-types';
import { buildTransactionStatements, type TransactionSource } from './ledger';
import { toSqliteDatetime } from './offers';

/** Sources a manual, no-checkout payment can carry: an offline check or cash payment, or a comp
 *  (amount 0) the board granted. Stripe/PayPal payments arrive through their own reconcilers, not
 *  this path. */
export type ManualPaymentSource = Extract<TransactionSource, 'check' | 'cash' | 'comp'>;

export interface ManualMembershipPaymentInput {
  householdId: string;
  season: number;
  tier: MembershipTier;
  /** The ledger's own unit; the membership row's `price_paid` (whole dollars) derives from this,
   *  matching every other write path's dollars-to-cents rounding (`statements.ts`'s own
   *  `buildJoinStatements`). */
  amountCents: number;
  source: ManualPaymentSource;
  memo?: string | null;
}

export type ManualMembershipPaymentResult =
  | { ok: true; statements: D1PreparedStatement[]; membershipId: string }
  | { ok: false; error: string };

interface ExistingMembershipRow {
  id: string;
  refunded_at: string | null;
}

/**
 * Build the membership-row write (a fresh insert, or a refunded row's reclaim) plus the ledger
 * `charge`/`dues` transaction, as unrun statements for one `db.batch()`. Refuses when a
 * NON-refunded membership already exists for `input.householdId`/`input.season`, rather than
 * letting the batch fail on the schema's own unique constraint.
 */
export async function buildManualMembershipPayment(db: D1Database, input: ManualMembershipPaymentInput): Promise<ManualMembershipPaymentResult> {
  const existing = await db
    .prepare('SELECT id, refunded_at FROM memberships WHERE household_id = ?1 AND season = ?2')
    .bind(input.householdId, input.season)
    .first<ExistingMembershipRow>();

  if (existing && existing.refunded_at === null) {
    return { ok: false, error: `This household already has a ${input.season} membership on file.` };
  }

  const membershipId = existing?.id ?? crypto.randomUUID();
  const priceDollars = Math.round(input.amountCents / 100);
  const membershipStatement = existing
    ? db
        .prepare(
          "UPDATE memberships SET tier = ?1, price_paid = ?2, paid_at = date('now'), stripe_ref = NULL, refunded_at = NULL WHERE id = ?3",
        )
        .bind(input.tier, priceDollars, membershipId)
    : db
        .prepare("INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at) VALUES (?1, ?2, ?3, ?4, ?5, date('now'))")
        .bind(membershipId, input.householdId, input.season, input.tier, priceDollars);

  const { statements: ledgerStatements } = buildTransactionStatements(
    db,
    {
      kind: 'charge',
      source: input.source,
      occurredAt: toSqliteDatetime(new Date()),
      amountTotalCents: input.amountCents,
      householdId: input.householdId,
      memo: input.memo ?? null,
    },
    [{ item: 'dues', description: `${input.tier} dues, ${input.season}`, amountCents: input.amountCents, membershipId }],
  );

  return { ok: true, statements: [membershipStatement, ...ledgerStatements], membershipId };
}
