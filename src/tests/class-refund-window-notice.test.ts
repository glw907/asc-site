import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { isRefundNoticeDue, classRefundWindowNoticeJob } from '../jobs/class-refund-window-notice';

const START = new Date('2026-09-01T00:00:00Z'); // cutoff = Aug 18 (14 days before), notice = Aug 15 (3 days before that)

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('isRefundNoticeDue (the approaching-cutoff window)', () => {
  it('is not yet due, before the notice window opens', () => {
    expect(isRefundNoticeDue(START, 14, 3, daysBefore(START, 20))).toBe(false); // Aug 12
  });

  it('is due at the notice-lead boundary (3 days before the 14-day cutoff)', () => {
    expect(isRefundNoticeDue(START, 14, 3, daysBefore(START, 17))).toBe(true); // Aug 15
  });

  it('is still due right up to (but not including) the cutoff itself', () => {
    expect(isRefundNoticeDue(START, 14, 3, daysBefore(START, 14.001))).toBe(true);
  });

  it('is no longer due once the cutoff itself has passed (stale information, not sent)', () => {
    expect(isRefundNoticeDue(START, 14, 3, daysBefore(START, 14))).toBe(false); // exactly the cutoff
    expect(isRefundNoticeDue(START, 14, 3, daysBefore(START, 5))).toBe(false); // well past it
  });
});

describe('classRefundWindowNoticeJob.run', () => {
  const CLASS_ROW = { id: 'cls-1', name: 'Keelboat Basics', track: 'adult-teen', start_date: '2026-09-01' };

  it('notifies every unsent PAID enrollee of a class in its notice window', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': [{ enrollment_id: 'enroll-1', member_id: 'mem-1' }],
      },
      firstResults: {
        "'refund_window_days'": { value: '14' },
        "'refund_notice_lead_days'": { value: '3' },
        'FROM members WHERE id': { name: 'Jamie', email: 'jamie@example.com', household_id: 'hh-1' },
        'FROM email_templates': {
          id: 'class_refund_window',
          subject: 'Your refund window is closing',
          reply_to: null,
          body: 'Hi {{person_name}}, {{item_display_name}} {{cutoff_date}} {{withdraw_url}} {{committee_email}}',
          updated_at: '2026-01-01 00:00:00',
          updated_by: 'authored:job-runner',
        },
      },
    });

    const summary = await classRefundWindowNoticeJob.run(
      { EMAIL: { send: async () => undefined }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      { db, now: daysBefore(START, 17) },
    );

    expect(summary).toEqual({ examined: 1, acted: 1, detail: 'classes_in_notice_window=1 sends=1' });
    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE INTO class_reminders_sent') && c.args[1] === 'refund_window_notice')).toBe(true);
    const send = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(send?.args[3]).toBe('jamie@example.com');
  });

  it('only counts a class as due within its notice window, and only queries paid enrollees for it', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW] },
      firstResults: { "'refund_window_days'": { value: '14' }, "'refund_notice_lead_days'": { value: '3' } },
    });

    const summary = await classRefundWindowNoticeJob.run({}, { db, now: daysBefore(START, 30) });
    expect(summary).toEqual({ examined: 1, acted: 0, detail: 'classes_in_notice_window=0 sends=0' });
    expect(calls.some((c) => c.sql.includes('fee_paid'))).toBe(false);
  });

  it('the enrollment query filters on fee_paid = 1', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': [],
      },
      firstResults: { "'refund_window_days'": { value: '14' }, "'refund_notice_lead_days'": { value: '3' } },
    });
    await classRefundWindowNoticeJob.run({}, { db, now: daysBefore(START, 17) });
    const enrollmentQuery = calls.find((c) => c.sql.includes('class_enrollments ce'));
    expect(enrollmentQuery?.sql).toContain('ce.fee_paid = 1');
  });
});
