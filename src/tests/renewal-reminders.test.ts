import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { dueTouches, renewalRemindersJob } from '../jobs/renewal-reminders';

const EXPIRES_ON = new Date('2026-08-15T00:00:00Z');

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('dueTouches (the four-offset due-selection rule)', () => {
  it('is not yet due, more than 30 days before the boundary', () => {
    const now = daysBefore(EXPIRES_ON, 31);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual([]);
  });

  it('the 30-days-before touch fires exactly at day -30', () => {
    const now = daysBefore(EXPIRES_ON, 30);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual(['30_before']);
  });

  it('the 7-days-before touch fires alongside 30-before if neither has been sent yet', () => {
    const now = daysBefore(EXPIRES_ON, 7);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual(['30_before', '7_before']);
  });

  it('the day-of touch fires on the boundary itself', () => {
    const now = EXPIRES_ON;
    expect(dueTouches(EXPIRES_ON, now, new Set(['30_before', '7_before']))).toEqual(['day_of']);
  });

  it('the 30-days-after (final) touch fires 30 days past the boundary', () => {
    const now = daysAfter(EXPIRES_ON, 30);
    expect(dueTouches(EXPIRES_ON, now, new Set(['30_before', '7_before', 'day_of']))).toEqual(['30_after']);
  });

  it('never re-fires a touch already marked sent, even though it is still "due" by date', () => {
    const now = daysAfter(EXPIRES_ON, 60);
    const allSent = new Set(['30_before', '7_before', 'day_of', '30_after'] as const);
    expect(dueTouches(EXPIRES_ON, now, allSent)).toEqual([]);
  });

  it('returns every unsent touch whose date has passed, in cadence order (a cron gap)', () => {
    const now = daysAfter(EXPIRES_ON, 45);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual(['30_before', '7_before', 'day_of', '30_after']);
  });
});

describe('renewalRemindersJob.run', () => {
  const HOUSEHOLD = { household_id: 'hh-1', household_name: 'The Larsens', paid_at: '2025-08-15' };

  it('marks the due touch sent and sends through the renewal_reminder template for a resolvable contact', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h JOIN memberships m': [HOUSEHOLD],
        'FROM renewal_reminders_sent WHERE household_id': [],
      },
      firstResults: {
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        'FROM members WHERE id': { name: 'Jamie Larsen', email: 'jamie@example.com' },
        'FROM email_templates': {
          id: 'renewal_reminder',
          subject: 'Your Alaska Sailing Club membership',
          reply_to: 'membership-committee@aksailingclub.org',
          body: 'Hi {{person_name}}, {{message}} {{portal_url}} {{committee_email}}',
          updated_at: '2026-01-01 00:00:00',
          updated_by: 'authored:job-runner',
        },
      },
    });

    // 2026-08-15 is exactly the household's own renewal boundary (paid 2025-08-15 + one year):
    // the day-of touch is due, 30-before and 7-before are not yet marked sent so they are also
    // due (the "cron gap" ordering `dueTouches` itself already covers), all fire in one tick.
    const summary = await renewalRemindersJob.run(
      { EMAIL: { send: async () => undefined }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      { db, now: new Date('2026-08-15T00:00:00Z') },
    );

    expect(summary.examined).toBe(1);
    expect(summary.acted).toBe(3);

    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO renewal_reminders_sent'));
    expect(marks.map((m) => m.args[1])).toEqual(['30_before', '7_before', 'day_of']);

    const sends = calls.filter((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(sends).toHaveLength(3);
    expect(sends.every((s) => s.args[3] === 'jamie@example.com')).toBe(true);
  });

  it('marks the touch sent but attempts no email when the household has no contactable member', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h JOIN memberships m': [HOUSEHOLD],
        'FROM renewal_reminders_sent WHERE household_id': [],
      },
      firstResults: {
        'FROM households WHERE id': { primary_member_id: null },
        'FROM members WHERE household_id': null,
      },
    });

    const summary = await renewalRemindersJob.run({}, { db, now: new Date('2026-08-15T00:00:00Z') });

    expect(summary.acted).toBe(0);
    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE INTO renewal_reminders_sent'))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO email_log'))).toBe(false);
  });

  it('examines but does not act on a household with no touch due yet', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h JOIN memberships m': [{ household_id: 'hh-2', household_name: 'The Kims', paid_at: '2026-07-01' }],
        'FROM renewal_reminders_sent WHERE household_id': [],
      },
    });

    const summary = await renewalRemindersJob.run({}, { db, now: new Date('2026-07-07T00:00:00Z') });

    expect(summary).toEqual({ examined: 1, acted: 0, detail: expect.stringContaining('households_with_a_due_touch=0') });
    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE'))).toBe(false);
  });
});
