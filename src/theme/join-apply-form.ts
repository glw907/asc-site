// The public join door's own schema and handler logic, factored out of `join-apply.remote.ts`
// (a `.remote.ts` file may only export remote functions) the same way `class-signup-form.ts`
// factors `handleClassSignup` out of `class-signup.remote.ts`. This is the one thin entry the
// design doc names ("The join flow"): it owns turnstile verification, the household-lookup
// pivots, and the checkout construction, and delegates every rule the engine already owns
// (validation, pricing, the write batch) to `$member-signup/lib`, never re-deriving them here.
//
// Welcome-back renewal (Task 5, `docs/2026-07-13-unified-signup-design.md`'s "Renew and
// welcome-back", public-door half): a purchaser email matching a household that has paid a
// membership before never reaches the fresh-join engine (`$member-signup/lib`'s
// `buildJoinStatements` mints a NEW household, which is wrong here). This module owns a second,
// smaller write path instead, deliberately kept in this file rather than added to the engine's own
// pure core (Task 5's own scope is the route layer only): mint or reuse the next unclaimed
// season's unpaid `memberships` row, optionally add NEW household members (audited, never an edit
// to an existing one), apply the household's real, never-expiring credit balance
// (`getCreditBalance`) to class picks in pick order, and check out with `grant_credits: '0'` so
// `reconcileJoin` never grants a second set of credits for the same household.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { validateJoinInput } from '$member-signup/lib/validate.js';
import { computeJoinPricing } from '$member-signup/lib/pricing.js';
import { buildJoinStatements } from '$member-signup/lib/statements.js';
import type { JoinInput } from '$member-signup/lib/types.js';
import type { MembershipTier } from '$admin-club/lib/demo-members';
import { getClassWithCounts, isPubliclyOpen } from '$admin-club/lib/classes-store';
import { hasActiveOfferForClass } from '$admin-club/lib/offers';
import { getCurrentSeason, getTierPrices, getWaiverTextVersion } from '$admin-club/lib/club-settings';
import { normalizeEmail, normalizeNameCaps } from '$admin-club/lib/member-normalize.js';
import { MEMBERSHIP_TIER_LABEL, getMemberStanding } from '$member-auth/lib/standing';
import { getCreditBalance } from '$member-portal/lib/credits.js';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv, type CreateCheckoutResult } from '$admin-club/lib/payments';
import { verifyTurnstile } from './turnstile';

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
  /** Additional household members. On a fresh join, family tier only (`validateJoinInput`
   *  rejects a non-empty array for the other two tiers). On a welcome-back confirmation (this
   *  form resubmitted with `welcomeBackHouseholdId` set), these are NEW members being added to
   *  the existing household; the same family-only rule applies (`handleWelcomeBackConfirm`'s own
   *  check, mirroring the engine's). */
  members: v.optional(v.array(memberSchema), []),
  /** One entry per roster slot. On a fresh join, purchaser at `0`, `members[i]` at `i + 1`. On a
   *  welcome-back confirmation, the existing household's own members (in the same order
   *  `loadHouseholdMembers` returns) fill the leading slots, and `members[i]` above fills the
   *  slots after them; the client and this handler agree on that order because both read it from
   *  the same pivot response. `''` means "no class" for that slot. */
  picks: v.optional(v.array(v.pipe(v.string(), v.trim())), []),
  waiverAccepted: v.optional(v.boolean(), false),
  /** Set only by the welcome-back form's own resubmission (never rendered on a fresh join): the
   *  household id the pivot response named, so this handler can tell a confirmation apart from a
   *  first-pass probe of the same email without any other server-side state. Re-verified against
   *  a fresh lookup of `purchaserEmail` before anything is written (see
   *  {@link handleJoinApply}), so a visitor cannot point this at a household their claimed email
   *  does not actually belong to. */
  welcomeBackHouseholdId: v.optional(v.pipe(v.string(), v.trim()), ''),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export type JoinApplySubmission = v.InferOutput<typeof joinApplySchema>;

/** One existing household member, as the welcome-back pivot exposes it: just enough to build a
 *  class-pick selector (name) and address a pick at them (id). Never editable from this door
 *  (design's own "destructive edits... stay portal-only" ruling); this handler never writes to an
 *  existing member row. */
export interface JoinWelcomeBackMember {
  id: string;
  name: string;
}

