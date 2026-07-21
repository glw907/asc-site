// The same-price transfer flow (Classes pass Task 5, docs/2026-07-21-classes-pass-design.md): a
// student moves between classes in the current season with their payment following. A same-fee
// move proceeds on its own; a fee mismatch refuses (naming the exact difference) unless the
// caller explicitly confirms (`confirmFeeMismatch`), and the confirmed difference settles
// out-of-band -- this flow never charges or refunds anything itself (the design doc's own "no
// Stripe surgery" ruling). The enrollment ROW itself moves (`class_id` UPDATEd in place, its own
// `id` unchanged), so `fee_paid`, `stripe_ref`, `guardian_contact`, `interests`, and
// `enrolled_at` all carry across for free -- nothing here re-lists or re-copies them. The freed
// spot at the source runs through `offers.ts`'s own shared `triggerFreedSpotOffer`, the identical
// lookup-and-offer pair the admin's own `dropEnrollment` action already triggers (behind
// `$member-portal/lib/classes.ts`'s `withdrawFromClass`), never a second copy of that pairing. The
// destination may be over its own capacity: the design doc's own "soft capacity, admin override
// is normal life" ruling, so this never gates on it.
import type { D1Database } from '@cloudflare/workers-types';
import { getClassWithCounts } from './classes-store';
import { buildTransactionStatements } from './ledger';
import { triggerFreedSpotOffer } from './offers';
import { formatDollars } from './ui';
import type { EmailBindingEnv } from './club-email';
import type { DiscordBindingEnv } from './discord';

/** A user-facing refusal, matching every other Club store's `<Noun>ActionError` `{ error }` shape. */
export interface TransferActionError {
  error: string;
}

export interface TransferResult {
  ok: true;
  /** The waitlist entry the source's freed spot was auto-offered to, or `null` when its queue
   *  was empty or the auto-offer attempt itself failed (`triggerFreedSpotOffer`'s own contract:
   *  logged, never thrown -- the transfer already committed by the time this runs). */
  autoOfferedTo: string | null;
}

/**
 * Move one enrollment to `destinationClassId`. Refuses (never throws) an unknown enrollment, a
 * fee mismatch without `confirmFeeMismatch` (naming the exact difference), or a duplicate (the
 * destination class already holds this member) as a friendly error rather than surfacing the
 * schema's own `UNIQUE(class_id, member_id)` violation as a 500. On success, records a zero-
 * amount `void` ledger entry (no money moves; the memo carries the source, destination, and any
 * confirmed difference for the books) alongside the domain move in one atomic `db.batch()`, then
 * triggers the source's own freed-spot auto-offer.
 */
export async function transferEnrollment(
  db: D1Database,
  args: {
    enrollmentId: string;
    destinationClassId: string;
    actorEmail: string;
    confirmFeeMismatch?: boolean;
    notify?: { env: EmailBindingEnv & DiscordBindingEnv; origin: string };
  },
): Promise<TransferResult | TransferActionError> {
  const enrollment = await db
    .prepare(
      `SELECT e.id, e.class_id, e.member_id, m.household_id
       FROM class_enrollments e JOIN members m ON m.id = e.member_id
       WHERE e.id = ?1`,
    )
    .bind(args.enrollmentId)
    .first<{ id: string; class_id: string; member_id: string; household_id: string }>();
  if (!enrollment) return { error: 'No such enrollment.' };

  const [sourceClass, destinationClass] = await Promise.all([
    getClassWithCounts(db, enrollment.class_id),
    getClassWithCounts(db, args.destinationClassId),
  ]);
  if (!sourceClass) return { error: 'The source class no longer exists.' };
  if (!destinationClass) return { error: 'No such destination class.' };

  const duplicate = await db
    .prepare('SELECT 1 AS n FROM class_enrollments ce WHERE ce.class_id = ?1 AND ce.member_id = ?2 LIMIT 1')
    .bind(args.destinationClassId, enrollment.member_id)
    .first<{ n: number }>();
  if (duplicate) return { error: `Already enrolled in ${destinationClass.name}.` };

  if (destinationClass.fee !== sourceClass.fee && !args.confirmFeeMismatch) {
    return {
      error: `${sourceClass.name} is ${formatDollars(sourceClass.fee)}; ${destinationClass.name} is ${formatDollars(destinationClass.fee)}. Confirm to move anyway.`,
    };
  }

  const memo =
    destinationClass.fee === sourceClass.fee
      ? `Transfer: ${sourceClass.name} -> ${destinationClass.name}`
      : `Transfer: ${sourceClass.name} (${formatDollars(sourceClass.fee)}) -> ${destinationClass.name} (${formatDollars(destinationClass.fee)}), difference confirmed and settled out-of-band`;
  const { statements: ledgerStatements } = buildTransactionStatements(
    db,
    {
      kind: 'void',
      source: 'other',
      occurredAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      amountTotalCents: 0,
      householdId: enrollment.household_id,
      memo,
    },
    [],
  );
  await db.batch([
    db.prepare('UPDATE class_enrollments SET class_id = ?1 WHERE id = ?2').bind(args.destinationClassId, args.enrollmentId),
    ...ledgerStatements,
  ]);

  const autoOfferedTo = await triggerFreedSpotOffer(db, enrollment.class_id, { actorEmail: args.actorEmail, notify: args.notify });

  return { ok: true, autoOfferedTo };
}
