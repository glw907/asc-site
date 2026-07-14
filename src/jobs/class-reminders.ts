// The class-reminder set (docs/2026-07-07-requirements-adversarial-review.md's item 2, "We'll
// follow up by email with anything you need before class / the weekend -- NO SENDER EXISTS",
// folded in as a mid-pass scope addition, Geoff 2026-07-08): a set of four touches per
// participant, not one. `welcome` fires synchronously from the enrollment action itself
// (`enrollments.ts`'s `signUpForClass`, `offers.ts`'s `claimOffer`), never this job; this module
// drives the other three, all keyed off a class's own `start_date`/`end_date`: `week_out` (~7
// days before start), `day_before` (the day before start), and `followup` (the day after the
// class ends). Mirrors `renewal-reminders.ts`'s exact shape (a pure due-selection function, a
// per-entity once-marker table, `sendClubEmail`, one `audit_log` row for the tick), one level
// finer: PER ENROLLMENT (a participant's own seat), not per household, and guardian-routed
// through `class-contact.ts` for a youth-track class.
import type { D1Database } from '@cloudflare/workers-types';
import { sendClubEmail } from '$admin-club/lib/club-email';
import { formatCivilDate } from '$admin-club/lib/ui';
import { resolveClassContact } from '$admin-club/lib/class-contact';
import type { ClassTrack } from '$admin-club/lib/classes-store';
import { UNLIMITED_SEND_BUDGET, type Job, type JobSummary } from './registry';

const JOB_NAME = 'class-reminders';

/** The three cron-driven touches this job drives (`welcome` is the fourth touch of the set, but
 *  fires synchronously elsewhere, never through this job -- see this module's own header). Shares
 *  `class_reminders_sent.touch`'s CHECK vocabulary (migration 0012_class_reminders) with
 *  `welcome` and `refund_window_notice` (`class-refund-window-notice.ts`), one table for every
 *  class-related send a future admin screen might want to read "has this participant received
 *  every touch" off of. */
export type ClassReminderTouch = 'week_out' | 'day_before' | 'followup';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A touch's own due date more than this many days in the past is never due, permanently (the
 *  2026-07-14 incident: the first cron tick after a member-data import found every touch for
 *  every scheduled class due at once and fired all of them). A future import, backfill, or long
 *  cron outage degrades to silence instead of a blast; a short outage (a missed day or two) still
 *  catches up normally, since a touch within the window still fires. */
const STALENESS_CUTOFF_DAYS = 10;

/** Whether `touchDate` is due at `now`: `now` has reached it, but not so long ago that the touch
 *  is stale (see {@link STALENESS_CUTOFF_DAYS}). */
function isDue(touchDate: Date, now: Date): boolean {
  return now >= touchDate && now <= addDays(touchDate, STALENESS_CUTOFF_DAYS);
}

/**
 * Which of a class's three cron touches are due, given its own `startDate`/`endDate` and `now`.
 * Pure and D1-free, so the offset rule is directly testable with plain `Date`s (this module's own
 * test suite). A class with no `startDate` at all (an unscheduled placeholder) has nothing to
 * derive a touch from and is never due for any of them.
 */
export function dueClassTouches(startDate: Date | null, endDate: Date | null, now: Date): ClassReminderTouch[] {
  if (!startDate) return [];
  const touches: ClassReminderTouch[] = [];
  if (isDue(addDays(startDate, -7), now)) touches.push('week_out');
  if (isDue(addDays(startDate, -1), now)) touches.push('day_before');
  const followupReference = endDate ?? startDate;
  if (isDue(addDays(followupReference, 1), now)) touches.push('followup');
  return touches;
}

const TOUCH_TEMPLATE_ID: Record<ClassReminderTouch, string> = {
  week_out: 'class_week_out',
  day_before: 'class_day_before',
  followup: 'class_followup',
};

const COMMITTEE_EMAIL = 'program-committee@aksailingclub.org';

interface ClassRow {
  id: string;
  name: string;
  track: ClassTrack;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
}

function parseCivilDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** Every class with a `start_date` set: the touch offsets have nothing to derive from otherwise
 *  (`dueClassTouches`'s own guard). Reads regardless of `visible`, since an already-enrolled
 *  participant's own reminders are not gated by whether the class still accepts new public
 *  signups. */
async function listScheduledClasses(db: D1Database): Promise<ClassRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, track, start_date, end_date, location FROM classes WHERE start_date IS NOT NULL')
    .all<ClassRow>();
  return results;
}

interface UnsentEnrollmentRow {
  enrollment_id: string;
  member_id: string;
}

/** Every enrolled participant of `classId` who has not yet been marked sent for `touch`: a `LEFT
 *  JOIN ... IS NULL` anti-join against `class_reminders_sent`, so a partial prior run (some
 *  participants sent, some not, from a mid-tick failure) is picked up correctly rather than
 *  re-deriving "already sent" from a class-level flag that assumes uniformity. */
async function listUnsentEnrollments(db: D1Database, classId: string, touch: ClassReminderTouch): Promise<UnsentEnrollmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ce.id AS enrollment_id, ce.member_id AS member_id
       FROM class_enrollments ce
       LEFT JOIN class_reminders_sent crs ON crs.enrollment_id = ce.id AND crs.touch = ?2
       WHERE ce.class_id = ?1 AND crs.enrollment_id IS NULL`,
    )
    .bind(classId, touch)
    .all<UnsentEnrollmentRow>();
  return results;
}

async function markTouchSent(db: D1Database, enrollmentId: string, touch: ClassReminderTouch): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO class_reminders_sent (enrollment_id, touch) VALUES (?1, ?2)')
    .bind(enrollmentId, touch)
    .run();
}

export const classRemindersJob: Job = {
  name: JOB_NAME,

  async run(env, ctx) {
    const budget = ctx.budget ?? UNLIMITED_SEND_BUDGET;
    const classes = await listScheduledClasses(ctx.db);
    let sent = 0;
    let touchesFired = 0;

    for (const cls of classes) {
      const startDate = cls.start_date ? parseCivilDate(cls.start_date) : null;
      const endDate = cls.end_date ? parseCivilDate(cls.end_date) : null;
      const due = dueClassTouches(startDate, endDate, ctx.now);
      if (due.length === 0) continue;

      for (const touch of due) {
        const unsent = await listUnsentEnrollments(ctx.db, cls.id, touch);
        if (unsent.length === 0) continue;
        touchesFired += 1;

        for (const enrollment of unsent) {
          // Marked sent regardless of whether the per-tick send cap below still has room: a
          // marked-but-unsent touch is an accepted tradeoff in a blast scenario (the enrollee
          // simply never gets that one touch, rather than the cap forcing a re-derivation of
          // "already attempted" some other way).
          await markTouchSent(ctx.db, enrollment.enrollment_id, touch);
          const contact = await resolveClassContact(ctx.db, enrollment.member_id, cls.track);
          if (!contact) continue;
          if (!(await budget.reserve(JOB_NAME))) continue;
          await sendClubEmail(ctx.db, env, {
            to: contact.email,
            templateId: TOUCH_TEMPLATE_ID[touch],
            vars: {
              person_name: contact.name,
              item_display_name: cls.name,
              start_date: cls.start_date ? formatCivilDate(cls.start_date) : 'TBD',
              location: cls.location ?? 'the usual spot',
              committee_email: COMMITTEE_EMAIL,
            },
          });
          sent += 1;
        }
      }
    }

    const summary: JobSummary = {
      examined: classes.length,
      acted: sent,
      detail: `touches_fired=${touchesFired} sends=${sent}`,
    };
    return summary;
  },
};
