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
import type { D1Database, RateLimit } from '@cloudflare/workers-types';
import { validateJoinInput } from '$member-signup/lib/validate.js';
import { computeJoinPricing } from '$member-signup/lib/pricing.js';
import { buildJoinStatements } from '$member-signup/lib/statements.js';
import { buildJoinCheckoutArgs, type PersistedJoinApplication } from '$member-signup/lib/join-checkout.js';
import type { JoinInput } from '$member-signup/lib/types.js';
import type { MembershipTier } from '$admin-club/lib/member-types';
import { getClassWithCounts, isPubliclyOpen } from '$admin-club/lib/classes-store';
import { hasActiveOfferForClass } from '$admin-club/lib/offers';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';
import { normalizeEmail } from '$admin-club/lib/member-normalize.js';
import { getMemberStanding } from '$member-auth/lib/standing';
import { requestMemberLink } from '$member-auth/lib/auth';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv, type CreateCheckoutResult } from '$admin-club/lib/payments';
import { documents } from '$chassis/content';
import { loadPublishedDocuments } from '$theme/documents';
import {
  deriveHouseholdRequirements,
  loadHouseholdRequirements,
  type HouseholdMemberInput,
} from '$member-portal/lib/waiver-requirements';
import { householdSignatureGate } from '$member-portal/lib/household-signature-gate';
import { siteConfig } from '$theme/cairn.config';
import { verifyTurnstile } from './turnstile';
import { checkRateLimitKeys, RATE_LIMIT_MESSAGE } from './rate-limit';

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

/** The household-complete gate's own submit-time outcome (member-waivers T5c, spec rule 7's
 *  amendment): the application's rows are persisted UNPAID, but a signable document applies, so no
 *  checkout is created and nothing money-derived is stored. The purchaser has been sent their own
 *  sign-in link deep-linking straight to the signing moment (`/my-account/sign?context=join`);
 *  once every household member has signed, the SAME shared builder rebuilds the checkout at the
 *  payment-resume unlock (`/my-account/finish-joining`). The page renders a quiet "check your
 *  inbox to sign" confirmation carrying no household data, the same posture as the renewal
 *  handoff. */
export interface JoinSignRequiredPivot {
  pivot: 'sign-required';
}

export type JoinApplyResult = CreateCheckoutResult | JoinRenewalLinkSentPivot | JoinEmailInUsePivot | JoinSignRequiredPivot;

/** The fresh-join door's own deep link into the signing moment, ridden by the purchaser's sign-in
 *  link (`?next=`, re-validated at `/my-account/confirm` against `return-path.ts`'s allowlist). */
const JOIN_SIGN_NEXT = '/my-account/sign?context=join';

interface JoinApplyEnv extends CreateCheckoutEnv {
  CLUB_DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  EMAIL?: EmailBindingEnv['EMAIL'];
  RATE_LIMIT_MONEY?: RateLimit;
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
 *
 * Like a fresh join, a retry does not itself decide checkout-vs-sign: it hands its rebuilt
 * application to {@link finalizeJoin}, which gates on the household's signatures first (an
 * abandoned join whose season now has published documents must sign before paying, just as a new
 * one would). The rebuilt {@link PersistedJoinApplication} carries no class picks: the retry reuses
 * only the membership row, matching this path's long-standing behavior of not re-adding classes on
 * resubmit.
 */
async function retryUnpaidJoin(
  db: D1Database,
  env: JoinApplyEnv,
  origin: string,
  season: number,
  membershipId: string,
  householdId: string,
  purchaserMemberId: string,
  tier: MembershipTier,
  purchaserEmail: string,
): Promise<JoinApplyResult> {
  const prices = await getTierPrices(db);
  const duesCents = Math.round(prices[tier] * 100);
  const priceDollars = Math.round(duesCents / 100);

  await db.prepare('UPDATE memberships SET tier = ?1, price_paid = ?2 WHERE id = ?3').bind(tier, priceDollars, membershipId).run();
  await db
    .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind('public:join', 'retry', 'membership', membershipId, `tier=${tier}`)
    .run();

  const app: PersistedJoinApplication = { membershipId, tier, purchaserMemberId, grantCredits: true, duesCents, enrollments: [] };
  return finalizeJoin(db, env, origin, season, app, {
    householdId,
    purchaserEmail,
    roster: null,
  });
}

/** Build the checkout for a signature-complete application and hand the result straight back, the
 *  submit-time (and no-published-documents) money moment. Wraps `createCheckout`'s own
 *  `CheckoutUnavailableError` into an `invalid()` the public form renders, the same shape the
 *  pre-T5c `createJoinCheckout` used. */
async function createJoinCheckoutFromApp(env: JoinApplyEnv, origin: string, app: PersistedJoinApplication): Promise<CreateCheckoutResult> {
  try {
    return await createCheckout(env, buildJoinCheckoutArgs(app, origin));
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) invalid(err.message);
    throw err;
  }
}