/** The welcome-back pivot (Task 5): a purchaser email matching a household that has paid a
 *  membership before, at least once. Carries what the page needs to render the renewal in place
 *  of a fresh join: the household's own name, its last paid tier (shown as the default, but
 *  changeable), and its current roster (for per-member class picks; new members are added
 *  inline, never edited in). No row is written for this outcome alone; confirming resubmits the
 *  same form with `welcomeBackHouseholdId` set to {@link householdId}. */
export interface JoinWelcomeBackPivot {
  pivot: 'welcome-back';
  householdId: string;
  householdName: string;
  lastTier: MembershipTier;
  members: JoinWelcomeBackMember[];
}

/** The rare edge case a member row exists with no membership row behind it at all, paid or
 *  unpaid (nothing to reuse and no paid history to welcome back into): the pre-Task-5 dead end,
 *  kept only for this one case. */
export interface JoinEmailInUsePivot {
  pivot: 'email-in-use';
}

export type JoinApplyResult = CreateCheckoutResult | JoinWelcomeBackPivot | JoinEmailInUsePivot;

interface JoinApplyEnv extends CreateCheckoutEnv {
  CLUB_DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
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

/** The young-adult tier's own eligibility ceiling, mirroring `$member-signup/lib/validate.ts`'s
 *  own `YOUNG_ADULT_MAX_AGE` (not imported: that constant is not exported, and Task 5 keeps its
 *  own gate in the route layer rather than reaching into the engine's private surface). */
const YOUNG_ADULT_MAX_AGE = 26;

/** A person's age in whole years as of `asOfIso`, counting a birthday landing ON `asOfIso` itself
 *  as already had. Duplicates `validate.ts`'s own `ageAsOf` (same reason as
 *  {@link YOUNG_ADULT_MAX_AGE}): the welcome-back confirm path needs the identical rule without
 *  running the engine's full, differently-shaped `validateJoinInput`. */
function ageAsOf(birthdateIso: string, asOfIso: string): number {
  const born = new Date(`${birthdateIso}T00:00:00Z`);
  const asOf = new Date(`${asOfIso}T00:00:00Z`);
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const hasHadBirthday =
    asOf.getUTCMonth() > born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() && asOf.getUTCDate() >= born.getUTCDate());
  if (!hasHadBirthday) age -= 1;
  return age;
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

/** Whether `householdId` already has a PAID `memberships` row for `season`: the season-assignment
 *  loop's own stopping condition (see {@link nextUnclaimedSeason}). */
async function hasPaidMembershipForSeason(db: D1Database, householdId: string, season: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM memberships WHERE household_id = ?1 AND season = ?2 AND paid_at IS NOT NULL LIMIT 1')
    .bind(householdId, season)
    .first<{ found: number }>();
  return row !== null;
}

/** The next season at or after `currentSeason` the household has not already paid for (the
 *  design's own "next unclaimed season" rule, shared by welcome-back and the portal renew card):
 *  `currentSeason` itself, unless it is already paid, in which case the following season, and so
 *  on. Bounded at ten seasons ahead purely as a defensive ceiling; a real household is never
 *  pre-paid that far out. */
async function nextUnclaimedSeason(db: D1Database, householdId: string, currentSeason: number): Promise<number> {
  let season = currentSeason;
  for (let guard = 0; guard < 10 && (await hasPaidMembershipForSeason(db, householdId, season)); guard += 1) {
    season += 1;
  }
  return season;
}

/** A household's current roster, in the one stable order both the welcome-back pivot response
 *  and the confirmation write agree on (creation order, id as the final tiebreaker): existing
 *  members fill the leading class-pick slots, and any NEW members the confirmation adds fill the
 *  slots after them. */
async function loadHouseholdMembers(db: D1Database, householdId: string): Promise<JoinWelcomeBackMember[]> {
  const { results } = await db
    .prepare('SELECT id, name FROM members WHERE household_id = ?1 ORDER BY created_at ASC, id ASC')
    .bind(householdId)
    .all<JoinWelcomeBackMember>();
  return results;
}

/**
 * Reuse an abandoned join's still-unpaid membership row (the design's own "duplicate protection":
 * a checkout abandoned after submit leaves the unpaid row in place, and a retry reuses it instead
 * of failing the `UNIQUE(household_id, season)` constraint). This path is reached only for a
 * household that has NEVER paid a membership (see {@link handleJoinApply}): a real returning
 * member instead answers the {@link JoinWelcomeBackPivot} Task 5 owns. Class picks are not
 * re-processed here: the row's original enrollment/waitlist rows (if any) still stand from the
 * first attempt, and reconciling a changed roster against them is welcome-back's own job, not a
 * same-transaction retry's.
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
  /** `false` on a welcome-back renewal (the design's own ruling: credits ride a household's
   *  FIRST membership only), `true` on a fresh join or the retry of one. */
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
        // itself came from (both callers of this function, the fresh-join and welcome-back paths
        // alike, build them from the same ordered pass over picks).
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

/** A class pick, addressed at one slot of whatever roster is in play (the fresh-join roster or
 *  the welcome-back one); shared shape between both write paths. */
interface RosterPick {
  memberIndex: number;
  classId: string;
}

function parsePicks(rawPicks: string[]): RosterPick[] {
  return rawPicks
    .map((classId, memberIndex) => (classId ? { memberIndex, classId } : null))
    .filter((pick): pick is RosterPick => pick !== null);
}

/** Covers class picks with a household's real, already-granted credit balance, in pick order
 *  (the design's own rule, `computeJoinPricing`'s identical shape): the first `creditsAvailable`
 *  picks cost nothing, and every pick after that prices against `classFees` (0 for a class not in
 *  the map). Deliberately separate from `computeJoinPricing` (which covers against a TIER's own
 *  grant, not a standing balance): welcome-back never grants new credits, so what it can cover is
 *  whatever the household already has on the ledger. */
function coverPicksWithCredits(
  picks: RosterPick[],
  creditsAvailable: number,
  classFees: Map<string, number>,
): { coveredPicks: number[]; paidPicks: Array<{ pickIndex: number; amountCents: number }> } {
  const coveredPicks: number[] = [];
  const paidPicks: Array<{ pickIndex: number; amountCents: number }> = [];
  let remaining = creditsAvailable;

  picks.forEach((pick, pickIndex) => {
    if (remaining > 0) {
      coveredPicks.push(pickIndex);
      remaining -= 1;
      return;
    }
    const feeDollars = classFees.get(pick.classId) ?? 0;
    paidPicks.push({ pickIndex, amountCents: Math.round(feeDollars * 100) });
  });

  return { coveredPicks, paidPicks };
}

/** The next free `class_waitlist.position` for `classId`, matching `$member-signup/lib/statements.ts`'s
 *  own `nextPositionReader` (duplicated here for the same route-layer-only reason as
 *  {@link ageAsOf}: welcome-back's write batch is built in this file, not the engine's). */
function nextPositionReader(db: D1Database) {
  const seen = new Map<string, number>();
  return async (classId: string): Promise<number> => {
    if (!seen.has(classId)) {
      const row = await db
        .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM class_waitlist WHERE class_id = ?1')
        .bind(classId)
        .first<{ next_position: number }>();
      seen.set(classId, row?.next_position ?? 1);
    }
    const position = seen.get(classId) as number;
    seen.set(classId, position + 1);
    return position;
  };
}

interface NormalizedNewMember {
  name: string;
  birthdate: string | null;
  email: string | null;
}

interface WelcomeBackStatementsArgs {
  householdId: string;
  tier: MembershipTier;
  priceDollars: number;
  season: number;
  existingMembers: JoinWelcomeBackMember[];
  newMembers: NormalizedNewMember[];
  picks: RosterPick[];
  fullClassIds: Set<string>;
  /** An unpaid row already on file for `season` (an abandoned earlier attempt at this same
   *  renewal): reused with an `UPDATE` instead of minting a second row, the same duplicate
   *  protection the fresh-join path already applies. */
  unpaidMembershipId: string | null;
  purchaserName: string;
  purchaserEmail: string;
  waiverVersion: string;
}

interface WelcomeBackStatementsResult {
  statements: D1PreparedStatement[];
  membershipId: string;
  enrollmentIds: string[];
  waitlistIds: string[];
}

/** Builds the welcome-back confirmation's own write batch: any NEW household members (audited,
 *  never an edit to an existing row), the mint-or-reuse of the target season's unpaid membership
 *  row, each class pick's enrollment or waitlist row against the COMBINED roster (existing
 *  members first, then the new ones, `args.existingMembers`'s own order), and the purchaser's
 *  waiver acceptance. Mirrors `$member-signup/lib/statements.ts`'s `buildJoinStatements` in shape
 *  but never inserts a household or a purchaser member row: both already exist. */
async function buildWelcomeBackStatements(db: D1Database, args: WelcomeBackStatementsArgs): Promise<WelcomeBackStatementsResult> {
  const statements: D1PreparedStatement[] = [];
  const newMemberIds = args.newMembers.map(() => crypto.randomUUID());

  args.newMembers.forEach((member, index) => {
    statements.push(
      db
        .prepare('INSERT INTO members (id, household_id, name, email, phone, birthdate) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(newMemberIds[index], args.householdId, member.name, member.email, null, member.birthdate),
      db
        .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind('public:join', 'add-member', 'member', newMemberIds[index], `household=${args.householdId}`),
    );
  });

  const membershipId = args.unpaidMembershipId ?? crypto.randomUUID();
  statements.push(
    args.unpaidMembershipId
      ? db.prepare('UPDATE memberships SET tier = ?1, price_paid = ?2 WHERE id = ?3').bind(args.tier, args.priceDollars, args.unpaidMembershipId)
      : db
          .prepare('INSERT INTO memberships (id, household_id, season, tier, price_paid) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind(membershipId, args.householdId, args.season, args.tier, args.priceDollars),
    db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind('public:join', 'welcome-back', 'membership', membershipId, `tier=${args.tier} season=${args.season}`),
  );

  const roster = [...args.existingMembers.map((member) => member.id), ...newMemberIds];
  const nextPosition = nextPositionReader(db);
  const enrollmentIds: string[] = [];
  const waitlistIds: string[] = [];

  for (const pick of args.picks) {
    const memberId = roster[pick.memberIndex];
    if (args.fullClassIds.has(pick.classId)) {
      const waitlistId = crypto.randomUUID();
      const position = await nextPosition(pick.classId);
      waitlistIds.push(waitlistId);
      statements.push(
        db
          .prepare('INSERT INTO class_waitlist (id, class_id, member_id, position) VALUES (?1, ?2, ?3, ?4)')
          .bind(waitlistId, pick.classId, memberId, position),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:join', 'waitlist', 'waitlist', waitlistId, `class=${pick.classId} position=${position}`),
      );
    } else {
      const enrollmentId = crypto.randomUUID();
      enrollmentIds.push(enrollmentId);
      statements.push(
        db
          .prepare('INSERT INTO class_enrollments (id, class_id, member_id, fee_paid) VALUES (?1, ?2, ?3, 0)')
          .bind(enrollmentId, pick.classId, memberId),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:join', 'enroll', 'enrollment', enrollmentId, `class=${pick.classId}`),
      );
    }
  }

  statements.push(
    db
      .prepare("INSERT INTO waiver_acceptances (id, person_name, person_email, context, waiver_version) VALUES (?1, ?2, ?3, 'join', ?4)")
      .bind(crypto.randomUUID(), args.purchaserName, args.purchaserEmail, args.waiverVersion),
  );

  return { statements, membershipId, enrollmentIds, waitlistIds };
}

/**
 * Confirms a welcome-back renewal (Task 5): `input.welcomeBackHouseholdId` matched `standing`'s
 * own household on the way in (see {@link handleJoinApply}), so this function trusts it. Mints or
 * reuses the next unclaimed season's unpaid membership row at the CHOSEN tier's current settings
 * price (the tier is changeable from `standing.tier`, the pivot's own "last tier" default), adds
 * any new household members (audited, never an edit to an existing one), applies the household's
 * real credit balance to class picks in pick order (never a fresh grant), and checks out with
 * `grantCredits: false`.
 */
async function handleWelcomeBackConfirm(
  db: D1Database,
  env: JoinApplyEnv,
  origin: string,
  input: JoinApplySubmission,
  today: string,
  householdId: string,
  purchaserMemberId: string,
  existingMembers: JoinWelcomeBackMember[],
): Promise<CreateCheckoutResult> {
  if (!input.waiverAccepted) invalid('You must accept the waiver to join.');
  if (input.tier !== 'family' && input.members.length > 0) {
    invalid('Only the family tier can include additional household members.');
  }
  if (input.tier === 'young-adult') {
    if (!input.purchaserBirthdate) invalid('Young Adult membership requires a birthdate to verify eligibility.');
    else if (ageAsOf(input.purchaserBirthdate, today) >= YOUNG_ADULT_MAX_AGE) invalid('Young Adult membership is only available under 26.');
  }
  input.members.forEach((member, index) => {
    if (!member.name.trim()) invalid(`Household member ${index + 1} needs a name.`);
  });

  const newMembers: NormalizedNewMember[] = input.members.map((member) => ({
    name: normalizeNameCaps(member.name.trim()),
    birthdate: member.birthdate?.trim() || null,
    email: member.email ? normalizeEmail(member.email) : null,
  }));

  const rosterSize = existingMembers.length + newMembers.length;
  const picks = parsePicks(input.picks);
  for (const pick of picks) {
    if (pick.memberIndex < 0 || pick.memberIndex >= rosterSize) {
      invalid('A class pick refers to a household member that was not entered.');
    }
  }

  const classFacts = await loadPickedClassFacts(
    db,
    picks.map((pick) => pick.classId),
  );
  const fullClassIds = new Set([...classFacts.entries()].filter(([, facts]) => facts.isFull).map(([id]) => id));
  const nonFullPicks = picks.filter((pick) => !fullClassIds.has(pick.classId));
  const classFees = new Map([...classFacts.entries()].map(([id, facts]) => [id, facts.fee]));

  const prices = await getTierPrices(db);
  const duesCents = Math.round(prices[input.tier] * 100);
  const priceDollars = Math.round(duesCents / 100);

  const creditBalance = await getCreditBalance(db, householdId);
  const { coveredPicks, paidPicks } = coverPicksWithCredits(nonFullPicks, creditBalance, classFees);

  const currentSeason = await getCurrentSeason(db);
  const season = await nextUnclaimedSeason(db, householdId, currentSeason);
  const unpaid = await findUnpaidMembershipForSeason(db, householdId, season);
  const waiverVersion = await getWaiverTextVersion(db);

  const built = await buildWelcomeBackStatements(db, {
    householdId,
    tier: input.tier,
    priceDollars,
    season,
    existingMembers,
    newMembers,
    picks: nonFullPicks,
    fullClassIds,
    unpaidMembershipId: unpaid?.id ?? null,
    purchaserName: input.purchaserName,
    purchaserEmail: input.purchaserEmail,
    waiverVersion,
  });
  await db.batch(built.statements);

  const paidLines = paidPicks.map((pick) => {
    const classId = nonFullPicks[pick.pickIndex].classId;
    const name = classFacts.get(classId)?.name ?? 'Class';
    return { amountCents: pick.amountCents, name: `${name} class fee` };
  });
  const coveredEnrollmentIds = coveredPicks.map((pickIndex) => built.enrollmentIds[pickIndex]);

  return createJoinCheckout(env, origin, {
    refId: built.membershipId,
    tier: input.tier,
    duesCents,
    paidLines,
    enrollmentIds: built.enrollmentIds,
    coveredEnrollmentIds,
    purchaserMemberId,
    grantCredits: false,
  });
}

/**
 * The public join door's own action (Task 3, `docs/2026-07-13-unified-signup-design.md`): reuses
 * `$member-signup/lib`'s engine for every rule and pricing decision on a fresh join, and owns only
 * what is specific to a live submission: turnstile, the household-lookup pivots, the live class
 * facts a submission's picks need, and the checkout itself.
 *
 * The household lookup runs FIRST, ahead of the engine's own `validateJoinInput` (Task 5): a
 * purchaser email that resolves to a member whose household has paid a membership before, ever,
 * never reaches the fresh-join engine at all (its own roster/validation rules do not fit a
 * renewal's different roster shape). `input.welcomeBackHouseholdId` is re-verified against a
 * fresh lookup of the CLAIMED email before anything is written, so this handler distinguishes a
 * first-pass probe (empty, or naming a household the email does not actually belong to: answers
 * the pivot, writes nothing) from a confirmed renewal (matches: writes and checks out) without
 * trusting the client for anything but which household it already told it about.
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
      if (input.welcomeBackHouseholdId && input.welcomeBackHouseholdId === standing.householdId) {
        const existingMembers = await loadHouseholdMembers(db, standing.householdId);
        return handleWelcomeBackConfirm(db, platformEnv!, origin, input, anchorageTodayIso(), standing.householdId, known.id, existingMembers);
      }
      return {
        pivot: 'welcome-back',
        householdId: standing.householdId,
        householdName: standing.householdName,
        lastTier: standing.tier,
        members: await loadHouseholdMembers(db, standing.householdId),
      };
    }

    const season = await getCurrentSeason(db);
    const unpaid = await findUnpaidMembershipForSeason(db, known.household_id, season);
    if (unpaid) return retryUnpaidJoin(db, platformEnv!, origin, unpaid.id, known.id, input.tier);

    // A member row with no membership row at all (paid or unpaid) yet: nothing to reuse or
    // welcome back into. Treated as a pivot rather than minting a second household for the same
    // email, which `members.email UNIQUE` would refuse anyway.
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
