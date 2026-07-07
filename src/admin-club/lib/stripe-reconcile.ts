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
// no-op" compare-and-set shape `offers.ts`'s `claimOffer` and `club-roles.ts`'s last-owner guard
// already use for an identical race. Neither guard alone would be wrong; carrying both costs one
// extra `WHERE` clause and closes a second, independent path to a double-reconcile (a stray direct
// write elsewhere marking the same row paid between the claim and this write).
//
// A reconciler never throws for an ordinary refusal (an unknown `refId`, an already-paid row): it
// answers `ReconcileOutcome`, the same never-throw convention `offers.ts` and `enrollments.ts`
// already establish for every public-facing write path, since a webhook reconciliation failure must
// never surface as an unhandled exception the route would have to turn into a 500 (the route's own
// header explains why a 500 here is worse than useless: Stripe retries a non-2xx delivery for up to
// three days, and a persistently-wrong `refId` can never self-heal from a retry).
import type { D1Database } from '@cloudflare/workers-types';
import { PAYMENT_KINDS, type PaymentKind } from './payments';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import { getCurrentSeason } from './club-settings';
import { formatClubTimestamp, formatDollars } from './ui';
import { toSqliteDatetime } from './offers';

/** The slice of a Stripe Checkout Session object this module actually reads: `amount_total` is
 *  the authoritative, Stripe-confirmed charge (cents), read from the event payload rather than
 *  recomputed from anything this site stored earlier, so a receipt always reflects what Stripe
 *  actually collected. */
export interface StripeCheckoutSession {
  id: string;
  amount_total: number | null;
  metadata: Record<string, string> | null | undefined;
}

/** `session.metadata.kind`/`session.metadata.refId`, validated: `null` for a session with no
 *  metadata, an unrecognized `kind`, or an empty `refId` (a malformed or foreign event the route
 *  answers 400 for, never a database write). */
export interface ParsedSessionMetadata {
  kind: PaymentKind;
  refId: string;
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
  return { kind, refId };
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
async function reconcileDues(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession): Promise<ReconcileOutcome> {
  const membership = await db
    .prepare('SELECT id, household_id, tier, season, paid_at FROM memberships WHERE id = ?1')
    .bind(refId)
    .first<MembershipReconcileRow>();
  if (!membership) return { ok: false, reason: `no such membership: ${refId}` };

  const update = await db
    .prepare("UPDATE memberships SET paid_at = datetime('now'), stripe_ref = ?1 WHERE id = ?2 AND paid_at IS NULL")
    .bind(session.id, refId)
    .run();
  if ((update.meta.changes ?? 0) !== 1) return { ok: true, reason: `membership ${refId} already paid; no-op` };

  await writeAudit(db, 'membership', refId, `kind=dues session=${session.id}`);

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
        item_display_name: `${TIER_LABEL[membership.tier]} Membership -- ${membership.season} season`,
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
async function reconcileClassFee(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession): Promise<ReconcileOutcome> {
  const enrollment = await db
    .prepare(
      `SELECT c.id AS class_id, c.name AS class_name, m.name AS member_name, m.email AS member_email
       FROM class_enrollments ce
       JOIN classes c ON c.id = ce.class_id
       JOIN members m ON m.id = ce.member_id
       WHERE ce.id = ?1`,
    )
    .bind(refId)
    .first<EnrollmentReconcileRow>();
  if (!enrollment) return { ok: false, reason: `no such class_enrollments row: ${refId}` };

  const update = await db
    .prepare('UPDATE class_enrollments SET fee_paid = 1, stripe_ref = ?1 WHERE id = ?2 AND fee_paid = 0')
    .bind(session.id, refId)
    .run();
  if ((update.meta.changes ?? 0) !== 1) return { ok: true, reason: `class_enrollments ${refId} fee already paid; no-op` };

  await writeAudit(db, 'enrollment', refId, `kind=class-fee session=${session.id} class=${enrollment.class_id}`);

  if (enrollment.member_email) {
    await sendClubEmail(db, env, {
      to: enrollment.member_email,
      templateId: 'stripe_payment_receipt',
      vars: {
        person_name: enrollment.member_name,
        item_display_name: `${enrollment.class_name} class fee`,
        ...receiptVars(session, 'program-committee@aksailingclub.org'),
      },
    });
  }
  return { ok: true };
}

interface AssignmentReconcileRow {
  asset_type_name: string;
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
async function reconcileAssetFee(db: D1Database, env: EmailBindingEnv, refId: string, session: StripeCheckoutSession): Promise<ReconcileOutcome> {
  const assignment = await db
    .prepare(
      `SELECT at.name AS asset_type_name, h.name AS household_name, pm.name AS primary_member_name, pm.email AS primary_member_email
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

  const season = await getCurrentSeason(db);
  const amountDollars = Math.round((session.amount_total ?? 0) / 100);
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

  if (assignment.primary_member_email) {
    await sendClubEmail(db, env, {
      to: assignment.primary_member_email,
      templateId: 'stripe_payment_receipt',
      vars: {
        person_name: assignment.primary_member_name ?? assignment.household_name,
        item_display_name: `${assignment.asset_type_name} fee -- ${season} season`,
        ...receiptVars(session, 'finance-committee@aksailingclub.org'),
      },
    });
  }
  return { ok: true };
}

/**
 * Reconcile one already-claimed `checkout.session.completed` session (the caller must have
 * already called {@link claimStripeSession} and confirmed it returned `true`): dispatches to the
 * `kind`-specific writer, each of which mutates its own row, audits, and emails a receipt. Never
 * throws (this module's own header): a D1 error inside a per-kind writer surfaces as a rejected
 * promise, which the webhook route's own outer `try`/`catch` logs and still answers 200, per that
 * route's header on why a reconciliation failure must never become a 500.
 */
export async function reconcileCheckoutSession(
  db: D1Database,
  env: EmailBindingEnv,
  kind: PaymentKind,
  refId: string,
  session: StripeCheckoutSession,
): Promise<ReconcileOutcome> {
  switch (kind) {
    case 'dues':
      return reconcileDues(db, env, refId, session);
    case 'class-fee':
      return reconcileClassFee(db, env, refId, session);
    case 'asset-fee':
      return reconcileAssetFee(db, env, refId, session);
  }
}
