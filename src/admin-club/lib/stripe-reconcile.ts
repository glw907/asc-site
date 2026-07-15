// The webhook's own reconciliation engine (`src/routes/(site)/api/stripe/webhook/+server.ts`):
// once a `checkout.session.completed` event's signature is verified, this module is the one place
// that turns it into a database write. `payments.ts`'s own header names the contract this reads:
// every session `createCheckout` creates carries `metadata.kind`/`metadata.refId`, and only those
// two fields decide which row a completed session reconciles. `claimStripeSession` is the
// idempotency gate (migration `0014_stripe_payments`'s own `processed_stripe_sessions` table): the
// route calls it BEFORE calling `reconcileCheckoutSession`, so a Stripe retry of an already-handled
// delivery never reaches this module's own per-kind writers a second time.
//
// Each per-kind reconciler also carries its own natural-state guard on the write itself (`WHERE
// paid_at IS NULL`, `WHERE fee_paid = 0`, the asset-payment upsert's own `WHERE ... paid_at IS
// NULL`): belt-and-suspenders alongside the session-claim gate, the same "changes === 1 or it's a
// no-op" compare-and-set shape `offers.ts`'s `claimOffer` and the engine's own editor store's
// `removeOwnerIfNotLast` already use for an identical race. Neither guard alone would be wrong;
// carrying both costs one extra `WHERE` clause and closes a second, independent path to a
// double-reconcile (a stray direct write elsewhere marking the same row paid between the claim
// and this write).
//
// A reconciler never throws for an ordinary refusal (an unknown `refId`, an already-paid row): it
// answers `ReconcileOutcome`, the same never-throw convention `offers.ts` and `enrollments.ts`
// already establish for every public-facing write path, since a webhook reconciliation failure must
// never surface as an unhandled exception the route would have to turn into a 500 (the route's own
// header explains why a 500 here is worse than useless: Stripe retries a non-2xx delivery for up to
// three days, and a persistently-wrong `refId` can never self-heal from a retry).
//
// `donation` and `join` are the two deliberate exceptions to both of the above. `donation` has no
// domain row for a natural-state guard to fall back on, so it gives itself its own atomic claim
// instead of the route's own pre-claim (see `reconcileDonation`'s own header). `join` DOES have a
// domain row (the membership) but composes every one of its mutations -- the claim, the guarded
// flip, the credit grant/redemptions, the enrollment fee_paid flips, and the ledger statements --
// into ONE `db.batch()` (see `reconcileJoin`'s own header): a combined checkout with several
// moving parts must not commit some of them and not others. A rejected promise from either is
// allowed to propagate, and the route answers 500 for both kinds alone so Stripe retries. This is
// safe there and nowhere else because neither carries a wrong-`refId` poison case -- malformed
// metadata is already rejected 400 before any database touch -- so a retry can never get stuck
// retrying forever against a request that will never succeed.
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { PAYMENT_KINDS, type PaymentKind } from './payments';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import { getCurrentSeason } from './club-settings';
import { formatClubTimestamp, formatDollars } from './ui';
import { toSqliteDatetime } from './offers';
import { buildTransactionStatements, recordTransaction } from './ledger';

/** The slice of a Stripe Checkout Session object this module actually reads: `amount_total` is
 *  the authoritative, Stripe-confirmed charge (cents), read from the event payload rather than
 *  recomputed from anything this site stored earlier, so a receipt always reflects what Stripe
 *  actually collected. */
export interface StripeCheckoutSession {
  id: string;
  amount_total: number | null;
  metadata: Record<string, string> | null | undefined;
  /** Present on a donation's session (no signed-in member, so no household to resolve): the
   *  ledger snapshots whichever of `name`/`email` Stripe collected, per the donation reconciler
   *  below. Absent or `null` on the other three kinds, which resolve their own household instead. */
  customer_details?: { name?: string | null; email?: string | null } | null;
}

/** `session.metadata.kind`/`session.metadata.refId`, validated: `null` for a session with no
 *  metadata, an unrecognized `kind`, or an empty `refId` (a malformed or foreign event the route
 *  answers 400 for, never a database write). `memo` is optional and unvalidated: `null` when the
 *  session carries no `metadata.memo` (every ordinary checkout, unchanged behavior), or the
 *  trimmed string when it does (the live-smoke marking, `payments.ts`'s own `metadata`
 *  pass-through carries it onto the session). */
export interface ParsedSessionMetadata {
  kind: PaymentKind;
  refId: string;
  memo: string | null;
}

