// The public join door's own schema and handler logic, factored out of `join-apply.remote.ts`
// (a `.remote.ts` file may only export remote functions) the same way `class-signup-form.ts`
// factors `handleClassSignup` out of `class-signup.remote.ts`. This is the one thin entry the
// design doc names ("The join flow"): it owns turnstile verification, the household-lookup
// pivots, and the checkout construction, and delegates every rule the engine already owns
// (validation, pricing, the write batch) to `$member-signup/lib`, never re-deriving them here.
//
// Renew and welcome-back (`docs/2026-07-13-unified-signup-design.md`'s "Renew and welcome-back",
// amended 2026-07-14): a purchaser email matching a household that has paid a membership before
// never reaches the fresh-join engine (`$member-signup/lib`'s `buildJoinStatements` mints a NEW
// household, which is wrong here), and it never reaches an unauthenticated renewal form either.
// The security review that produced the amendment found the original welcome-back form let an
// anonymous visitor who knew a member's email write into that household before any payment (add
// members, enroll real members, consume class capacity) and read back the full roster, including
// minors' names. This module now answers that case with a magic-link handoff instead: it sends
// the member's own portal sign-in link (`requestMemberLink`, the enumeration-safe seam
// `/my-account`'s own sign-in form already uses) and returns no household data of any kind. The
// portal owns every household-scoped read and write from here; renewing stays one email away from
// this door. An email match on a household that has NEVER paid (an abandoned first join) still
// resumes as a same-transaction retry ({@link retryUnpaidJoin}), since that household has no
// history to protect.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { validateJoinInput } from '$member-signup/lib/validate.js';
import { computeJoinPricing } from '$member-signup/lib/pricing.js';
import { buildJoinStatements } from '$member-signup/lib/statements.js';
import type { JoinInput } from '$member-signup/lib/types.js';
import type { MembershipTier } from '$admin-club/lib/member-types';
import { getClassWithCounts, isPubliclyOpen } from '$admin-club/lib/classes-store';
import { hasActiveOfferForClass } from '$admin-club/lib/offers';
import { getCurrentSeason, getTierPrices, getWaiverTextVersion } from '$admin-club/lib/club-settings';
import { normalizeEmail } from '$admin-club/lib/member-normalize.js';
import { MEMBERSHIP_TIER_LABEL, getMemberStanding } from '$member-auth/lib/standing';
import { requestMemberLink } from '$member-auth/lib/auth';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv, type CreateCheckoutResult } from '$admin-club/lib/payments';
import { siteConfig } from '$theme/cairn.config';
import { verifyTurnstile } from './turnstile';

/** The site's established from-address, matching `/my-account`'s own `+page.server.ts` copy of
 *  the same constant (kept as this module's own copy for the same reason that file gives: the
 *  join door's send path should not depend on another route's module). */
const FROM_ADDRESS = 'noreply@aksailingclub.org';

const memberSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Household member name is required.')),
  birthdate: v.optional(v.pipe(v.string(), v.trim()), ''),
  email: v.optional(v.pipe(v.string(), v.trim()), ''),
});

/** `MembershipTier`'s own three values, matching `classes-store.ts`'s own `CLASS_TRACKS`
 *  precedent for pairing a plain literal array (`v.picklist`'s input) with the type it must stay
 *  in lockstep with. */
const MEMBERSHIP_TIERS: readonly MembershipTier[] = ['individual', 'family', 'young-adult'];

