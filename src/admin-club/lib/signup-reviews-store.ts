// The signup review queue's own live store (Task 8, docs/plans/2026-07-14-membership-admin.md):
// the queue keeps its designed post-hoc semantics (review is a background check, never a gate)
// but derives its pending rows live off `memberships` instead of a fixture-owned outcome field.
// A row is pending when a HOUSEHOLD's first-season membership (no earlier `season` row on that
// household, refunded or not: a household's very first join, historically) was created within
// the review window and carries no matching `signup_review_resolutions` row (migration 0023).
// `reconcileJoin` stays untouched by design: nothing here can un-activate a membership, and an
// unresolved join is exactly as active as a resolved one.
import type { D1Database } from '@cloudflare/workers-types';
import type { MembershipTier } from './member-types';
import { getTierPrices } from './club-settings';
import { toSqliteDatetime } from './offers';

/** How many days back the queue looks for a first-season membership, absent an override
 *  (`opts.windowDays`): the board's own review cadence, 2-3 days in practice, with slack for a
 *  slow week. */
export const SIGNUP_REVIEW_WINDOW_DAYS = 30;

/** One queue row: the evidence a reviewer needs beside the decision (who joined, their household,
 *  tier, what was actually paid, and the class credits that join granted), derived from the same
 *  membership/household/credit-grant facts every other Club screen reads, never a second copy of
 *  them. `id` is the underlying `memberships.id`, doubling as this review's own identity: a
 *  signup review is per-membership (one household's join), not per-member, and
 *  `resolveSignupReview` keys its resolution row on exactly this id. */
export interface SignupReviewRow {
  id: string;
  memberName: string;
  household: string;
  tier: MembershipTier;
  paidAmount: number;
  paidDate: string | null;
  creditGrant: number;
  submittedAt: string;
  flagNote: string | null;
}

interface PendingRawRow {
  membership_id: string;
  household_name: string;
  member_name: string | null;
  tier: string;
  price_paid: number;
  paid_at: string | null;
  submitted_at: string;
  credit_grant: number | null;
}

const PENDING_SIGNUP_REVIEWS_SQL = `
  SELECT m.id AS membership_id, h.name AS household_name, pm.name AS member_name,
         m.tier, m.price_paid, m.paid_at, m.created_at AS submitted_at,
         COALESCE(cg.total, 0) AS credit_grant
  FROM memberships m
  JOIN households h ON h.id = m.household_id
  LEFT JOIN members pm ON pm.id = h.primary_member_id
  LEFT JOIN (
    SELECT membership_id, SUM(credits) AS total FROM credit_grants GROUP BY membership_id
  ) cg ON cg.membership_id = m.id
  WHERE m.created_at >= ?1
    AND NOT EXISTS (
      SELECT 1 FROM memberships earlier
      WHERE earlier.household_id = m.household_id AND earlier.season < m.season
    )
    AND NOT EXISTS (
      SELECT 1 FROM signup_review_resolutions r WHERE r.membership_id = m.id
    )
  ORDER BY m.created_at ASC
`;

/** An automated rule's own note, the one this queue has always carried: a nonzero payment short
 *  of the published tier rate. A deliberate $0 comp is never flagged (it is a comp, not a
 *  shortfall); this reads settings' own live tier price, never a hardcoded one. */
function flagNoteFor(pricePaid: number, tierPrice: number): string | null {
  if (pricePaid <= 0 || pricePaid >= tierPrice) return null;
  return `Payment received ($${pricePaid}) is short of the published rate ($${tierPrice}).`;
}

/** Every unresolved signup review, oldest first (the order a review-inbox reads in): first-season
 *  memberships created within the window, minus anything already resolved. Two set-based queries
 *  (the grounding scan above, the settings' tier prices), never a per-row round trip. */
export async function pendingSignupReviews(
  db: D1Database,
  opts: { windowDays?: number } = {},
): Promise<SignupReviewRow[]> {
  const windowDays = opts.windowDays ?? SIGNUP_REVIEW_WINDOW_DAYS;
  const cutoff = toSqliteDatetime(new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000));

  const [{ results }, tierPrices] = await Promise.all([
    db.prepare(PENDING_SIGNUP_REVIEWS_SQL).bind(cutoff).all<PendingRawRow>(),
    getTierPrices(db),
  ]);

  return results.map((row) => {
    const tier = row.tier as MembershipTier;
    return {
      id: row.membership_id,
      memberName: row.member_name ?? row.household_name,
      household: row.household_name,
      tier,
      paidAmount: row.price_paid,
      paidDate: row.paid_at,
      creditGrant: row.credit_grant ?? 0,
      submittedAt: row.submitted_at,
      flagNote: flagNoteFor(row.price_paid, tierPrices[tier]),
    };
  });
}

export interface ResolveSignupReviewInput {
  membershipId: string;
  outcome: 'approved' | 'denied';
  note?: string;
  resolvedBy: string;
}

/** Persist a review's resolution: `approved` is the common, acknowledging no-op (no `note`);
 *  `denied` is the rare case the route's own form requires a reason for. Validation of that
 *  requirement lives in the route action (the same place it always has), not here: this module
 *  stays a thin write, matching `households-store.ts`'s and `money-store.ts`'s own no-validation
 *  boundary. */
export async function resolveSignupReview(db: D1Database, input: ResolveSignupReviewInput): Promise<void> {
  await db
    .prepare(
      'INSERT INTO signup_review_resolutions (id, membership_id, outcome, note, resolved_by) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(crypto.randomUUID(), input.membershipId, input.outcome, input.note ?? null, input.resolvedBy)
    .run();
}

/** How many reviews the board has resolved for `season` (matched through the resolved
 *  membership's own `season`), for the queue's own stats strip. */
export async function reviewedThisSeasonCount(db: D1Database, season: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM signup_review_resolutions r
       JOIN memberships m ON m.id = r.membership_id
       WHERE m.season = ?1`,
    )
    .bind(season)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
