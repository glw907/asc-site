// The public class signup/waitlist write path (Task 8): the only place a visitor's own submission
// (never an admin) lands a `class_enrollments` or `class_waitlist` row. `claimOffer` (offers.ts)
// is the other write path onto these two tables, for the separate case of a waitlisted person
// accepting an admin-offered spot later; this module is the FIRST signup, before any waitlist
// entry exists.
//
// A free-capacity signup enrolls immediately; a full class waitlists instead. Both branches also
// write a `waiver_acceptances` row in the same `db.batch()` (the gap analysis's item 1): the
// signer's acceptance of the current liability-release wording is atomic with their signup, never
// a second round-trip that could land one row without the other. Every write here audits as actor
// `'public:signup'` (offers.ts's own `'public:claim'`/`'public:decline'` convention, for the same
// reason: a public submission has no signed-in editor behind it, so `adminAction`'s `ctx.audit` is
// never available and this module writes its own `audit_log` row directly).
import type { D1Database } from '@cloudflare/workers-types';
import { getClassWithCounts } from './classes-store';

/** A signup's outcome: `'enrolled'` when the class had a free spot, `'waitlisted'` (with the new
 *  entry's queue position) when it was already full. */
export type SignUpResult = { outcome: 'enrolled' } | { outcome: 'waitlisted'; position: number };

/** A user-facing refusal (an unknown or invisible class, one not accepting signups), matching
 *  `offers.ts`'s own `OfferActionError` shape so every public write path in the Club section
 *  answers refusals the same way rather than throwing. */
export interface SignUpActionError {
  error: string;
}

/** The signup form's own submission, already schema-validated by its remote function. */
export interface SignUpForClassInput {
  classId: string;
  name: string;
  email: string;
  /** Optional: the schema's own only truly optional field. Asc-club's `class_enrollments` table
   *  carries no phone column at all (pre-2.2, a real member row does not exist yet to hold one;
   *  `guardian_contact` is a distinct youth-track field, not a general contact number), so an
   *  enrolled signup's phone has nowhere to persist as data and is folded into the audit detail
   *  instead, for a human reading the log, not for later querying. A waitlisted signup's phone
   *  DOES have a home (`class_waitlist.applicant_phone`), and is stored there in full. */
  phone?: string;
  /** The wording version to stamp the `waiver_acceptances` row with: the caller reads this from
   *  `club-settings.ts`'s `getWaiverTextVersion` at the moment of submission, never here. */
  waiverVersion: string;
}

/** The `waiver_acceptances` insert both branches below add to their own `db.batch()`: unlike
 *  `offers.ts`'s ctx-less writers, the audit row here rides in the SAME atomic batch as the
 *  primary mutation (not a separate best-effort write afterward), so a batch failure must
 *  propagate rather than be swallowed, or a visitor could be told "you're enrolled" when nothing
 *  actually committed. */
function waiverAcceptanceInsert(db: D1Database, input: SignUpForClassInput) {
  return db
    .prepare(
      `INSERT INTO waiver_acceptances (id, person_name, person_email, context, waiver_version)
       VALUES (?1, ?2, ?3, 'class-signup', ?4)`,
    )
    .bind(crypto.randomUUID(), input.name, input.email, input.waiverVersion);
}

/**
 * Sign up for a class: refuses when the class does not exist or is not visible (asc-club's
 * `classes` table carries no separate registration-open/closed column post-import, per
 * `ops-classes.mjs`'s own header, so "signup closed" collapses to "not visible" here, the schema's
 * only gating field). Otherwise enrolls immediately if the class has a free spot, or joins the
 * waitlist if it is already full; either branch also records the liability-release acceptance,
 * atomically with the signup, in the same `db.batch()`. A batch failure (a constraint violation,
 * a transient D1 error) surfaces as a refusal rather than a false "you're in" success.
 */
export async function signUpForClass(
  db: D1Database,
  input: SignUpForClassInput,
): Promise<SignUpResult | SignUpActionError> {
  const cls = await getClassWithCounts(db, input.classId);
  if (!cls || !cls.visible) return { error: 'This class is not open for signup.' };

  try {
    if (!cls.isFull) {
      const already = await db
        .prepare('SELECT 1 AS n FROM class_enrollments WHERE class_id = ?1 AND member_id = ?2')
        .bind(input.classId, input.email)
        .first<{ n: number }>();
      if (already) return { error: 'You are already enrolled in this class.' };

      const enrollmentId = crypto.randomUUID();
      const detail = input.phone ? `class=${input.classId} phone=${input.phone}` : `class=${input.classId}`;
      await db.batch([
        db
          .prepare('INSERT INTO class_enrollments (id, class_id, member_id) VALUES (?1, ?2, ?3)')
          .bind(enrollmentId, input.classId, input.email),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:signup', 'enroll', 'enrollment', enrollmentId, detail),
        waiverAcceptanceInsert(db, input),
      ]);

      return { outcome: 'enrolled' };
    }

    const alreadyWaitlisted = await db
      .prepare('SELECT 1 AS n FROM class_waitlist WHERE class_id = ?1 AND applicant_email = ?2')
      .bind(input.classId, input.email)
      .first<{ n: number }>();
    if (alreadyWaitlisted) return { error: 'You are already on the waitlist for this class.' };

    const positionRow = await db
      .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM class_waitlist WHERE class_id = ?1')
      .bind(input.classId)
      .first<{ next_position: number }>();
    const position = positionRow?.next_position ?? 1;

    const waitlistId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO class_waitlist (id, class_id, applicant_name, applicant_email, applicant_phone, position)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(waitlistId, input.classId, input.name, input.email, input.phone ?? null, position),
      db
        .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind('public:signup', 'waitlist', 'waitlist', waitlistId, `class=${input.classId} position=${position}`),
      waiverAcceptanceInsert(db, input),
    ]);

    return { outcome: 'waitlisted', position };
  } catch (err) {
    console.error('admin/club: class signup batch failed', err);
    return { error: 'Something went wrong recording your signup. You can email board@aksailingclub.org instead.' };
  }
}
