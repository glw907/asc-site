// The portal landing's own receipts stub list (design doc's own "Receipts live as a short list
// at the foot (date, what, amount, view/print)"; the open items section's own drafted default,
// "in-portal receipts... list minimal", stands unobjected). Reads two already-real sources
// (`memberships.paid_at`, `asset_payments.paid_at`) rather than a new receipts table: every paid
// row already IS a receipt, so this module only ever unions and formats, never stores anything
// new. "View/print" (a per-receipt detail or PDF) is not built: the design doc's own scope names
// only the list, and nothing downstream in this task's own scope depends on a receipt detail
// view existing yet.
import type { D1Database } from '@cloudflare/workers-types';

export interface ReceiptRow {
  id: string;
  date: string;
  what: string;
  amount: number;
}

/** Every paid membership dues and asset-fee row for a household, most recent first. */
export async function listReceipts(db: D1Database, householdId: string): Promise<ReceiptRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, paid_at AS date, 'Membership dues (' || season || ')' AS what, price_paid AS amount
       FROM memberships WHERE household_id = ?1 AND paid_at IS NOT NULL
       UNION ALL
       SELECT ap.id, ap.paid_at AS date, at.name || ' (' || ap.season || ')' AS what, ap.amount
       FROM asset_payments ap
       JOIN asset_assignments aa ON aa.id = ap.assignment_id
       JOIN memberships m ON m.id = aa.membership_id
       JOIN asset_types at ON at.id = aa.asset_type
       WHERE m.household_id = ?1 AND ap.paid_at IS NOT NULL
       ORDER BY date DESC`,
    )
    .bind(householdId)
    .all<{ id: string; date: string; what: string; amount: number }>();
  return results;
}
