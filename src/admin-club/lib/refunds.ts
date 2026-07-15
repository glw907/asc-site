// The refund engine (Task 6, docs/plans/2026-07-14-membership-admin.md, the design doc's own
// "Refunds" section): given a ledger charge (`money-store.ts`'s own `TimelineTransaction`, already
// carrying every line and the `apiEligible` flag Task 3 computed) and the admin's own per-line
// selection, `buildRefundPlan` is a pure function -- no `db`, no network -- that decides whether the
// refund can call Stripe, mirrors the selected lines into a refund transaction that sums to the
// refund amount by construction (the ledger's own sum invariant, `ledger.ts`'s header comment), and
// derives the domain unwind each selected line implies. `executeRefund` is the impure convenience
// wrapper around it (the same builder/executor split `ledger.ts`'s `buildTransactionStatements`/
// `recordTransaction` already establishes): call Stripe first in API mode and write nothing on a
// failure, then fold the ledger refund and every unwind into one `db.batch()`.
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { TimelineLine, TimelineTransaction } from './money-store';
import { buildTransactionStatements, type TransactionHeader, type TransactionLineInput } from './ledger';
import { buildRefundIdempotencyKey, issueStripeRefund, type CreateCheckoutEnv } from './payments';
import { toSqliteDatetime } from './offers';

/** One line the admin picked to refund, and how much of it: `amountCents` may be less than the
 *  line's own full amount (a partial dues refund, the design doc's own example). */
export interface RefundLineSelection {
  lineId: string;
  amountCents: number;
}

/** The domain-row consequence of refunding one selected line, per the design doc's own unwind
 *  rules. A donation line (or any line refunded with no domain reference at all) produces no
 *  unwind: ledger only. */
export type UnwindAction =
  | { kind: 'membership-refunded'; membershipId: string }
  | { kind: 'drop-enrollment'; enrollmentId: string }
  | { kind: 'unflip-asset-fee'; assignmentId: string };

/** `buildRefundPlan`'s own output: the ledger refund transaction's header and lines (not yet run
 *  as statements -- that needs `db`, which this module's pure builder never takes), the total
 *  refund amount, whether it can reach Stripe, and the unwinds the selected lines imply. */
export interface RefundPlan {
  mode: 'api' | 'record-only';
  refundAmountCents: number;
  header: TransactionHeader;
  lines: TransactionLineInput[];
  unwinds: UnwindAction[];
}

function findLine(charge: TimelineTransaction, lineId: string): TimelineLine {
  const line = charge.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw new Error(`refunds: charge ${charge.id} carries no line ${lineId}`);
  return line;
}

/**
 * Build a refund plan for `charge`, refunding exactly `selection`'s lines at `selection`'s own
 * amounts. Throws (mirroring `buildTransactionStatements`'s own convention for a caller bug) when
 * `charge` is not a refundable charge, `selection` is empty or names a duplicate line, or any
 * selected amount is outside `(0, line.amountCents]` -- a caller-side validation failure, never a
 * database write this function has no `db` to make anyway.
 *
 * `mode` derives from `charge.apiEligible` (Task 3's own eligibility rule: a live Stripe session
 * or payment intent this site's own checkout minted, never an imported MW row, a PayPal row, or a
 * check/cash row). The refund transaction's lines mirror the selected lines' own item and domain
 * reference, so the ledger's sum invariant (`buildTransactionStatements`) holds by construction
 * once a caller runs them. Each selected amount is capped at the line's own REMAINING balance
 * (`line.amountCents - line.refundedCents`, `money-store.ts`'s own per-line cumulative tracking),
 * never the line's original `amountCents` alone, so a second refund against an already-partially-
 * refunded line can never push the total past what was actually charged. A dues line unwinds the
 * membership only when this pick zeroes out its remaining balance -- a single-shot full refund or
 * the pick that completes a prior partial one -- the design doc's own "a partial dues refund
 * leaves the membership standing"; a class-fee or asset-fee line always unwinds, full or partial,
 * since there is no partial-seat or partial-fee concept to preserve.
 */
export function buildRefundPlan(charge: TimelineTransaction, selection: RefundLineSelection[]): RefundPlan {
  if (charge.kind !== 'charge') throw new Error(`refunds: transaction ${charge.id} is not a charge`);
  if (!charge.refundable) throw new Error(`refunds: charge ${charge.id} has already been fully refunded`);
  if (selection.length === 0) throw new Error('refunds: at least one line must be selected');

  const seenLineIds = new Set<string>();
  const picks: Array<{ line: TimelineLine; amountCents: number; remainingCents: number }> = [];
  for (const pick of selection) {
    if (seenLineIds.has(pick.lineId)) throw new Error(`refunds: line ${pick.lineId} selected more than once`);
    seenLineIds.add(pick.lineId);
    const line = findLine(charge, pick.lineId);
    const remainingCents = line.amountCents - line.refundedCents;
    if (pick.amountCents <= 0 || pick.amountCents > remainingCents) {
      throw new Error(`refunds: refund amount for "${line.description}" must be between 1 and ${remainingCents} cents`);
    }
    picks.push({ line, amountCents: pick.amountCents, remainingCents });
  }

  const refundAmountCents = picks.reduce((total, pick) => total + pick.amountCents, 0);

  const lines: TransactionLineInput[] = picks.map(({ line, amountCents }) => ({
    item: line.item,
    description: `Refund: ${line.description}`,
    amountCents,
    membershipId: line.membershipId,
    enrollmentId: line.enrollmentId,
    assignmentId: line.assignmentId,
  }));

  const unwinds: UnwindAction[] = [];
  for (const { line, amountCents, remainingCents } of picks) {
    if (line.item === 'dues' && line.membershipId && amountCents === remainingCents) {
      unwinds.push({ kind: 'membership-refunded', membershipId: line.membershipId });
    } else if (line.item === 'class-fee' && line.enrollmentId) {
      unwinds.push({ kind: 'drop-enrollment', enrollmentId: line.enrollmentId });
    } else if (line.item === 'asset-fee' && line.assignmentId) {
      unwinds.push({ kind: 'unflip-asset-fee', assignmentId: line.assignmentId });
    }
  }

  const header: TransactionHeader = {
    kind: 'refund',
    source: charge.source,
    occurredAt: toSqliteDatetime(new Date()),
    amountTotalCents: refundAmountCents,
    refundsTransactionId: charge.id,
    householdId: charge.householdId,
    payerName: charge.payerName,
    payerEmail: charge.payerEmail,
  };

  return { mode: charge.apiEligible ? 'api' : 'record-only', refundAmountCents, header, lines, unwinds };
}