/**
 * The household-complete gate at the submit money moment (member-waivers T5c, spec rule 7's
 * amendment): a join is signature-complete only when NO applicable document is outstanding for any
 * household member. When the season has no published documents at all (the shipped state, every
 * real document still `status: draft`), the checkout is built immediately, byte-identical to the
 * pre-T5c flow. When a document applies, the persisted rows stand, nothing money-derived is
 * stored, and the purchaser is sent their own sign-in link deep-linking to the signing moment;
 * every member then signs before {@link buildJoinCheckoutArgs} rebuilds the checkout at
 * `/my-account/finish-joining`.
 *
 * A fresh join derives the gate in memory from `ctx.roster` (a brand-new household holds no
 * signatures yet, so `deriveHouseholdRequirements` with an empty `signatures` list is exact and
 * needs no read); a retry passes `roster: null` and the gate reads the persisted household. Either
 * skips the derivation entirely when the season publishes nothing.
 */
async function finalizeJoin(
  db: D1Database,
  env: JoinApplyEnv,
  origin: string,
  season: number,
  app: PersistedJoinApplication,
  ctx: { householdId: string; purchaserEmail: string; roster: HouseholdMemberInput[] | null },
): Promise<JoinApplyResult> {
  const publishedDocuments = loadPublishedDocuments(documents, season);

  let complete = true;
  if (publishedDocuments.size > 0) {
    const requirements = ctx.roster
      ? deriveHouseholdRequirements({
          season,
          primaryMemberId: app.purchaserMemberId,
          members: ctx.roster,
          assetKinds: [],
          publishedDocuments,
          signatures: [],
        })
      : await loadHouseholdRequirements(db, publishedDocuments, ctx.householdId, season);
    complete = requirements ? householdSignatureGate(requirements).complete : true;
  }

  if (complete) return createJoinCheckoutFromApp(env, origin, app);

  // Documents apply: the application stays persisted and unpaid, nothing money-derived is stored,
  // and the purchaser is emailed their own sign-in link deep-linking straight to the signing
  // moment. `requestMemberLink` stays enumeration-safe (the member row was just written, so it
  // resolves and sends); a missing `EMAIL` binding degrades silently, matching every other send
  // path in this module.
  const email = env.EMAIL;
  if (email) {
    await requestMemberLink(db, ctx.purchaserEmail, (message) => email.send(message), {
      origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
      next: JOIN_SIGN_NEXT,
    });
  }
  return { pivot: 'sign-required' };
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

  // Coverage table item 1, the money-path tightest cap (docs/2026-07-15-payments-live-smoke-
  // design.md section 2b): the join door creates a real checkout on a fresh join, so it keys
  // per IP and per the submitted purchaser email.
  const rateLimitAllowed = await checkRateLimitKeys(platformEnv?.RATE_LIMIT_MONEY, [`ip:${clientAddress}`, `email:${input.purchaserEmail.toLowerCase()}`]);
  if (!rateLimitAllowed) invalid(RATE_LIMIT_MESSAGE);

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
    if (unpaid) return retryUnpaidJoin(db, platformEnv!, origin, season, unpaid.id, known.household_id, known.id, input.tier, claimedEmail);

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
  const built = await buildJoinStatements(db, validated, pricing, { season, fullClassIds });
  await db.batch(built.statements);

  // The persisted, unpaid application, normalized for the ONE shared checkout builder
  // (member-waivers T5c): each enrollment carries its class's live name and fee cents in pick
  // order, so `buildJoinCheckoutArgs` derives byte-identical `reconcileJoin` metadata whether the
  // checkout is built here (a signature-complete household) or rebuilt from these same rows at the
  // payment-resume unlock. `built.enrollmentIds` is in the pick order of `nonFullPicks`, so
  // enrollment `i` prices against `nonFullPicks[i]`'s own class.
  const app: PersistedJoinApplication = {
    membershipId: built.membershipId,
    tier: validated.tier,
    purchaserMemberId: built.purchaserMemberId,
    grantCredits: true,
    duesCents: pricing.duesCents,
    enrollments: built.enrollmentIds.map((enrollmentId, index) => {
      const classId = nonFullPicks[index].classId;
      const facts = classFacts.get(classId);
      return { enrollmentId, className: facts?.name ?? 'Class', feeCents: Math.round((facts?.fee ?? 0) * 100) };
    }),
  };

  // The gate reads a brand-new household's requirements in memory (no signatures exist yet, so an
  // empty `signatures` list is exact): the purchaser is the primary, and a fresh household holds
  // no assets, so only 'all-members' documents and any minor's Part Two can apply. Member ids
  // other than the purchaser's are not returned by `buildJoinStatements`, but completeness with
  // no signatures is id-independent, so synthetic ids are safe here.
  const roster: HouseholdMemberInput[] = [
    { id: built.purchaserMemberId, name: validated.purchaser.name, birthdate: validated.purchaser.birthdate },
    ...validated.members.map((member, index) => ({ id: `pending-${index}`, name: member.name, birthdate: member.birthdate })),
  ];

  return finalizeJoin(db, platformEnv!, origin, season, app, { householdId: built.householdId, purchaserEmail: claimedEmail, roster });
}