function isPaymentKind(value: unknown): value is PaymentKind {
  return typeof value === 'string' && (PAYMENT_KINDS as readonly string[]).includes(value);
}

/** Validate a Checkout Session's `metadata` against the two fields `createCheckout` always sets
 *  (`payments.ts`'s own header). Exported so the webhook route's own 400-vs-proceed branch can
 *  run before ever touching the database (this module's own header on why that ordering matters). */
export function parseSessionMetadata(session: StripeCheckoutSession): ParsedSessionMetadata | null {
  const kind = session.metadata?.kind;
  const refId = session.metadata?.refId;
  if (!isPaymentKind(kind) || typeof refId !== 'string' || refId.trim().length === 0) return null;
  const rawMemo = session.metadata?.memo;
  const memo = typeof rawMemo === 'string' && rawMemo.trim().length > 0 ? rawMemo.trim() : null;
  return { kind, refId, memo };
}

/** Claim a session id for reconciliation: `true` when this call is the first to see this
 *  `session_id` (an `INSERT OR IGNORE` reporting `changes: 1`), `false` when it has already been
 *  claimed (a Stripe retry, or a genuinely duplicate delivery), the exact compare-and-set shape
 *  this module's own header describes. The caller (the webhook route) must call this BEFORE
 *  {@link reconcileCheckoutSession} and skip that call entirely on `false`. */
export async function claimStripeSession(db: D1Database, sessionId: string, kind: PaymentKind, refId: string): Promise<boolean> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO processed_stripe_sessions (session_id, kind, ref_id) VALUES (?1, ?2, ?3)')
    .bind(sessionId, kind, refId)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

/** One reconciler's outcome: `ok: true` for both a real reconciliation and an already-settled
 *  no-op (the natural-state guard losing its own race, this module's own header); `ok: false`
 *  only for a refusal the caller should log loudly (an unknown `refId`), never thrown. */
export interface ReconcileOutcome {
  ok: boolean;
  /** A short, loggable reason: set on every `ok: false`, and on an `ok: true` no-op so the log
   *  still distinguishes "reconciled and emailed" from "already settled, nothing to do". */
  reason?: string;
}

/** `session.amount_total` is `null` on a Checkout Session Stripe itself did not attach a
 *  confirmed total to: every reconciler below checks this BEFORE any write, rather than the old
 *  `?? 0` fallback, because that fallback recorded a $0 ledger row while still flipping the
 *  domain row (or, for a donation, the claim) PAID -- the difference between "no write, a loud
 *  log line for a human to investigate" and silently mis-recording money Stripe never actually
 *  confirmed. */
function requireAmountTotalCents(session: StripeCheckoutSession): number | null {
  if (session.amount_total == null) {
    console.error(`api/stripe/webhook: session ${session.id} carries no amount_total; refusing before any write`);
    return null;
  }
  return session.amount_total;
}

/** Insert one `audit_log` row directly, mirroring `offers.ts`'s own `writeAudit`: the webhook has
 *  no signed-in editor and no `adminAction`-wrapped route behind it, so `ctx.audit` is never
 *  available here either. A failed write logs loudly but never fails the reconciliation it is
 *  auditing, which has already committed by the time this runs. */
async function writeAudit(db: D1Database, entity: string, entityId: string, detail: string): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind('system:stripe-webhook', 'payment.reconcile', entity, entityId, detail)
      .run();
  } catch (err) {
    console.error('admin/club: stripe webhook audit_log insert failed', err);
  }
}

/** The receipt email's own shared vars, everything but `person_name`/`item_display_name`, which
 *  differ per kind. */
function receiptVars(session: StripeCheckoutSession, committeeEmail: string): { amount: string; payment_date: string; reference: string; committee_email: string } {
  return {
    amount: formatDollars(Math.round((session.amount_total ?? 0) / 100)),
    payment_date: formatClubTimestamp(toSqliteDatetime(new Date())),
    reference: session.id,
    committee_email: committeeEmail,
  };
}

/** Local duplicate of `member-auth/lib/standing.ts`'s own `MEMBERSHIP_TIER_LABEL`: deliberate,
 *  not an oversight. That module's own header states its independence from `admin-club` (one
 *  documented `club-settings.ts` reuse only); this reconciler lives in `admin-club/lib`, and
 *  importing `member-auth` from here would be the reverse direction, a boundary this three-entry
 *  map costs nothing to keep intact instead. */
