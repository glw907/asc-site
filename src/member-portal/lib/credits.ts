// The portal's own real-D1 reads/writes against the credit ledger (0005_member_domain's
// `credit_grants`/`credit_redemptions`): grants minus redemptions, computed fresh, never stored
// (that migration's own header).
import type { D1Database } from '@cloudflare/workers-types';

/** A household's class-credit balance: total granted minus total redeemed. Deliberately does not
 *  check the household's standing: the published promise is that credits never expire, not even
 *  if the membership lapses (0005_member_domain's own header). Never negative in valid data. */
export async function getCreditBalance(db: D1Database, householdId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(credits), 0) FROM credit_grants WHERE household_id = ?1) -
         (SELECT COUNT(*) FROM credit_redemptions WHERE household_id = ?1) AS balance`,
    )
    .bind(householdId)
    .first<{ balance: number }>();
  return row?.balance ?? 0;
}

/** Record a credit spend against `enrollmentId`, attributing it to whoever redeemed it
 *  (`redeemedBy`: the acting member's own id, per this ledger's own `redeemed_by` column
 *  comment — "member id or admin email; audited either way"). The caller (classes.ts's
 *  `registerForClass`) is responsible for checking a positive balance first; this module trusts
 *  its caller the same way `assets-store.ts`'s writers trust theirs. */
export async function redeemCreditForEnrollment(
  db: D1Database,
  args: { householdId: string; enrollmentId: string; redeemedBy: string },
): Promise<void> {
  await db
    .prepare('INSERT INTO credit_redemptions (id, household_id, enrollment_id, redeemed_by) VALUES (?1, ?2, ?3, ?4)')
    .bind(crypto.randomUUID(), args.householdId, args.enrollmentId, args.redeemedBy)
    .run();
}

/** Whether `enrollmentId` redeemed a credit at all: `withdrawFromClass`'s own precondition read,
 *  so a withdrawal only ever reverses a credit that was actually spent. */
export async function findRedemptionForEnrollment(db: D1Database, enrollmentId: string): Promise<{ id: string } | null> {
  const row = await db
    .prepare('SELECT id FROM credit_redemptions WHERE enrollment_id = ?1 LIMIT 1')
    .bind(enrollmentId)
    .first<{ id: string }>();
  return row;
}

/**
 * Reverse a spent credit by appending a fresh grant (ledger discipline: never delete the
 * redemption row, the design doc's own withdrawal section) rather than deleting the
 * `credit_redemptions` row the original spend wrote. The reversing grant needs a `membership_id`
 * to attach to (`credit_grants.membership_id NOT NULL`, the joining purchase); this picks the
 * household's own most recent membership row (by `created_at`, any season, paid or not — a
 * household with any credit history necessarily has at least one), since the reversal is not
 * itself a new purchase and has no more specific membership to point at.
 */
export async function reverseCreditForWithdrawal(db: D1Database, householdId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const membership = await db
    .prepare('SELECT id FROM memberships WHERE household_id = ?1 ORDER BY created_at DESC LIMIT 1')
    .bind(householdId)
    .first<{ id: string }>();
  if (!membership) {
    return { ok: false, error: 'No membership on file to attach the reversing credit to.' };
  }
  await db
    .prepare('INSERT INTO credit_grants (id, household_id, membership_id, credits) VALUES (?1, ?2, ?3, 1)')
    .bind(crypto.randomUUID(), householdId, membership.id)
    .run();
  return { ok: true };
}
