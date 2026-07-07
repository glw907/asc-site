// The refund-window-closing notice (Geoff, 2026-07-08, folded in mid-pass): the education page
// publishes a refund policy (cancel up to `getRefundWindowDays` days before a class's own
// `start_date` for a refund or a next-year voucher), and members forget deadlines, so this job
// warns a paid enrollee `getRefundNoticeLeadDays` days before that cutoff. Mirrors
// `class-reminders.ts`'s exact shape (a pure due-selection function, `class_reminders_sent`'s own
// per-enrollment once-marker, `sendClubEmail`, one `audit_log` row for the tick), narrowed to
// PAID enrollments only: `class_enrollments.fee_paid` is `class_enrollments`' own boolean flag for
// "a real fee was paid, not covered by a credit" (0001_substrate's own column comment), and a
// free-clinic or fully-credit-covered enrollee has nothing to refund.
import type { D1Database } from '@cloudflare/workers-types';
import { sendClubEmail } from '$admin-club/lib/club-email';
import { formatCivilDate } from '$admin-club/lib/ui';
import { getRefundWindowDays, getRefundNoticeLeadDays } from '$admin-club/lib/club-settings';
import { resolveClassContact } from '$admin-club/lib/class-contact';
import type { ClassTrack } from '$admin-club/lib/classes-store';
import type { Job, JobSummary } from './registry';

const TOUCH = 'refund_window_notice';
const TEMPLATE_ID = 'class_refund_window';
const COMMITTEE_EMAIL = 'program-committee@aksailingclub.org';

// TODO(portal-capstone): the actual withdraw/cancel action lives on the member portal's own
// my-classes screen, a different worktree's own build (per this job's own mid-pass dispatch: "if
// the withdraw-link target route isn't in your worktree, use the known path... with a TODO
// naming it"). This job links to the known path so the notice is never missing a next step; swap
// this constant for a real route (or import one) once that screen lands here.
const WITHDRAW_URL_PATH = '/my-account/classes';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Whether the refund-window notice is due for a class starting on `startDate`, given the Club's
 * own `refundWindowDays`/`noticeLeadDays` settings and `now`. The window is deliberately bounded
 * ABOVE by the cutoff itself, not just below: a cron gap that skips past the cutoff entirely
 * means the notice is now stale information (the window has already closed), so this answers
 * `false` rather than sending a "closing soon" notice about a deadline that has already passed.
 * Pure and D1-free (this module's own test suite).
 */
export function isRefundNoticeDue(startDate: Date, refundWindowDays: number, noticeLeadDays: number, now: Date): boolean {
  const cutoff = addDays(startDate, -refundWindowDays);
  const noticeAt = addDays(cutoff, -noticeLeadDays);
  return now >= noticeAt && now < cutoff;
}

interface ClassRow {
  id: string;
  name: string;
  track: ClassTrack;
  start_date: string;
}

function parseCivilDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

async function listScheduledClasses(db: D1Database): Promise<ClassRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, track, start_date FROM classes WHERE start_date IS NOT NULL')
    .all<ClassRow>();
  return results;
}

interface UnsentPaidEnrollmentRow {
  enrollment_id: string;
  member_id: string;
}

/** Every PAID (`fee_paid = 1`) participant of `classId` not yet marked sent for the
 *  `refund_window_notice` touch: the same anti-join shape `class-reminders.ts`'s own
 *  `listUnsentEnrollments` uses, narrowed by the paid filter this job alone needs. */
async function listUnsentPaidEnrollments(db: D1Database, classId: string): Promise<UnsentPaidEnrollmentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ce.id AS enrollment_id, ce.member_id AS member_id
       FROM class_enrollments ce
       LEFT JOIN class_reminders_sent crs ON crs.enrollment_id = ce.id AND crs.touch = ?2
       WHERE ce.class_id = ?1 AND ce.fee_paid = 1 AND crs.enrollment_id IS NULL`,
    )
    .bind(classId, TOUCH)
    .all<UnsentPaidEnrollmentRow>();
  return results;
}

async function markTouchSent(db: D1Database, enrollmentId: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO class_reminders_sent (enrollment_id, touch) VALUES (?1, ?2)')
    .bind(enrollmentId, TOUCH)
    .run();
}

export const classRefundWindowNoticeJob: Job = {
  name: 'class-refund-window-notice',

  async run(env, ctx) {
    const [refundWindowDays, noticeLeadDays, classes] = await Promise.all([
      getRefundWindowDays(ctx.db),
      getRefundNoticeLeadDays(ctx.db),
      listScheduledClasses(ctx.db),
    ]);

    let sent = 0;
    let classesDue = 0;

    for (const cls of classes) {
      const startDate = parseCivilDate(cls.start_date);
      if (!isRefundNoticeDue(startDate, refundWindowDays, noticeLeadDays, ctx.now)) continue;
      classesDue += 1;

      const cutoffDateDisplay = formatCivilDate(addDays(startDate, -refundWindowDays).toISOString().slice(0, 10));
      const unsent = await listUnsentPaidEnrollments(ctx.db, cls.id);
      for (const enrollment of unsent) {
        await markTouchSent(ctx.db, enrollment.enrollment_id);
        const contact = await resolveClassContact(ctx.db, enrollment.member_id, cls.track);
        if (!contact) continue;
        await sendClubEmail(ctx.db, env, {
          to: contact.email,
          templateId: TEMPLATE_ID,
          vars: {
            person_name: contact.name,
            item_display_name: cls.name,
            cutoff_date: cutoffDateDisplay,
            withdraw_url: `${env.PUBLIC_ORIGIN ?? ''}${WITHDRAW_URL_PATH}`,
            committee_email: COMMITTEE_EMAIL,
          },
        });
        sent += 1;
      }
    }

    const summary: JobSummary = {
      examined: classes.length,
      acted: sent,
      detail: `classes_in_notice_window=${classesDue} sends=${sent}`,
    };
    return summary;
  },
};
