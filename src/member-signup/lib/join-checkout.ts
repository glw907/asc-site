// The join flow's ONE shared checkout builder (member-waivers T5c, the money-critical piece,
// docs/2026-07-17-member-waivers-design.md ratified decision 7's amendment): the single place
// that turns a household's PERSISTED, unpaid join application into a Stripe `join`-kind checkout
// with the exact metadata `reconcileJoin` (`$admin-club/lib/stripe-reconcile.ts`) reads back.
//
// The design's household-complete gate means a family join's payment moment can arrive later than
// its application (the purchaser submits, then every member authenticates and signs, then payment
// unlocks). So the checkout is NOT always built at submit: a signature-complete household (the
// no-published-documents state, or a solo purchaser who just signed) builds it immediately from
// the in-memory statements; a signature-incomplete household persists its rows storing NOTHING
// money-derived, and rebuilds the checkout at unlock from those same rows, at then-current prices,
// through the SAME {@link buildJoinCheckoutArgs} below. `reconcileJoin` must behave identically
// whichever moment built it, so both moments funnel through this one pure function: the fresh path
// constructs {@link PersistedJoinApplication} in memory, the resume path reconstructs the
// byte-identical shape from the persisted rows ({@link loadJoinApplication}), and neither the
// covered-vs-paid credit split nor the snapshotted cents can drift between the two.
import type { D1Database } from '@cloudflare/workers-types';
import type { MembershipTier } from '$admin-club/lib/member-types';
import type { CreateCheckoutArgs } from '$admin-club/lib/payments';
import { CREDIT_GRANT_AMOUNT } from './pricing.js';

/** Local duplicate of `$member-auth/lib/standing.ts`'s `MEMBERSHIP_TIER_LABEL`, the same
 *  deliberate independence `stripe-reconcile.ts`'s own `TIER_LABEL` already documents: this pure
 *  engine module (`member-signup/lib`) never imports `member-auth`, and the three-entry map costs
 *  nothing to keep in sync by hand. The label rides only the checkout's own line-item display
 *  names, never `reconcileJoin`'s metadata (which re-derives its own), so a drift here would show
 *  on the Stripe page but could never desync the ledger. */
const TIER_LABEL: Record<MembershipTier, string> = {
  individual: 'Individual',
  family: 'Family',
  'young-adult': 'Young Adult',
};

/** One enrollment of a persisted join application, in the pick order credits apply against: its
 *  own id (the `enrollment_ids` metadata), its class's display name (the checkout line, never the
 *  metadata), and its class fee in cents (the `paid_fee_cents` metadata for a paid line). */
export interface PersistedJoinEnrollment {
  enrollmentId: string;
  className: string;
  feeCents: number;
}

/** A household's persisted, unpaid join application, normalized to exactly what the checkout
 *  needs: the membership row this checkout pays for, the tier and the purchaser (the primary),
 *  whether this checkout grants class credits (a fresh join always does; a renewal never reaches
 *  this builder), the dues line in cents at build time, and every non-full class pick's enrollment
 *  in pick order. Built two ways from the SAME rows -- in memory at submit, from the database at
 *  the payment-resume unlock -- and both must yield byte-identical {@link buildJoinCheckoutArgs}
 *  metadata. */
export interface PersistedJoinApplication {
  membershipId: string;
  tier: MembershipTier;
  purchaserMemberId: string;
  grantCredits: boolean;
  duesCents: number;
  enrollments: PersistedJoinEnrollment[];
}

/**
 * Build the `createCheckout` arguments for a persisted join application (member-waivers T5c). Pure:
 * no database, no clock, no I/O, so both the submit-time and the resume-time callers share one
 * source of truth for the `join`-kind metadata `reconcileJoin` reads. Credits apply in pick order
 * exactly as `computeJoinPricing` applies them (the first `CREDIT_GRANT_AMOUNT[tier]` enrollments
 * are covered, the rest are paid), so `covered_enrollment_ids` and `paid_fee_cents` align to
 * `enrollment_ids` the same way whichever moment built the checkout.
 *
 * `cancelPath` differs by caller (the public door returns to `/join/apply/`, the authenticated
 * resume door to the portal) and never rides `reconcileJoin`'s metadata, so it is a plain
 * parameter with the public-door default.
 */