const TIER_LABEL: Record<'individual' | 'family' | 'young-adult', string> = {
  individual: 'Individual',
  family: 'Family',
  'young-adult': 'Young Adult',
};

interface MembershipReconcileRow {
  id: string;
  household_id: string;
  tier: 'individual' | 'family' | 'young-adult';
  season: number;
  paid_at: string | null;
}

/** `reconcileJoin`'s own env slice beyond {@link EmailBindingEnv}: `PUBLIC_ORIGIN` builds the
 *  `join_welcome` email's portal/Discord links, the same optional-var shape `src/jobs/registry.ts`'s
 *  own `JobEnv` already establishes for the identical need (never a request header, since a
 *  webhook delivery carries no browser origin worth trusting). */
export interface ReconcileJoinEnv extends EmailBindingEnv {
  PUBLIC_ORIGIN?: string;
}

interface HouseholdPrimaryRow {
  primary_member_id: string | null;
}

interface MemberContactRow {
  name: string;
  email: string | null;
}

/** `kind: 'dues'`: `refId` is a `memberships.id` (migration `0005_member_domain`). Sets `paid_at`
 *  (the schema's own "membership ACTIVATES on payment" rule, `forward.sql`'s comment) and
 *  `stripe_ref`, guarded to only flip a still-unpaid row. Emails the household's primary member
 *  when one is on file with an address; a household with no primary member, or one with no email,
 *  still reconciles the payment, just with no receipt sent (the same "resolves to null, not an
 *  error" shape `offers.ts`'s `resolveWaitlistContact` already establishes). */
async function reconcileDues(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession, memo: string | null): Promise<ReconcileOutcome> {
  const membership = await db
    .prepare('SELECT id, household_id, tier, season, paid_at FROM memberships WHERE id = ?1')
    .bind(refId)
    .first<MembershipReconcileRow>();
  if (!membership) return { ok: false, reason: `no such membership: ${refId}` };

  const amountTotalCents = requireAmountTotalCents(session);
  if (amountTotalCents === null) return { ok: false, reason: `session ${session.id} carries no amount_total` };

  const update = await db
    .prepare("UPDATE memberships SET paid_at = datetime('now'), stripe_ref = ?1 WHERE id = ?2 AND paid_at IS NULL")
    .bind(session.id, refId)
    .run();
  if ((update.meta.changes ?? 0) !== 1) return { ok: true, reason: `membership ${refId} already paid; no-op` };

  await writeAudit(db, 'membership', refId, `kind=dues session=${session.id}`);

  const itemDisplayName = `${TIER_LABEL[membership.tier]} Membership -- ${membership.season} season`;
  await recordTransaction(
    db,
    { kind: 'charge', source: 'stripe', occurredAt: toSqliteDatetime(new Date()), amountTotalCents, processorRef: session.id, householdId: membership.household_id, memo },
    [{ item: 'dues', description: itemDisplayName, amountCents: amountTotalCents, membershipId: refId }],
  );

  const household = await db.prepare('SELECT primary_member_id FROM households WHERE id = ?1').bind(membership.household_id).first<HouseholdPrimaryRow>();
  const primary = household?.primary_member_id
    ? await db.prepare('SELECT name, email FROM members WHERE id = ?1').bind(household.primary_member_id).first<MemberContactRow>()
    : null;
  if (primary?.email) {
    await sendClubEmail(db, env, {
      to: primary.email,
      templateId: 'stripe_payment_receipt',
      vars: {
        person_name: primary.name,
        item_display_name: itemDisplayName,
        ...receiptVars(session, 'finance-committee@aksailingclub.org'),
      },
    });
  }
  return { ok: true };
}

interface EnrollmentReconcileRow {
  class_id: string;
  class_name: string;
  member_name: string;
  member_email: string | null;
  household_id: string;
}

/** `kind: 'class-fee'`: `refId` is a `class_enrollments.id`. The row already exists (the public
 *  signup path, `enrollments.ts`'s `signUpForClass`, always creates the enrollment BEFORE this
 *  payment is ever offered, this worktree's own `classes/[id]/signup` page shows the fee prompt
 *  only after a successful `outcome: 'enrolled'`), so this only ever flips `fee_paid`, never
 *  creates a row nor changes capacity. Deliberately calls no capacity-side-effect from
 *  `enrollments.ts`/`offers.ts` (no freed-spot offer, no credit redemption): paying an existing
 *  seat's fee is not a capacity event, and this site's own credit-waiver path (a member covering
 *  a fee with a membership credit instead of a card) is a separate, mutually exclusive route to
 *  the SAME `fee_paid` flag that never goes through Stripe at all, so there is nothing here for a
 *  Stripe-confirmed payment to trigger beyond its own row. */
