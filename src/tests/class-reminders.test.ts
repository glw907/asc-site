import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { dueClassTouches, classRemindersJob } from '../jobs/class-reminders';

const START = new Date('2026-08-15T00:00:00Z');
const END = new Date('2026-08-16T00:00:00Z');

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}
function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('dueClassTouches (the three cron-driven offsets)', () => {
  it('nothing is due more than a week before the start date', () => {
    expect(dueClassTouches(START, END, daysBefore(START, 8))).toEqual([]);
  });

  it('week_out fires exactly 7 days before the start date', () => {
    expect(dueClassTouches(START, END, daysBefore(START, 7))).toEqual(['week_out']);
  });

  it('week_out and day_before both fire 1 day before the start date', () => {
    expect(dueClassTouches(START, END, daysBefore(START, 1))).toEqual(['week_out', 'day_before']);
  });

  it('followup fires the day after end_date, alongside the earlier two', () => {
    expect(dueClassTouches(START, END, daysAfter(END, 1))).toEqual(['week_out', 'day_before', 'followup']);
  });

  it('followup falls back to start_date when there is no end_date', () => {
    expect(dueClassTouches(START, null, daysAfter(START, 1))).toEqual(['week_out', 'day_before', 'followup']);
  });

  it('a class with no start_date is never due for anything', () => {
    expect(dueClassTouches(null, END, new Date('2099-01-01'))).toEqual([]);
  });
});

describe('classRemindersJob.run', () => {
  const CLASS_ROW = { id: 'cls-1', name: 'Keelboat Basics', track: 'adult-teen', start_date: '2026-08-15', end_date: '2026-08-16', location: 'the boathouse' };

  it('sends the due touch to every unsent enrollee and marks each sent', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': [
          { enrollment_id: 'enroll-1', member_id: 'mem-1' },
          { enrollment_id: 'enroll-2', member_id: 'mem-2' },
        ],
      },
      firstResults: {
        'FROM members WHERE id': { name: 'Jamie', email: 'jamie@example.com', household_id: 'hh-1' },
        'FROM email_templates': {
          id: 'class_day_before',
          subject: 'Tomorrow',
          reply_to: null,
          body: 'Hi {{person_name}}, {{item_display_name}} {{start_date}} {{location}} {{committee_email}}',
          updated_at: '2026-01-01 00:00:00',
          updated_by: 'authored:job-runner',
        },
      },
    });

    // one day before the start date: week_out and day_before are both due.
    const summary = await classRemindersJob.run({ EMAIL: { send: async () => undefined } }, { db, now: daysBefore(START, 1) });

    expect(summary.examined).toBe(1);
    expect(summary.acted).toBe(4); // 2 touches (week_out, day_before) x 2 enrollees
    expect(summary.detail).toBe('touches_fired=2 sends=4');

    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO class_reminders_sent'));
    expect(marks).toHaveLength(4);
    const sends = calls.filter((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(sends).toHaveLength(4);
  });

  it('examines but does not act on a class with no touch due yet', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW] },
    });
    const summary = await classRemindersJob.run({}, { db, now: daysBefore(START, 30) });
    expect(summary).toEqual({ examined: 1, acted: 0, detail: 'touches_fired=0 sends=0' });
    expect(calls.some((c) => c.sql.includes('class_enrollments ce'))).toBe(false);
  });

  it('skips a touch with zero unsent enrollees (already fully sent, or none enrolled)', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM classes WHERE start_date IS NOT NULL': [CLASS_ROW],
        'FROM class_enrollments ce': [],
      },
    });
    const summary = await classRemindersJob.run({}, { db, now: daysAfter(END, 2) });
    expect(summary.acted).toBe(0);
    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE'))).toBe(false);
  });
});