export function buildJoinCheckoutArgs(app: PersistedJoinApplication, origin: string, cancelPath = '/join/apply/'): CreateCheckoutArgs {
  const tierLabel = TIER_LABEL[app.tier];
  const coveredCount = Math.min(CREDIT_GRANT_AMOUNT[app.tier], app.enrollments.length);
  const covered = app.enrollments.slice(0, coveredCount);
  const paid = app.enrollments.slice(coveredCount);

  const lines = [
    { amountCents: app.duesCents, name: `${tierLabel} Membership dues` },
    ...paid.map((enrollment) => ({ amountCents: enrollment.feeCents, name: `${enrollment.className} class fee` })),
  ];
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);

  return {
    kind: 'join',
    refId: app.membershipId,
    amountCents: totalCents,
    description: `${tierLabel} Membership`,
    origin,
    successPath: '/payment/confirmation/',
    cancelPath,
    lines,
    metadata: {
      // The snapshotted-cents contract `reconcileJoin` and `stripe-reconcile.ts`'s own header
      // require: every value here is captured at build time, so a settings or class-fee change
      // between checkout and webhook delivery can never desync the ledger from what Stripe
      // charged. `paid_fee_cents` aligns one-to-one with the paid (uncovered) subset of
      // `enrollment_ids`, in that same order -- true by construction, since `paid` is a slice of
      // the ordered `enrollments`.
      enrollment_ids: app.enrollments.map((enrollment) => enrollment.enrollmentId).join(','),
      covered_enrollment_ids: covered.map((enrollment) => enrollment.enrollmentId).join(','),
      grant_credits: app.grantCredits ? '1' : '0',
      purchaser_member_id: app.purchaserMemberId,
      dues_cents: String(app.duesCents),
      paid_fee_cents: paid.map((enrollment) => enrollment.feeCents).join(','),
    },
  };
}

interface JoinMembershipRow {
  id: string;
  household_id: string;
  tier: MembershipTier;
  paid_at: string | null;
}

interface JoinEnrollmentRow {
  id: string;
  class_name: string;
  fee: number;
}

interface HouseholdPrimaryRow {
  primary_member_id: string | null;
}

/**
 * Reconstruct a household's {@link PersistedJoinApplication} from its persisted rows at the
 * payment-resume unlock (member-waivers T5c). Reads the unpaid membership (`null` when it is
 * missing or already paid -- nothing to resume), its household's primary member (the purchaser),
 * and every still-unpaid class enrollment of that household's members in insertion (pick) order,
 * each with its class's live name and fee. `tierPrices` is the caller's own current settings read
 * (`getTierPrices`), so dues re-price at then-current rates; a class fee is read live off the join
 * too, so the whole checkout reflects prices at unlock, not at the abandoned submit.
 *
 * The enrollment set is every `fee_paid = 0` enrollment of the household's members: a brand-new
 * joining household has no other enrollments, and nothing flips `fee_paid` until this very payment
 * settles, so this is exactly the join's own picks. Ordered by `rowid` (insertion order), which is
 * the pick order `buildJoinStatements` wrote them in, so credits cover the same picks the submit
 * moment would have.
 */
export async function loadJoinApplication(
  db: D1Database,
  membershipId: string,
  tierPrices: Record<MembershipTier, number>,
): Promise<PersistedJoinApplication | null> {
  const membership = await db
    .prepare('SELECT id, household_id, tier, paid_at FROM memberships WHERE id = ?1')
    .bind(membershipId)
    .first<JoinMembershipRow>();
  if (!membership || membership.paid_at !== null) return null;

  const household = await db
    .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
    .bind(membership.household_id)
    .first<HouseholdPrimaryRow>();
  const purchaserMemberId = household?.primary_member_id ?? '';

  const { results: enrollmentRows } = await db
    .prepare(
      `SELECT ce.id AS id, c.name AS class_name, c.fee AS fee
       FROM class_enrollments ce
       JOIN classes c ON c.id = ce.class_id
       JOIN members m ON m.id = ce.member_id
       WHERE m.household_id = ?1 AND ce.fee_paid = 0
       ORDER BY ce.rowid`,
    )
    .bind(membership.household_id)
    .all<JoinEnrollmentRow>();

  const enrollments: PersistedJoinEnrollment[] = enrollmentRows.map((row) => ({
    enrollmentId: row.id,
    className: row.class_name,
    feeCents: Math.round(row.fee * 100),
  }));

  return {
    membershipId: membership.id,
    tier: membership.tier,
    purchaserMemberId,
    grantCredits: true,
    duesCents: Math.round(tierPrices[membership.tier] * 100),
    enrollments,
  };
}