async function reconcileClassFee(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession, memo: string | null): Promise<ReconcileOutcome> {
  const enrollment = await db
    .prepare(
      `SELECT c.id AS class_id, c.name AS class_name, m.name AS member_name, m.email AS member_email, m.household_id AS household_id
       FROM class_enrollments ce
       JOIN classes c ON c.id = ce.class_id
       JOIN members m ON m.id = ce.member_id
       WHERE ce.id = ?1`,
    )
    .bind(refId)
    .first<EnrollmentReconcileRow>();
  if (!enrollment) return { ok: false, reason: `no such class_enrollments row: ${refId}` };

  const amountTotalCents = requireAmountTotalCents(session);
  if (amountTotalCents === null) return { ok: false, reason: `session ${session.id} carries no amount_total` };

  const update = await db
    .prepare('UPDATE class_enrollments SET fee_paid = 1, stripe_ref = ?1 WHERE id = ?2 AND fee_paid = 0')
    .bind(session.id, refId)
    .run();
  if ((update.meta.changes ?? 0) !== 1) return { ok: true, reason: `class_enrollments ${refId} fee already paid; no-op` };

  await writeAudit(db, 'enrollment', refId, `kind=class-fee session=${session.id} class=${enrollment.class_id}`);

  const itemDisplayName = `${enrollment.class_name} class fee`;
  await recordTransaction(
    db,
    { kind: 'charge', source: 'stripe', occurredAt: toSqliteDatetime(new Date()), amountTotalCents, processorRef: session.id, householdId: enrollment.household_id, memo },
    [{ item: 'class-fee', description: itemDisplayName, amountCents: amountTotalCents, enrollmentId: refId }],
  );

  if (enrollment.member_email) {
    await sendClubEmail(db, env, {
      to: enrollment.member_email,
      templateId: 'stripe_payment_receipt',
      vars: {
        person_name: enrollment.member_name,
        item_display_name: itemDisplayName,
        ...receiptVars(session, 'program-committee@aksailingclub.org'),
      },
    });
  }
  return { ok: true };
}

interface AssignmentReconcileRow {
  asset_type_name: string;
  household_id: string;
  household_name: string;
  primary_member_name: string | null;
  primary_member_email: string | null;
}

/** `kind: 'asset-fee'`: `refId` is an `asset_assignments.id` (`payments.ts`'s own doc comment on
 *  `CreateCheckoutArgs.refId`). Upserts the CURRENT season's `asset_payments` row (the same
 *  `UNIQUE (assignment_id, season)` `assets-store.ts`'s `recordPayment` already upserts on, method
 *  `'card'` since this row's only source is a Stripe Checkout Session), guarded to only settle a
 *  still-unpaid row. The assignment itself needs no status write: `asset_assignments.status` only
 *  ever holds `'active'` or `'released'` (no "pending payment" state in the ratified schema), and
 *  `assets-store.ts`'s `assignAsset` always creates a row already `'active'`, so a Stripe-collected
 *  fee only ever confirms an existing active assignment's payment, never activates one from some
 *  other state. */
