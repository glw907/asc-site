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

  it('the 7-days-before touch fires alone when 30-before is already stale (the staleness cutoff)', () => {
    // At day -7, 30-before's own due date (day -30) is 23 days in the past -- past the 10-day
    // cutoff -- so it is silently dropped rather than fired as a late catch-up.
    const now = daysBefore(EXPIRES_ON, 7);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual(['7_before']);
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

  it('a short cron gap (a day or two) still catches up more than one nearby due touch', () => {
    // 2 days after the boundary: day_of (due at day 0) and 7_before (due at day -7, 9 days in the
    // past) are both still within the cutoff; 30_before (due at day -30) is not.
    const now = daysAfter(EXPIRES_ON, 2);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual(['7_before', 'day_of']);
  });

  it('a long-stale cron gap sends nothing at all (the 2026-07-14 incident shape)', () => {
    const now = daysAfter(EXPIRES_ON, 45);
    expect(dueTouches(EXPIRES_ON, now, new Set())).toEqual([]);
  });

  it('the 30-after touch still fires 9 days past its own due date', () => {
    const now = daysAfter(EXPIRES_ON, 39); // 30-after's own due date is day 30; +9 = day 39.
    const alreadySent = new Set(['30_before', '7_before', 'day_of'] as const);
    expect(dueTouches(EXPIRES_ON, now, alreadySent)).toEqual(['30_after']);
  });

  it('the 30-after touch never fires once more than 10 days past its own due date', () => {
    const now = daysAfter(EXPIRES_ON, 41); // 30-after's own due date is day 30; +11 = day 41.
    const alreadySent = new Set(['30_before', '7_before', 'day_of'] as const);
    expect(dueTouches(EXPIRES_ON, now, alreadySent)).toEqual([]);
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
    // the day-of touch is due, and 7-before is not yet marked sent so it is also due (the "cron
    // gap" ordering `dueTouches` itself already covers). 30-before's own due date is 30 days in
    // the past at this point -- past the staleness cutoff -- so it is silently dropped rather
    // than fired as a late catch-up.
    const summary = await renewalRemindersJob.run(
      { EMAIL: { send: async () => undefined }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      { db, now: new Date('2026-08-15T00:00:00Z') },
    );

    expect(summary.examined).toBe(1);
    expect(summary.acted).toBe(2);

    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO renewal_reminders_sent'));
    expect(marks.map((m) => m.args[1])).toEqual(['7_before', 'day_of']);

    const sends = calls.filter((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(sends).toHaveLength(2);
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

  it('a mark for the CURRENT cycle boundary suppresses that touch (migration 0024)', async () => {
    // The household's boundary this cycle is 2026-08-15 (paid 2025-08-15 + one year). The fake
    // `renewal_reminders_sent` responder mirrors the real column filter: it only returns the
    // stored 'day_of' mark when queried with THAT boundary, exactly what
    // `alreadySentTouches`'s own `AND expires_on = ?2` does against real D1.
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h JOIN memberships m': [HOUSEHOLD],
        'FROM renewal_reminders_sent WHERE household_id': (args: unknown[]) =>
          args[1] === '2026-08-15' ? [{ touch: 'day_of' }] : [],
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

    const summary = await renewalRemindersJob.run(
      { EMAIL: { send: async () => undefined }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      { db, now: new Date('2026-08-15T00:00:00Z') },
    );

    // day_of is suppressed by its own mark; 7_before is not marked for this boundary and fires.
    expect(summary.acted).toBe(1);
    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO renewal_reminders_sent'));
    expect(marks.map((m) => m.args[1])).toEqual(['7_before']);
  });

  it('the same touch name fires again for a LATER cycle boundary (a renewed household)', async () => {
    // The household renewed: its own boundary this cycle is 2027-08-01 (a fresh paid_at), but
    // `renewal_reminders_sent` still carries a 'day_of' mark stamped with the OLD boundary
    // (2026-08-15, from a prior cycle -- migration 0024's own backfill leaves exactly this shape
    // for a household that has renewed since its last mark). The fake responder mirrors the real
    // column filter: queried with the NEW boundary, that old mark never matches.
    const RENEWED_HOUSEHOLD = { household_id: 'hh-1', household_name: 'The Larsens', paid_at: '2026-08-01' };
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h JOIN memberships m': [RENEWED_HOUSEHOLD],
        'FROM renewal_reminders_sent WHERE household_id': (args: unknown[]) =>
          args[1] === '2026-08-15' ? [{ touch: 'day_of' }] : [],
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

    // 2027-08-01 is exactly the renewed boundary: day_of (whose name was already marked once,
    // under the OLD boundary) fires again, alongside 7_before (also freshly due, unmarked for
    // this cycle) -- this cycle carries no mark of its own for either touch, since the OLD mark
    // belongs to the 2026-08-15 boundary, a different cycle key.
    const summary = await renewalRemindersJob.run(
      { EMAIL: { send: async () => undefined }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      { db, now: new Date('2027-08-01T00:00:00Z') },
    );

    expect(summary.acted).toBe(2);
    const marks = calls.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO renewal_reminders_sent'));
    expect(marks.map((m) => m.args[1])).toEqual(['7_before', 'day_of']);
    expect(marks.map((m) => m.args[2])).toEqual(['2027-08-01', '2027-08-01']);
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