export const joinApplySchema = v.object({
  tier: v.picklist(MEMBERSHIP_TIERS, 'Please choose a membership tier.'),
  purchaserName: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your name.')),
  purchaserEmail: v.pipe(v.string(), v.trim(), v.email('Please enter a valid email address.')),
  purchaserPhone: v.optional(v.pipe(v.string(), v.trim()), ''),
  purchaserBirthdate: v.optional(v.pipe(v.string(), v.trim()), ''),
  /** Additional household members, family tier only (`validateJoinInput` rejects a non-empty
   *  array for the other two tiers). */
  members: v.optional(v.array(memberSchema), []),
  /** One entry per roster slot: the purchaser at `0`, `members[i]` at `i + 1`. `''` means "no
   *  class" for that slot. */
  picks: v.optional(v.array(v.pipe(v.string(), v.trim())), []),
  waiverAccepted: v.optional(v.boolean(), false),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export type JoinApplySubmission = v.InferOutput<typeof joinApplySchema>;

/** The renew-and-welcome-back pivot (amended 2026-07-14): a purchaser email matching a household
 *  that has paid a membership before, at least once. Carries no household data of any kind (the
 *  security fix this amendment made): {@link handleJoinApply} sends the member's own portal
 *  sign-in link server-side and the page renders a quiet "check your email" confirmation from
 *  this pivot alone. */
export interface JoinRenewalLinkSentPivot {
  pivot: 'renewal-link-sent';
}

/** The rare edge case a member row exists with no membership row behind it at all, paid or
 *  unpaid (nothing to reuse and no paid history to welcome back into): the pre-existing dead
 *  end, kept only for this one case. */
export interface JoinEmailInUsePivot {
  pivot: 'email-in-use';
}

export type JoinApplyResult = CreateCheckoutResult | JoinRenewalLinkSentPivot | JoinEmailInUsePivot;

interface JoinApplyEnv extends CreateCheckoutEnv {
  CLUB_DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL?: EmailBindingEnv['EMAIL'];
}

function toJoinInput(input: JoinApplySubmission): JoinInput {
  return {
    tier: input.tier,
    purchaser: {
      name: input.purchaserName,
      email: input.purchaserEmail,
      phone: input.purchaserPhone || undefined,
      birthdate: input.purchaserBirthdate || undefined,
    },
    members: input.members.map((member) => ({
      name: member.name,
      birthdate: member.birthdate || undefined,
      email: member.email || undefined,
    })),
    classPicks: input.picks
      .map((classId, memberIndex) => (classId ? { memberIndex, classId } : null))
      .filter((pick): pick is { memberIndex: number; classId: string } => pick !== null),
    waiverAccepted: input.waiverAccepted,
  };
}

/** Today as a calendar date in the club's own timezone, matching `class-schedule.remote.ts`'s own
 *  helper: a Worker's clock is UTC, and the young-adult age gate must read the same civil date a
 *  member would read locally. */
function anchorageTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Anchorage' }).format(new Date());
}

interface MemberLookupRow {
  id: string;
  household_id: string;
}

async function findMemberByEmail(db: D1Database, email: string): Promise<MemberLookupRow | null> {
  return db.prepare('SELECT id, household_id FROM members WHERE email = ?1 LIMIT 1').bind(email).first<MemberLookupRow>();
}

interface UnpaidMembershipRow {
  id: string;
}

async function findUnpaidMembershipForSeason(db: D1Database, householdId: string, season: number): Promise<UnpaidMembershipRow | null> {
  return db
    .prepare('SELECT id FROM memberships WHERE household_id = ?1 AND season = ?2 AND paid_at IS NULL LIMIT 1')
    .bind(householdId, season)
    .first<UnpaidMembershipRow>();
}

/**
 * Reuse an abandoned join's still-unpaid membership row (the design's own "duplicate protection":
 * a checkout abandoned after submit leaves the unpaid row in place, and a retry reuses it instead
 * of failing the `UNIQUE(household_id, season)` constraint). This path is reached only for a
 * household that has NEVER paid a membership (see {@link handleJoinApply}): a real returning
 * member instead gets the magic-link handoff ({@link JoinRenewalLinkSentPivot}).
 */
async function retryUnpaidJoin(
  db: D1Database,
  env: JoinApplyEnv,
  origin: string,
  membershipId: string,
  purchaserMemberId: string,
  tier: MembershipTier,
): Promise<CreateCheckoutResult> {
  const prices = await getTierPrices(db);
  const duesCents = Math.round(prices[tier] * 100);
  const priceDollars = Math.round(duesCents / 100);

  await db.prepare('UPDATE memberships SET tier = ?1, price_paid = ?2 WHERE id = ?3').bind(tier, priceDollars, membershipId).run();
  await db
    .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind('public:join', 'retry', 'membership', membershipId, `tier=${tier}`)
    .run();

  return createJoinCheckout(env, origin, {
    refId: membershipId,
    tier,
    duesCents,
    paidLines: [],
    enrollmentIds: [],
    coveredEnrollmentIds: [],
    purchaserMemberId,
    grantCredits: true,
  });
}

interface JoinCheckoutPlan {
  refId: string;
  tier: MembershipTier;
  duesCents: number;
  paidLines: Array<{ amountCents: number; name: string }>;
  enrollmentIds: string[];
  coveredEnrollmentIds: string[];
  purchaserMemberId: string;
  /** The design's own ruling: credits ride a household's FIRST membership only. Both of this
   *  module's own checkout callers (a fresh join and the retry of an abandoned one) grant them;
   *  a renewal never reaches this checkout builder at all now (the magic-link handoff hands
   *  renewals to the portal's own `dues` checkout instead, `docs/2026-07-13-unified-signup-
   *  design.md`'s "Renew and welcome-back"). */
  grantCredits: boolean;
}

async function createJoinCheckout(env: JoinApplyEnv, origin: string, plan: JoinCheckoutPlan): Promise<CreateCheckoutResult> {
  const tierLabel = MEMBERSHIP_TIER_LABEL[plan.tier];
  const lines = [{ amountCents: plan.duesCents, name: `${tierLabel} Membership dues` }, ...plan.paidLines];
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);

  try {
    return await createCheckout(env, {
      kind: 'join',
      refId: plan.refId,
      amountCents: totalCents,
      description: `${tierLabel} Membership`,
      origin,
      successPath: '/payment/confirmation/',
      cancelPath: '/join/apply/',
      lines,
      metadata: {
        enrollment_ids: plan.enrollmentIds.join(','),
        covered_enrollment_ids: plan.coveredEnrollmentIds.join(','),
        grant_credits: plan.grantCredits ? '1' : '0',
        purchaser_member_id: plan.purchaserMemberId,
        // `reconcileJoin`'s own snapshotted-cents contract (`stripe-reconcile.ts`'s own header):
        // the dues line and each paid enrollment's own class-fee line are built from these
        // values at reconcile time, never a re-read of `classes.fee`/`price_paid`, so a settings
        // or fee change between checkout and webhook delivery can never desync the ledger from
        // what Stripe actually charged. `paid_fee_cents` is aligned one-to-one with the paid
        // (uncovered) subset of `enrollment_ids`, in that same order -- true by construction
        // here, since `plan.paidLines` is built from the identical pick order `plan.enrollmentIds`
        // itself came from.
        dues_cents: String(plan.duesCents),
        paid_fee_cents: plan.paidLines.map((line) => line.amountCents).join(','),
      },
    });
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) invalid(err.message);
    throw err;
  }
}