async function reconcileAssetFee(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession, memo: string | null): Promise<ReconcileOutcome> {
  const assignment = await db
    .prepare(
      `SELECT at.name AS asset_type_name, h.id AS household_id, h.name AS household_name, pm.name AS primary_member_name, pm.email AS primary_member_email
       FROM asset_assignments aa
       JOIN asset_types at ON at.id = aa.asset_type
       JOIN memberships m ON m.id = aa.membership_id
       JOIN households h ON h.id = m.household_id
       LEFT JOIN members pm ON pm.id = h.primary_member_id
       WHERE aa.id = ?1`,
    )
    .bind(refId)
    .first<AssignmentReconcileRow>();
  if (!assignment) return { ok: false, reason: `no such asset_assignments row: ${refId}` };

  const amountTotalCents = requireAmountTotalCents(session);
  if (amountTotalCents === null) return { ok: false, reason: `session ${session.id} carries no amount_total` };

  const season = await getCurrentSeason(db);
  const amountDollars = Math.round(amountTotalCents / 100);
  const upsert = await db
    .prepare(
      `INSERT INTO asset_payments (id, assignment_id, season, amount, method, stripe_ref, paid_at)
       VALUES (?1, ?2, ?3, ?4, 'card', ?5, datetime('now'))
       ON CONFLICT (assignment_id, season) DO UPDATE SET
         amount = excluded.amount, method = excluded.method, stripe_ref = excluded.stripe_ref, paid_at = excluded.paid_at
       WHERE asset_payments.paid_at IS NULL`,
    )
    .bind(crypto.randomUUID(), refId, season, amountDollars, session.id)
    .run();
  if ((upsert.meta.changes ?? 0) !== 1) return { ok: true, reason: `asset_payments for assignment ${refId} season ${season} already paid; no-op` };

  await writeAudit(db, 'assignment', refId, `kind=asset-fee session=${session.id} type=${assignment.asset_type_name}`);

  const itemDisplayName = `${assignment.asset_type_name} fee -- ${season} season`;
  await recordTransaction(
    db,
    { kind: 'charge', source: 'stripe', occurredAt: toSqliteDatetime(new Date()), amountTotalCents, processorRef: session.id, householdId: assignment.household_id, memo },
    [{ item: 'asset-fee', description: itemDisplayName, amountCents: amountTotalCents, assignmentId: refId }],
  );

  if (assignment.primary_member_email) {
    await sendClubEmail(db, env, {
      to: assignment.primary_member_email,
      templateId: 'stripe_payment_receipt',
      vars: {
        person_name: assignment.primary_member_name ?? assignment.household_name,
        item_display_name: itemDisplayName,
        ...receiptVars(session, 'finance-committee@aksailingclub.org'),
      },
    });
  }
  return { ok: true };
}

/** `kind: 'donation'`: `refId` is a fresh uuid `donate.remote.ts` mints and passes to
 *  `createCheckout` as the Checkout Session's `metadata.refId`, then hands to this reconciler as
 *  the ledger's own transaction id. UNLIKE the other three kinds, this reconciler claims the
 *  session itself -- a plain `INSERT` into `processed_stripe_sessions`, not the route's own
 *  `INSERT OR IGNORE` pre-claim -- inside the SAME `db.batch()` as the `transactions`/
 *  `transaction_lines` writes, so the claim and the ledger row commit atomically. A donation has
 *  no domain row for a natural-state guard to fall back on (the other three kinds' own `WHERE
 *  paid_at IS NULL` shape); without atomicity, a claim that committed while the ledger write
 *  failed would silently drop a real donation forever, since Stripe never retries a session this
 *  route already answered 200 for.
 *
 *  A concurrent double delivery converges: the losing batch's own claim `INSERT` collides on
 *  `processed_stripe_sessions`'s primary key, the whole batch rolls back (this call rejects), and
 *  the route -- donation kind only, its own header explains why -- answers 500 so Stripe retries;
 *  the retry's own pre-check below finds the winning delivery's claim already committed and
 *  no-ops. This is safe specifically because a donation carries no wrong-`refId` poison case for
 *  an endless retry to get stuck on: malformed metadata is already rejected 400 before any
 *  database touch (`parseSessionMetadata`, called before this reconciler ever runs), so any retry
 *  that reaches here still carries a `refId` this reconciler can act on. No receipt email
 *  (`docs/2026-07-13-money-ledger-design.md`'s "Live write path": donations get none in this
 *  initiative). */
async function reconcileDonation(db: D1Database, refId: string, session: StripeCheckoutSession, memo: string | null): Promise<ReconcileOutcome> {
  const claimed = await db
    .prepare('SELECT session_id FROM processed_stripe_sessions WHERE session_id = ?1')
    .bind(session.id)
    .first<{ session_id: string }>();
  if (claimed) return { ok: true, reason: `donation session ${session.id} already recorded; no-op` };

  const amountTotalCents = requireAmountTotalCents(session);
  if (amountTotalCents === null) return { ok: false, reason: `session ${session.id} carries no amount_total` };

  const { statements } = buildTransactionStatements(
    db,
    {
      id: refId,
      kind: 'charge',
      source: 'stripe',
      occurredAt: toSqliteDatetime(new Date()),
      amountTotalCents,
      processorRef: session.id,
      payerName: session.customer_details?.name ?? null,
      payerEmail: session.customer_details?.email ?? null,
      memo,
    },
    [{ item: 'donation', description: 'Donation to the Alaska Sailing Club', amountCents: amountTotalCents }],
  );

  await db.batch([
    db.prepare('INSERT INTO processed_stripe_sessions (session_id, kind, ref_id) VALUES (?1, ?2, ?3)').bind(session.id, 'donation', refId),
    ...statements,
  ]);

  await writeAudit(db, 'transaction', refId, `kind=donation session=${session.id}`);
  return { ok: true };
}

