// Proves the per-tick send cap (the reminder-blast guard rider, docs/plans/
// 2026-07-14-membership-admin.md's "Close ritual" step 0, part (b); the 2026-07-14 incident: a
// single tick fired 655 catch-up reminder sends, 471 past the account's own quota). Exercises the
// real `createSendBudget` (`../jobs/runner`) directly against `classRemindersJob.run`, the same
// way `runner.ts` itself wires a budget into a job's own `ctx`, so this proves the real
// integration rather than a parallel fake budget.
import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { classRemindersJob } from '../jobs/class-reminders';
import { createSendBudget, PER_TICK_SEND_CAP } from '../jobs/runner';

const START = new Date('2026-08-15T00:00:00Z');

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('the per-tick send cap', () => {
  it('a job that would send 60 stops at the cap and writes exactly one send_cap_hit audit row', async () => {
    const CLASS_ROW = { id: 'cls-1', name: 'Keelboat Basics', track: 'adult-teen', start_date: '2026-08-15', end_date: null, location: 'the boathouse' };
    const enrollments = Array.from({ length: 60 }, (_, i) => ({ enrollment_id: `enroll-${i}`, member_id: `mem-${i}` }));

    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': enrollments,
      },
      firstResults: {
        'FROM members WHERE id': { name: 'A Member', email: 'member@example.com', household_id: 'hh-1' },
        'FROM email_templates': {
          id: 'class_week_out',
          subject: 'A week out',
          reply_to: null,
          body: 'Hi {{person_name}}, {{item_display_name}} {{start_date}} {{location}} {{committee_email}}',
          updated_at: '2026-01-01 00:00:00',
          updated_by: 'authored:job-runner',
        },
      },
    });

    // Exactly one touch (week_out) is due at 7 days before start: day_before and followup are not
    // yet due, so every one of the 60 sends this test counts comes from that one touch.
    const budget = createSendBudget(db, PER_TICK_SEND_CAP);
    const summary = await classRemindersJob.run(
      { EMAIL: { send: async () => undefined } },
      { db, now: daysBefore(START, 7), budget },
    );

    expect(summary.detail).toBe(`touches_fired=1 sends=${PER_TICK_SEND_CAP}`);
    expect(summary.acted).toBe(PER_TICK_SEND_CAP);

    // Marking stays unaffected by the cap: every enrollee is still marked, even the ten past the
    // cap whose actual send never happens (the accepted blast-scenario tradeoff, documented at
    // class-reminders.ts's own send site).
    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO class_reminders_sent'));
    expect(marks).toHaveLength(60);

    const sends = calls.filter((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(sends).toHaveLength(PER_TICK_SEND_CAP);

    const capAudits = calls.filter((c) => c.sql.includes("'send_cap_hit'"));
    expect(capAudits).toHaveLength(1);
    expect(capAudits[0].args).toEqual(['system:cron', 'class-reminders', `cap=${PER_TICK_SEND_CAP} interrupted_job=class-reminders`]);
  });

  it('never writes a send_cap_hit row when every send fits under the cap', async () => {
    const CLASS_ROW = { id: 'cls-1', name: 'Keelboat Basics', track: 'adult-teen', start_date: '2026-08-15', end_date: null, location: 'the boathouse' };
    const enrollments = Array.from({ length: 5 }, (_, i) => ({ enrollment_id: `enroll-${i}`, member_id: `mem-${i}` }));

    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': enrollments,
      },
      firstResults: {
        'FROM members WHERE id': { name: 'A Member', email: 'member@example.com', household_id: 'hh-1' },
        'FROM email_templates': {
          id: 'class_week_out',
          subject: 'A week out',
          reply_to: null,
          body: 'Hi {{person_name}}, {{item_display_name}} {{start_date}} {{location}} {{committee_email}}',
          updated_at: '2026-01-01 00:00:00',
          updated_by: 'authored:job-runner',
        },
      },
    });

    const budget = createSendBudget(db, PER_TICK_SEND_CAP);
    const summary = await classRemindersJob.run(
      { EMAIL: { send: async () => undefined } },
      { db, now: daysBefore(START, 7), budget },
    );

    expect(summary.acted).toBe(5);
    expect(calls.some((c) => c.sql.includes("'send_cap_hit'"))).toBe(false);
  });
});
