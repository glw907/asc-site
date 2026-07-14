// The portal's own renew-card write path (Task 6, `docs/2026-07-13-unified-signup-design.md`'s
// "Renew and welcome-back", the authenticated half): mint or reuse the household's next
// unclaimed season's unpaid `memberships` row at a chosen tier and the CURRENT settings price,
// then hand it to a plain `dues` checkout. This duplicates `$theme/join-apply-form.ts`'s own
// "next unclaimed season" rule (`nextUnclaimedSeason`/`findUnpaidMembershipForSeason`) rather
// than importing it: that module lives under `$theme`, the join door's own route-layer file, and
// this task's own scope is `my-account/**` and `member-portal/lib/` only (matching the prior
// welcome-back task's own precedent for keeping a small route-adjacent helper local instead of
// reaching across a route boundary for it).
import type { D1Database } from '@cloudflare/workers-types';
import type { MembershipTier } from '$member-auth/lib/standing';

interface ReclaimableMembershipRow {
  id: string;
}

/** The season's own `memberships` row to reclaim rather than insert a fresh one, when one exists:
 *  an abandoned unpaid row from a prior retry (`paid_at IS NULL`, this module's own prior
 *  behavior), OR a refunded row (`refunded_at IS NOT NULL`) -- migration 0023's own reclaim rule,
 *  the same one `manual-payment.ts`'s admin-side reclaim already applies, kept consistent here
 *  (docs/plans/2026-07-14-membership-admin.md's own "Interactions with unified-signup" gap). A
 *  NON-refunded, ALREADY-PAID row for this season never reaches this query at all: `season` is
 *  always {@link nextUnclaimedRenewalSeason}'s own answer, which already skips past any season a
 *  paid, non-refunded row already claims. */
async function findReclaimableMembershipForSeason(db: D1Database, householdId: string, season: number): Promise<ReclaimableMembershipRow | null> {
  return db
    .prepare('SELECT id FROM memberships WHERE household_id = ?1 AND season = ?2 AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1')
    .bind(householdId, season)
    .first<ReclaimableMembershipRow>();
}

/** Whether `householdId` already has a non-refunded PAID `memberships` row for `season`: the
 *  season-assignment loop's own stopping condition (see {@link nextUnclaimedRenewalSeason}). Carries
 *  `AND refunded_at IS NULL` (migration 0023, `docs/plans/2026-07-14-membership-admin.md` Task 2)
 *  so a refunded season reads as unclaimed, matching `standing.ts`'s own refund-aware queries: a
 *  household whose only row for a season was refunded can renew straight back into that same
 *  season. */
async function hasPaidMembershipForSeason(db: D1Database, householdId: string, season: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM memberships WHERE household_id = ?1 AND season = ?2 AND paid_at IS NOT NULL AND refunded_at IS NULL LIMIT 1')
    .bind(householdId, season)
    .first<{ found: number }>();
  return row !== null;
}

/**
 * The next season at or after `currentSeason` the household has not already paid for: `currentSeason`
 * itself, unless it is already paid, in which case the following season, and so on. Bounded at
 * ten seasons ahead purely as a defensive ceiling; a real household is never pre-paid that far
 * out. Mirrors `$theme/join-apply-form.ts`'s own `nextUnclaimedSeason` rule for the public
 * welcome-back door; this is the portal renew card's own copy.
 */
export async function nextUnclaimedRenewalSeason(db: D1Database, householdId: string, currentSeason: number): Promise<number> {
  let season = currentSeason;
  for (let guard = 0; guard < 10 && (await hasPaidMembershipForSeason(db, householdId, season)); guard += 1) {
    season += 1;
  }
  return season;
}

/** The unpaid `memberships` row a renew confirmation just minted or reused, and the season it
 *  landed on (the next unclaimed one, which the caller needs to build the checkout's own
 *  description). */
export interface RenewalMembership {
  membershipId: string;
  season: number;
}

/**
 * Mint or reuse the household's next unclaimed season's unpaid `memberships` row at `tier`,
 * priced from `priceDollars` (the caller's own current-settings read, never re-read here so the
 * price a member saw on the card is the price charged). A retry after an abandoned checkout
 * reuses the same still-unpaid row instead of failing the `UNIQUE(household_id, season)`
 * constraint (the join flow's own "duplicate protection" rule); renewing a season whose only row
 * was refunded reclaims that SAME row the identical way, resetting it back to the unpaid state
 * ({@link findReclaimableMembershipForSeason}'s own header) so the checkout this call sets up for
 * gives the webhook (`stripe-reconcile.ts`'s `reconcileDues`, guarded on `paid_at IS NULL`) a row
 * ready to flip paid again, rather than inserting a second row and hitting the constraint the
 * refunded row itself still occupies. Both cases update the tier/price in place when the member
 * changed their mind between attempts. Audits as `member:<memberId>`.
 */
export async function mintOrReuseRenewalMembership(
  db: D1Database,
  householdId: string,
  memberId: string,
  tier: MembershipTier,
  priceDollars: number,
  currentSeason: number,
): Promise<RenewalMembership> {
  const season = await nextUnclaimedRenewalSeason(db, householdId, currentSeason);
  const reclaimable = await findReclaimableMembershipForSeason(db, householdId, season);
  const membershipId = reclaimable?.id ?? crypto.randomUUID();

  if (reclaimable) {
    await db
      .prepare('UPDATE memberships SET tier = ?1, price_paid = ?2, paid_at = NULL, refunded_at = NULL, stripe_ref = NULL WHERE id = ?3')
      .bind(tier, priceDollars, membershipId)
      .run();
  } else {
    await db
      .prepare('INSERT INTO memberships (id, household_id, season, tier, price_paid) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(membershipId, householdId, season, tier, priceDollars)
      .run();
  }
  await db
    .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(`member:${memberId}`, reclaimable ? 'renew.reuse' : 'renew.mint', 'membership', membershipId, `tier=${tier} season=${season}`)
    .run();

  return { membershipId, season };
}