interface ClassFacts {
  name: string;
  fee: number;
  isFull: boolean;
}

/** Live class facts (name, fee, current fullness) for every distinct class id a submission
 *  picked, refusing the whole submission if any pick names an unknown or hidden class. */
async function loadPickedClassFacts(db: D1Database, classIds: string[]): Promise<Map<string, ClassFacts>> {
  const facts = new Map<string, ClassFacts>();
  for (const id of new Set(classIds)) {
    const cls = await getClassWithCounts(db, id);
    if (!cls || !cls.visible) invalid('One of the selected classes is no longer available.');
    const open = isPubliclyOpen(cls, await hasActiveOfferForClass(db, id));
    facts.set(id, { name: cls.name, fee: cls.fee, isFull: !open });
  }
  return facts;
}

/**
 * The public join door's own action: reuses `$member-signup/lib`'s engine for every rule and
 * pricing decision on a fresh join, and owns only what is specific to a live submission:
 * turnstile, the household-lookup pivots, the live class facts a submission's picks need, and the
 * checkout itself.
 *
 * The household lookup runs FIRST, ahead of the engine's own `validateJoinInput`: a purchaser
 * email that resolves to a member whose household has paid a membership before, ever, never
 * reaches the fresh-join engine at all (its own roster/validation rules do not fit a renewal),
 * and never reaches an unauthenticated write path either (this module's own header explains why).
 * It gets the magic-link handoff instead: {@link requestMemberLink} sends the sign-in link
 * server-side, and this function answers with {@link JoinRenewalLinkSentPivot}, which carries no
 * household data at all.
 */