/**
 * The domain-row reversal for one unwind, matching -- column for column -- the write each
 * original reconciler performs (this module's own header): `membership-refunded` sets
 * `refunded_at` (`manual-payment.ts`'s own reclaim path clears the identical column the other
 * way); `drop-enrollment` deletes the `class_enrollments` row outright, freeing the seat with no
 * automatic waitlist offer (the design doc's own ruling -- the classes screen's existing offer
 * machinery handles a freed seat deliberately); `unflip-asset-fee` clears `paid_at` on the most
 * recently paid `asset_payments` row for that assignment (`stripe-reconcile.ts`'s own
 * `reconcileAssetFee` is the only writer of that column, always exactly one row at a time via its
 * own `UNIQUE (assignment_id, season)` upsert, so "most recent" is the row this refund undoes).
 */
function buildUnwindStatements(db: D1Database, unwinds: UnwindAction[]): D1PreparedStatement[] {
  return unwinds.map((unwind) => {
    switch (unwind.kind) {
      case 'membership-refunded':
        return db.prepare("UPDATE memberships SET refunded_at = datetime('now') WHERE id = ?1").bind(unwind.membershipId);
      case 'drop-enrollment':
        return db.prepare('DELETE FROM class_enrollments WHERE id = ?1').bind(unwind.enrollmentId);
      case 'unflip-asset-fee':
        return db
          .prepare(
            `UPDATE asset_payments SET paid_at = NULL
             WHERE id = (SELECT id FROM asset_payments WHERE assignment_id = ?1 AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 1)`,
          )
          .bind(unwind.assignmentId);
    }
  });
}

export type ExecuteRefundResult = { ok: true; transactionId: string } | { ok: false; error: string };

/**
 * Execute a refund against `charge`: build the plan, and in API mode call
 * {@link issueStripeRefund} FIRST, writing nothing to `db` at all when Stripe refuses (the design
 * doc's own "a Stripe failure writes nothing"). Once Stripe succeeds (or the plan was
 * record-only to begin with), the ledger refund transaction and every unwind statement run in one
 * `db.batch()`, so a partial write can never happen on the database side either. A thrown
 * validation error from {@link buildRefundPlan} (a stale line id, an out-of-range amount) is
 * caught here and turned into the same `{ ok: false }` shape a Stripe refusal produces, so a
 * caller (the household desk's `?/refund` action) has one failure shape to handle.
 *
 * The API-mode Stripe call carries its own {@link buildRefundIdempotencyKey}-derived key, built
 * from `charge`'s own id, the sum of every one of `charge`'s lines' own `refundedCents` (the
 * charge's full refunded-so-far total, read BEFORE this attempt), and `selection` itself: the
 * same inputs on a retry (a double-click, or a retry after this call's own later `db.batch()`
 * failed) reproduce the identical key, so Stripe answers with the SAME refund object rather than
 * creating a second one (that function's own header states the self-healing property this buys).
 *
 * `memo` is the live-smoke marking convention (`docs/2026-07-15-payments-live-smoke-design.md`
 * section 4), optional and `null` by default: folded straight onto the refund transaction's own
 * `memo` column (`ledger.ts`'s own column, migration `0021_money_ledger`) when given, so the
 * smoke's refund row carries the same marking as its charge. Omitted, this is byte-identical to
 * before `memo` existed.
 */
export async function executeRefund(
  db: D1Database,
  env: CreateCheckoutEnv,
  charge: TimelineTransaction,
  selection: RefundLineSelection[],
  memo: string | null = null,
): Promise<ExecuteRefundResult> {
  let plan: RefundPlan;
  try {
    plan = buildRefundPlan(charge, selection);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not build the refund.' };
  }

  let header = memo ? { ...plan.header, memo } : plan.header;
  if (plan.mode === 'api') {
    if (!charge.processorRef) return { ok: false, error: 'This charge carries no processor reference to refund.' };
    const refundedSoFarCents = charge.lines.reduce((total, line) => total + line.refundedCents, 0);
    const idempotencyKey = await buildRefundIdempotencyKey(charge.id, refundedSoFarCents, selection);
    const refund = await issueStripeRefund(env, { processorRef: charge.processorRef, amountCents: plan.refundAmountCents, idempotencyKey });
    if (!refund.ok) return { ok: false, error: refund.error };
    header = { ...header, processorRef: refund.refundId };
  }

  const { id, statements: ledgerStatements } = buildTransactionStatements(db, header, plan.lines);
  await db.batch([...ledgerStatements, ...buildUnwindStatements(db, plan.unwinds)]);
  return { ok: true, transactionId: id };
}