interface HouseholdNameRow {
  name: string;
}

/** One `class_enrollments` row a `join` session's metadata referenced, as the bulk read below
 *  fetches it: the class name (for the ledger line's description and the board notice's
 *  summary) and the enrolled member's OWN household id, which {@link reconcileJoin}'s household
 *  scoping check compares against the membership's household before writing anything. */
interface JoinEnrollmentRow {
  id: string;
  class_name: string;
  household_id: string;
}

/** Reads every `enrollmentIds` row in ONE `WHERE ce.id IN (...)` query, bound params, never a
 *  per-id round-trip: the shape {@link reconcileJoin}'s own header requires. Answers an empty
 *  map without querying at all for a solo join with no class picks. */
async function loadJoinEnrollments(db: D1Database, enrollmentIds: string[]): Promise<Map<string, JoinEnrollmentRow>> {
  const rows = new Map<string, JoinEnrollmentRow>();
  if (enrollmentIds.length === 0) return rows;
  const placeholders = enrollmentIds.map((_, i) => `?${i + 1}`).join(', ');
  const { results } = await db
    .prepare(
      `SELECT ce.id AS id, c.name AS class_name, m.household_id AS household_id
       FROM class_enrollments ce
       JOIN classes c ON c.id = ce.class_id
       JOIN members m ON m.id = ce.member_id
       WHERE ce.id IN (${placeholders})`,
    )
    .bind(...enrollmentIds)
    .all<JoinEnrollmentRow>();
  for (const row of results) rows.set(row.id, row);
  return rows;
}

/** Local duplicate of `member-signup/lib/pricing.ts`'s own `CREDIT_GRANT_AMOUNT`: deliberate, not
 *  an oversight, the same independence this module's own `TIER_LABEL` above already documents --
 *  `member-signup/lib` is the join engine's pure core (Task 1), and this reconciler lives in
 *  `admin-club/lib`; importing across that boundary for one constant costs more than repeating a
 *  three-entry map both modules are free to keep in sync by hand. */
const CREDIT_GRANT_AMOUNT: Record<'individual' | 'family' | 'young-adult', number> = {
  individual: 1,
  family: 2,
  'young-adult': 1,
};

/** The board's own notification address (the design's ruling 5: the board is notified of every
 *  join, never gated on it), the same address `payments.ts`'s and `enrollments.ts`'s own
 *  fallback-contact copy already names. */
const BOARD_NOTIFICATION_EMAIL = 'board@aksailingclub.org';

/** Split a comma-joined metadata list into its ids, dropping empty entries: an empty metadata
 *  value (a join with no class picks at all) would otherwise split to `['']`. */