export async function handleJoinApply(input: JoinApplySubmission, env: unknown, clientAddress: string, origin: string): Promise<JoinApplyResult> {
  const platformEnv = env as JoinApplyEnv | undefined;

  const secret = platformEnv?.TURNSTILE_SECRET_KEY;
  const token = input['cf-turnstile-response'];
  if (secret && !(await verifyTurnstile(token, clientAddress, secret))) {
    invalid('Spam check failed. Please try again.');
  }

  const db = platformEnv?.CLUB_DB;
  if (!db) invalid('Joining online is not available right now. You can email board@aksailingclub.org instead.');

  const claimedEmail = normalizeEmail(input.purchaserEmail);
  const known = await findMemberByEmail(db, claimedEmail);
  if (known) {
    const standing = await getMemberStanding(db, known.id);
    if (standing && standing.tier !== null) {
      const email = platformEnv?.EMAIL;
      if (email) {
        await requestMemberLink(db, claimedEmail, (message) => email.send(message), {
          origin,
          siteName: siteConfig.siteName,
          from: FROM_ADDRESS,
        });
      }
      return { pivot: 'renewal-link-sent' };
    }

    const season = await getCurrentSeason(db);
    const unpaid = await findUnpaidMembershipForSeason(db, known.household_id, season);
    if (unpaid) return retryUnpaidJoin(db, platformEnv!, origin, unpaid.id, known.id, input.tier);

    // A member row with no membership row at all (paid or unpaid) yet: nothing to reuse and no
    // paid history to send a renewal link for. Treated as a pivot rather than minting a second
    // household for the same email, which `members.email UNIQUE` would refuse anyway.
    return { pivot: 'email-in-use' };
  }

  const joinInput = toJoinInput(input);
  const validation = validateJoinInput(joinInput, { today: anchorageTodayIso() });
  if (!validation.valid) invalid(...validation.errors);
  const validated = validation.normalized!;

  const classFacts = await loadPickedClassFacts(
    db,
    validated.classPicks.map((pick) => pick.classId),
  );
  const fullClassIds = new Set([...classFacts.entries()].filter(([, facts]) => facts.isFull).map(([id]) => id));
  const nonFullPicks = validated.classPicks.filter((pick) => !fullClassIds.has(pick.classId));

  const prices = await getTierPrices(db);
  const classFees = new Map([...classFacts.entries()].map(([id, facts]) => [id, facts.fee]));
  const pricing = computeJoinPricing({ ...validated, classPicks: nonFullPicks }, prices, classFees);

  const season = await getCurrentSeason(db);
  const waiverVersion = await getWaiverTextVersion(db);
  const built = await buildJoinStatements(db, validated, pricing, { season, waiverVersion, fullClassIds });
  await db.batch(built.statements);

  const paidLines = pricing.paidPicks.map((pick) => {
    const classId = nonFullPicks[pick.pickIndex].classId;
    const name = classFacts.get(classId)?.name ?? 'Class';
    return { amountCents: pick.amountCents, name: `${name} class fee` };
  });
  const coveredEnrollmentIds = pricing.coveredPicks.map((pickIndex) => built.enrollmentIds[pickIndex]);

  return createJoinCheckout(platformEnv!, origin, {
    refId: built.membershipId,
    tier: validated.tier,
    duesCents: pricing.duesCents,
    paidLines,
    enrollmentIds: built.enrollmentIds,
    coveredEnrollmentIds,
    purchaserMemberId: built.purchaserMemberId,
    grantCredits: true,
  });
}
