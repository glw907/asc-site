// The member portal landing's own "Recent receipts" list (mock D's own block name). One row per
// PAID charge transaction in the money ledger (`transactions`/`transaction_lines`, migration
// `0021_money_ledger`), never a per-line breakdown: a member paid one charge and expects to see
// one line matching what they were actually billed.
//
// Money lives in the ledger now (T1b, docs/plans/2026-07-16-portal-redesign.md). This module used
// to union `memberships.paid_at` with `asset_payments.paid_at`, on the premise that "every paid
// row already IS a receipt"; that premise went stale the day 0021 landed and every live write path
// (`stripe-reconcile.ts`, `refunds.ts`, `manual-payment.ts`) moved to recording money in the
// ledger instead, so the old union silently hid every class-fee and donation payment ever made (143
// and 5 live rows respectively, verified against `asc-club`). Do not resurrect that union: 217 of
// its `dues` lines overlap the ledger's own `dues` lines, so reading both back would double-count
// every membership payment.
//
// Scoped to `kind = 'charge'` (refunds join a later pass, per T1b's own ruling) and
// `amount_total_cents > 0` (a $0 comp charge moved no money, so it is not a receipt). `amountCents`
// is CENTS, the ledger's own native unit; the one consumer
// (`src/routes/(site)/my-account/+page.svelte`) divides by 100 before formatting, matching that
// file's own `assignment.feeCents / 100` precedent, rather than converting to dollars here and
// inventing a second unit convention for this module alone.
import type { D1Database } from '@cloudflare/workers-types';

export interface ReceiptRow {
  /** The transaction's own id: one row per transaction, never per line (see the header). */
  id: string;
  date: string;
  /** The charge's own display text: a single-line charge's line description verbatim, or every
   *  line's description joined with ", " for a bundled charge (the join flow's dues-plus-class-fees
   *  charge, `stripe-reconcile.ts`'s own `payJoinSession`) -- the ONE charge the member actually
   *  paid, composed from the same text their Stripe checkout line items already carried, never a
   *  fabricated summary. */
  what: string;
  amountCents: number;
}

interface ChargeRawRow {
  id: string;
  date: string;
  amount_cents: number;
}

interface ChargeLineRawRow {
  transaction_id: string;
  description: string;
  membership_season: number | null;
  class_name: string | null;
}

/** One line's own self-labeling display text: `transaction_lines.description` on its own is not
 *  self-labeling for every line a live household actually has (verified against `asc-club`, see
 *  the header) -- a dues line's stored text carries no season ("Membership dues", not "Membership
 *  dues 2026"), and a class-fee line's carries no class name at all ("Class fee" for every class a
 *  household's members ever took, several of them often the same amount and even the same charge
 *  date). `membership_season`/`class_name` come from the line's own `membership_id`/`enrollment_id`
 *  FKs (joined in the query below), the same data the deleted pre-ledger SQL used to fold into its
 *  own `what` text; a class line's real name replaces the generic stored text outright (the name
 *  alone already disambiguates), a dues line's season is appended to it. Neither FK set means
 *  the stored text already carries everything (an asset fee, a donation, a discount line). */
function lineLabel(line: ChargeLineRawRow): string {
  if (line.class_name !== null) return line.class_name;
  if (line.membership_season !== null) return `${line.description} (${line.membership_season})`;
  return line.description;
}

/** Every paid charge for a household's ledger, most recent first. Two set-based queries
 *  (transactions, then their lines), the same shape `money-store.ts`'s `getHouseholdTimeline` uses
 *  -- not reused directly here, since that read fetches every transaction kind (refund/void
 *  included) plus the full per-line refund breakdown a receipts list has no use for. */
export async function listReceipts(db: D1Database, householdId: string): Promise<ReceiptRow[]> {
  const { results: chargeRows } = await db
    .prepare(
      `SELECT t.id, t.occurred_at AS date, t.amount_total_cents AS amount_cents
       FROM transactions t
       WHERE t.household_id = ?1 AND t.kind = 'charge' AND t.amount_total_cents > 0
       ORDER BY t.occurred_at DESC`,
    )
    .bind(householdId)
    .all<ChargeRawRow>();

  if (chargeRows.length === 0) return [];

  const { results: lineRows } = await db
    .prepare(
      `SELECT tl.transaction_id, tl.description, m.season AS membership_season, c.name AS class_name
       FROM transaction_lines tl
       JOIN transactions t ON t.id = tl.transaction_id
       LEFT JOIN memberships m ON m.id = tl.membership_id
       LEFT JOIN class_enrollments ce ON ce.id = tl.enrollment_id
       LEFT JOIN classes c ON c.id = ce.class_id
       WHERE t.household_id = ?1 AND t.kind = 'charge' AND t.amount_total_cents > 0
       ORDER BY tl.rowid`,
    )
    .bind(householdId)
    .all<ChargeLineRawRow>();

  const descriptionsByTransaction = new Map<string, string[]>();
  for (const line of lineRows) {
    const list = descriptionsByTransaction.get(line.transaction_id) ?? [];
    list.push(lineLabel(line));
    descriptionsByTransaction.set(line.transaction_id, list);
  }

  return chargeRows.map((row) => ({
    id: row.id,
    date: row.date,
    what: (descriptionsByTransaction.get(row.id) ?? []).join(', '),
    amountCents: row.amount_cents,
  }));
}