function parseIdList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Split a comma-joined metadata list of integer-cents strings into numbers, the same
 *  empty-value handling as {@link parseIdList}. A malformed or short-of-length entry parses to
 *  `NaN`/`undefined`, which is deliberately not caught here: it flows straight into
 *  {@link buildTransactionStatements}'s own lines, whose sum-invariant check against
 *  `session.amount_total` throws loudly on the mismatch that produces (this module's own header
 *  on why `join`'s reconciliation is allowed to throw and let the route answer 500). */
function parseCentsList(value: string | undefined): number[] {
  return parseIdList(value).map((entry) => Number.parseInt(entry, 10));
}

/** `kind: 'join'`: `refId` is a `memberships.id` (Task 1's `buildJoinStatements`). The session's
 *  metadata (`payments.ts`'s own `createCheckout` call site, Task 3) carries `enrollment_ids` and
 *  `covered_enrollment_ids` (both comma-joined `class_enrollments.id`s -- the covered list is a
 *  subset of the full list, the picks a class credit paid for), `grant_credits` (`'1'`/`'0'`:
 *  `'0'` on a welcome-back renewal, which never grants credits again), `purchaser_member_id`, and
 *  the checkout's own snapshotted cents (`dues_cents`, `paid_fee_cents` -- comma-joined, aligned
 *  one-to-one with the paid subset of `enrollment_ids` in that same order): the ledger lines below
 *  are built from these snapshotted amounts, never a re-read of `classes.fee`/`price_paid` at
 *  reconcile time, so a live price or fee change between checkout and webhook delivery can never
 *  desync the ledger from what Stripe actually charged.
 *
 *  Every mutation -- the session claim, the guarded membership flip, the credit grant, the
 *  credit-redemption and enrollment `fee_paid` flips, and the ledger transaction/lines -- composes
 *  into ONE `db.batch()`, the same atomicity `reconcileDonation` already uses (this module's own
 *  header): a combined checkout with several moving parts must not commit some of them and not
 *  others. Every READ (the membership row, then every referenced enrollment row in one bulk `IN`
 *  query) runs first; if the membership is already paid, this returns the existing no-op outcome
 *  before writing anything, and before checking anything else about the session -- a replay of an
 *  already-settled join is a clean no-op regardless of what its metadata says. Past that: every
 *  metadata-referenced enrollment must belong to a member of the membership's OWN household, or
 *  this refuses loudly and writes nothing (a forged or stale `refId` pointing at someone else's
 *  enrollment is never a partial write). The `UPDATE ... WHERE paid_at IS NULL` inside the batch
 *  stays as a belt alongside the read-first check above; the claim `INSERT`'s own primary key is
 *  what actually catches a genuinely concurrent double delivery, whose losing batch throws and
 *  propagates (the route answers 500 so Stripe retries; the retry then finds the membership
 *  already paid and no-ops via the read-first check).
 */
async function reconcileJoin(db: D1Database, env: ReconcileJoinEnv, refId: string, session: StripeCheckoutSession, memo: string | null): Promise<ReconcileOutcome> {
  const membership = await db
    .prepare('SELECT id, household_id, tier, season, paid_at FROM memberships WHERE id = ?1')
    .bind(refId)
    .first<MembershipReconcileRow>();
  if (!membership) return { ok: false, reason: `no such membership: ${refId}` };

  const amountTotalCents = requireAmountTotalCents(session);
  if (amountTotalCents === null) return { ok: false, reason: `session ${session.id} carries no amount_total` };

  const meta = session.metadata ?? {};
  const enrollmentIds = parseIdList(meta.enrollment_ids);
  const coveredIds = new Set(parseIdList(meta.covered_enrollment_ids));
  const paidIds = enrollmentIds.filter((id) => !coveredIds.has(id));
  const grantCredits = meta.grant_credits === '1';
  const purchaserMemberId = meta.purchaser_member_id ?? '';
  const duesCents = Number.parseInt(meta.dues_cents ?? '', 10);
  const paidFeeCents = parseCentsList(meta.paid_fee_cents);

  const enrollmentRows = await loadJoinEnrollments(db, enrollmentIds);

  if (membership.paid_at !== null) return { ok: true, reason: `membership ${refId} already paid; no-op` };

  for (const enrollmentId of enrollmentIds) {
    const row = enrollmentRows.get(enrollmentId);
    if (!row || row.household_id !== membership.household_id) {
      return { ok: false, reason: `enrollment ${enrollmentId} does not belong to membership ${refId}'s household` };
    }
  }

  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO processed_stripe_sessions (session_id, kind, ref_id) VALUES (?1, ?2, ?3)').bind(session.id, 'join', refId),
    db.prepare("UPDATE memberships SET paid_at = datetime('now'), stripe_ref = ?1 WHERE id = ?2 AND paid_at IS NULL").bind(session.id, refId),
  ];

  if (grantCredits) {
    statements.push(
      db
        .prepare('INSERT INTO credit_grants (id, household_id, membership_id, credits) VALUES (?1, ?2, ?3, ?4)')
        .bind(crypto.randomUUID(), membership.household_id, refId, CREDIT_GRANT_AMOUNT[membership.tier]),
    );
  }

  for (const enrollmentId of coveredIds) {
    statements.push(
      db
        .prepare('INSERT INTO credit_redemptions (id, household_id, enrollment_id, redeemed_by) VALUES (?1, ?2, ?3, ?4)')
        .bind(crypto.randomUUID(), membership.household_id, enrollmentId, purchaserMemberId),
      db.prepare('UPDATE class_enrollments SET fee_paid = 1 WHERE id = ?1').bind(enrollmentId),
    );
  }

  const paidLines: Array<{ enrollmentId: string; description: string; amountCents: number }> = paidIds.map((enrollmentId, index) => {
    statements.push(db.prepare('UPDATE class_enrollments SET fee_paid = 1, stripe_ref = ?1 WHERE id = ?2').bind(session.id, enrollmentId));
    const className = enrollmentRows.get(enrollmentId)?.class_name ?? 'class';
    return { enrollmentId, description: `${className} class fee`, amountCents: paidFeeCents[index] };
  });

  const itemDisplayName = `${TIER_LABEL[membership.tier]} Membership -- ${membership.season} season`;
  const { statements: ledgerStatements } = buildTransactionStatements(
    db,
    { kind: 'charge', source: 'stripe', occurredAt: toSqliteDatetime(new Date()), amountTotalCents, processorRef: session.id, householdId: membership.household_id, memo },
    [
      { item: 'dues', description: itemDisplayName, amountCents: duesCents, membershipId: refId },
      ...paidLines.map((line) => ({ item: 'class-fee' as const, description: line.description, amountCents: line.amountCents, enrollmentId: line.enrollmentId })),
    ],
  );
  statements.push(...ledgerStatements);

  await db.batch(statements);

  await writeAudit(db, 'membership', refId, `kind=join session=${session.id} tier=${membership.tier} season=${membership.season}`);

  const household = await db.prepare('SELECT name FROM households WHERE id = ?1').bind(membership.household_id).first<HouseholdNameRow>();
  const purchaser = purchaserMemberId
    ? await db.prepare('SELECT name, email FROM members WHERE id = ?1').bind(purchaserMemberId).first<MemberContactRow>()
    : null;

  const creditsGranted = grantCredits ? CREDIT_GRANT_AMOUNT[membership.tier] : 0;
  const creditStatus = creditsGranted > 0 ? `You have ${creditsGranted} class credit${creditsGranted === 1 ? '' : 's'} ready to use any time.` : '';
  const origin = env.PUBLIC_ORIGIN ?? '';

  if (purchaser?.email) {
    await sendClubEmail(db, env, {
      to: purchaser.email,
      templateId: 'join_welcome',
      vars: {
        person_name: purchaser.name,
        tier_label: TIER_LABEL[membership.tier],
        season: String(membership.season),
        credit_status: creditStatus,
        portal_url: `${origin}/my-account`,
        discord_url: `${origin}/discord-server/`,
        committee_email: 'membership-committee@aksailingclub.org',
      },
    });
  }

  const classesSummary = enrollmentIds.length > 0 ? enrollmentIds.map((id) => enrollmentRows.get(id)?.class_name ?? 'a class').join(', ') : 'none';
  await sendClubEmail(db, env, {
    to: BOARD_NOTIFICATION_EMAIL,
    templateId: 'board_join_notice',
    vars: {
      household_name: household?.name ?? '',
      tier_label: TIER_LABEL[membership.tier],
      season: String(membership.season),
      classes_summary: classesSummary,
    },
  });

  return { ok: true };
}

