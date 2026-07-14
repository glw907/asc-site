// The write seam for the money ledger (`docs/2026-07-13-money-ledger-design.md`, migration
// `0021_money_ledger`): every money event the club records, live Stripe reconciliation or the MW
// history backfill alike, goes through `buildTransactionStatements`/`recordTransaction` rather than
// a caller hand-rolling its own INSERTs. Centralizing the write here is what lets the two invariants
// the spec names (lines sum to the header total; a line touches at most one domain row) be enforced
// once, at the seam, instead of trusted to every future caller.
//
// `buildTransactionStatements` returns prepared statements rather than executing them so a caller
// with its own domain write (a reconciler flipping `paid_at`) can fold both into one `db.batch()`
// call, the same atomicity `stripe-reconcile.ts`'s own header explains is NOT always taken (its
// reconcilers write sequentially instead, for reasons that module's header states); `recordTransaction`
// is the convenience path for a caller with no domain write of its own (donations, a future manual
// admin payment).
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

export type TransactionKind = 'charge' | 'refund' | 'void';
export type TransactionSource = 'stripe' | 'paypal' | 'check' | 'cash' | 'comp' | 'other';
export type LineItem = 'dues' | 'class-fee' | 'asset-fee' | 'donation' | 'discount' | 'other';

/** A `transactions` row. `id` is minted with `crypto.randomUUID()` when omitted; a caller mints
 *  its own (the donation reconciler's `refId`) so a Stripe retry collides on the primary key
 *  instead of double-inserting. */
export interface TransactionHeader {
  id?: string;
  kind: TransactionKind;
  source: TransactionSource;
  occurredAt: string;
  amountTotalCents: number;
  feeCents?: number | null;
  processorRef?: string | null;
  refundsTransactionId?: string | null;
  householdId?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  memo?: string | null;
  mwRef?: string | null;
}

/** One `transaction_lines` row. `amountCents` is signed within the transaction (discounts
 *  negative, everything else positive); at most one of the three domain references may be set,
 *  enforced by {@link buildTransactionStatements}. */
export interface TransactionLineInput {
  item: LineItem;
  description: string;
  amountCents: number;
  membershipId?: string | null;
  enrollmentId?: string | null;
  assignmentId?: string | null;
}

/** The spec's sum convention for later revenue math: a charge counts toward revenue at its full
 *  amount, a refund subtracts it, and a void -- money that would have moved but did not -- counts
 *  as neither. */
export function signedAmountCents(kind: TransactionKind, amountTotalCents: number): number {
  switch (kind) {
    case 'charge':
      return amountTotalCents;
    case 'refund':
      return -amountTotalCents;
    case 'void':
      return 0;
  }
}

function domainRefCount(line: TransactionLineInput): number {
  return [line.membershipId, line.enrollmentId, line.assignmentId].filter((ref) => ref != null).length;
}

/**
 * Build the statements for one transaction plus its lines, without executing them, so a caller
 * can fold them into its own `db.batch()` alongside a domain write. Throws when the lines do not
 * sum to `header.amountTotalCents` (voids included -- a void row still records what would have
 * moved) or when any line carries more than one domain reference; both are caller bugs the seam
 * refuses to write rather than silently accept.
 */
export function buildTransactionStatements(
  db: D1Database,
  header: TransactionHeader,
  lines: TransactionLineInput[],
): { id: string; statements: D1PreparedStatement[] } {
  const lineSum = lines.reduce((total, line) => total + line.amountCents, 0);
  if (lineSum !== header.amountTotalCents) {
    throw new Error(`ledger: lines sum to ${lineSum} cents but amountTotalCents is ${header.amountTotalCents}`);
  }
  const badLine = lines.find((line) => domainRefCount(line) > 1);
  if (badLine) {
    throw new Error(`ledger: line "${badLine.description}" references more than one domain row`);
  }

  const id = header.id ?? crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO transactions (
           id, kind, source, occurred_at, amount_total_cents, fee_cents, processor_ref,
           refunds_transaction_id, household_id, payer_name, payer_email, memo, mw_ref
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      )
      .bind(
        id,
        header.kind,
        header.source,
        header.occurredAt,
        header.amountTotalCents,
        header.feeCents ?? null,
        header.processorRef ?? null,
        header.refundsTransactionId ?? null,
        header.householdId ?? null,
        header.payerName ?? null,
        header.payerEmail ?? null,
        header.memo ?? null,
        header.mwRef ?? null,
      ),
    ...lines.map((line) =>
      db
        .prepare(
          `INSERT INTO transaction_lines (
             id, transaction_id, item, description, amount_cents, membership_id, enrollment_id, assignment_id
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          line.item,
          line.description,
          line.amountCents,
          line.membershipId ?? null,
          line.enrollmentId ?? null,
          line.assignmentId ?? null,
        ),
    ),
  ];
  return { id, statements };
}

/** Build and execute one transaction's statements via `db.batch()`, for a caller with no domain
 *  write of its own to fold them alongside. */
export async function recordTransaction(db: D1Database, header: TransactionHeader, lines: TransactionLineInput[]): Promise<string> {
  const { id, statements } = buildTransactionStatements(db, header, lines);
  await db.batch(statements);
  return id;
}
