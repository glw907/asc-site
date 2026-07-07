// The public class signup/waitlist write path (Task 8): the only place a visitor's own submission
// (never an admin) lands a `class_enrollments` or `class_waitlist` row. `claimOffer` (offers.ts)
// is the other write path onto these two tables, for the separate case of a waitlisted person
// accepting an admin-offered spot later; this module is the FIRST signup, before any waitlist
// entry exists.
//
// A free-capacity signup enrolls immediately; a full class waitlists instead. The enrolled branch
// resolves a real `members.id` through `ensureMember` (migration 0005_member_domain's arrival)
// before writing `class_enrollments.member_id`, and passes the signup's own phone along: an
// enrolled signup's phone finally has a real home (`members.phone`) on the create path, where pre-
// 0005 there was no column for it at all. The waitlist branch is deliberately NOT a member lookup:
// a public waitlist join may not be a member yet, and `class_waitlist.member_id` stays NULL with
// the person identified by `applicant_name`/`applicant_email`/`applicant_phone` instead (the
// table's own CHECK, `(member_id IS NOT NULL) OR (applicant_email IS NOT NULL)`, already allows
// this). Both branches also write a `waiver_acceptances` row in the same `db.batch()` (the gap
// analysis's item 1): the signer's acceptance of the current liability-release wording is atomic
// with their signup, never a second round-trip that could land one row without the other. Every
// write here audits as actor `'public:signup'` (offers.ts's own `'public:claim'`/`'public:decline'`
// convention, for the same reason: a public submission has no signed-in editor behind it, so
// `adminAction`'s `ctx.audit` is never available and this module writes its own `audit_log` row
// directly).
import type { D1Database } from '@cloudflare/workers-types';
import { getClassWithCounts } from './classes-store';
import { ensureMember } from './people';
import { sendClassWelcomeEmail } from './class-welcome';
import type { EmailBindingEnv } from './club-email';

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
  /** Optional: the schema's own only truly optional field. An enrolled signup's phone now has a
   *  real home, `members.phone`, written by `ensureMember` when it creates a fresh member row
   *  (migration 0005_member_domain's arrival; `guardian_contact` stays a distinct youth-track
   *  field, not a general contact number, and is never folded from this). It is still never
   *  folded into the audit log (a phone number is PII with no place in a log meant to be safe to
   *  read and paste, per `docs/reference/log-events.md`'s own convention). A waitlisted signup's
   *  phone has its own separate home, `class_waitlist.applicant_phone`, and is stored there in
   *  full regardless of member status. */
  phone?: string;
  /** The wording version to stamp the `waiver_acceptances` row with: the caller reads this from
   *  `club-settings.ts`'s `getWaiverTextVersion` at the moment of submission, never here. */
  waiverVersion: string;
}

/** `signUpForClass`'s optional welcome-email trigger (the class-reminder set's own `welcome`
 *  touch, `class-welcome.ts`'s own header): `undefined` when the caller has no EMAIL binding
 *  wired, in which case the enrolled branch skips the attempt entirely (never blocks or fails the
 *  signup itself either way). */
export type SignUpNotify = EmailBindingEnv;

/** True when `err` is a SQLite `UNIQUE` constraint failure naming `table`: the shape both a
 *  concurrent double-enrollment (`class_enrollments`'s own uniqueness) and a concurrent double-
 *  waitlist-join (`class_waitlist`'s own `uq_waitlist_class_email` index, migration
 *  0004_waitlist_integrity) throw when two submissions of the same form race each other past the
 *  pre-check `SELECT` above and both reach the `INSERT`. D1 error messages are plain strings, not
 *  a typed error code, so this is a substring match rather than an `instanceof` check. */
function isUniqueViolation(err: unknown, table: string): boolean {
  return err instanceof Error && err.message.includes('UNIQUE') && err.message.includes(table);
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
 * a transient D1 error) surfaces as a refusal rather than a false "you're in" success. An
 * immediate enrollment also sends the class-reminder set's own `welcome` touch (best-effort,
 * after the batch has committed, `notify` optional) -- a waitlist join has no enrollment yet to
 * welcome, so the waitlist branch never touches `notify` at all.
 */
export async function signUpForClass(
  db: D1Database,
  input: SignUpForClassInput,
  notify?: SignUpNotify,
): Promise<SignUpResult | SignUpActionError> {
  const cls = await getClassWithCounts(db, input.classId);
  if (!cls || !cls.visible) return { error: 'This class is not open for signup.' };

  try {
    if (!cls.isFull) {
      const member = await ensureMember(db, { name: input.name, email: input.email, phone: input.phone });

      const already = await db
        .prepare('SELECT 1 AS n FROM class_enrollments WHERE class_id = ?1 AND member_id = ?2 LIMIT 1')
        .bind(input.classId, member.memberId)
        .first<{ n: number }>();
      if (already) return { error: 'You are already enrolled in this class.' };

      const enrollmentId = crypto.randomUUID();
      const detail = `class=${input.classId}`;
      await db.batch([
        db
          .prepare('INSERT INTO class_enrollments (id, class_id, member_id) VALUES (?1, ?2, ?3)')
          .bind(enrollmentId, input.classId, member.memberId),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:signup', 'enroll', 'enrollment', enrollmentId, detail),
        waiverAcceptanceInsert(db, input),
      ]);

      await sendClassWelcomeEmail(db, notify, {
        enrollmentId,
        className: cls.name,
        track: cls.track,
        memberId: member.memberId,
      });

      return { outcome: 'enrolled' };
    }

    const alreadyWaitlisted = await db
      .prepare('SELECT 1 AS n FROM class_waitlist WHERE class_id = ?1 AND applicant_email = ?2 LIMIT 1')
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
    // A race lost to the pre-check above (two submissions of the same form, both past the
    // "already enrolled/waitlisted?" read before either INSERT lands) surfaces as the same clean
    // refusal the pre-check itself gives, rather than the generic fallback below.
    if (isUniqueViolation(err, 'class_enrollments')) return { error: 'You are already enrolled in this class.' };
    if (isUniqueViolation(err, 'class_waitlist')) return { error: 'You are already on the waitlist for this class.' };
    console.error('admin/club: class signup batch failed', err);
    return { error: 'Something went wrong recording your signup. You can email board@aksailingclub.org instead.' };
  }
}