/**
 * Reconcile one `checkout.session.completed` session: dispatches to the `kind`-specific writer,
 * each of which mutates its own row, audits, and emails a receipt. For `dues`/`class-fee`/
 * `asset-fee`, the caller must have already called {@link claimStripeSession} and confirmed it
 * returned `true`, and neither ever throws -- a D1 error inside one of them surfaces as a
 * rejected promise the webhook route's own outer `try`/`catch` logs and still answers 200 for,
 * per that route's header on why a reconciliation failure must never become a 500 for those
 * kinds. `donation` and `join` are the two exceptions: each claims its session atomically as
 * part of its own `db.batch()` (`reconcileDonation`'s and `reconcileJoin`'s own headers), and a
 * rejected promise from either is meant to propagate so the route can answer 500 and let Stripe
 * retry.
 *
 * `memo` is the live-smoke marking convention (`docs/2026-07-15-payments-live-smoke-design.md`
 * section 4): `null` on every ordinary checkout, or `parseSessionMetadata`'s own `metadata.memo`
 * read when the smoke's own checkout carried one. Every writer folds it straight onto the
 * `transactions` row it writes (`ledger.ts`'s own `memo` column, migration `0021_money_ledger`);
 * no schema change and no behavior change when it is `null`.
 */
export async function reconcileCheckoutSession(
  db: D1Database,
  env: ReconcileJoinEnv,
  kind: PaymentKind,
  refId: string,
  session: StripeCheckoutSession,
  memo: string | null = null,
): Promise<ReconcileOutcome> {
  switch (kind) {
    case 'dues':
      return reconcileDues(db, env, refId, session, memo);
    case 'class-fee':
      return reconcileClassFee(db, env, refId, session, memo);
    case 'asset-fee':
      return reconcileAssetFee(db, env, refId, session, memo);
    case 'donation':
      return reconcileDonation(db, refId, session, memo);
    case 'join':
      return reconcileJoin(db, env, refId, session, memo);
  }
}
