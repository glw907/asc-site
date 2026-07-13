// Covers class-schedule-data.ts's whole lifecycle: every status the derivation can produce,
// the priority order where states collide (a finished drop-in clinic is Completed, not
// Drop-in), and the season-complete cue. Dates are fixed strings because the derivation takes
// "today" as an argument; no clock is involved.
import { describe, expect, it } from 'vitest';
import { buildClassSchedule, type ScheduleClassRow } from '../theme/class-schedule-data';

const TODAY = '2026-07-13';

function row(overrides: Partial<ScheduleClassRow> = {}): ScheduleClassRow {
  return {
    id: 'c1',
    name: 'Test Class',
    start_date: '2026-08-01',
    end_date: '2026-08-04',
    capacity: 10,
    drop_in: 0,
    enrolled: 0,
    queued: 0,
    ...overrides,
  };
}

function only(r: ScheduleClassRow, opens = '') {
  return buildClassSchedule([r], TODAY, opens, '2026').entries[0];
}

describe('buildClassSchedule status derivation', () => {
  it('marks a class with no dates as Dates TBD, with no action', () => {
    const e = only(row({ start_date: null, end_date: null }));
    expect(e.statusLabel).toBe('Dates TBD');
    expect(e.statusKind).toBe('muted');
    expect(e.action).toBeUndefined();
    expect(e.dateDisplay).toBe('Dates TBD');
  });

  it('marks a past class as Completed, even a full or drop-in one', () => {
    const plain = only(row({ start_date: '2026-06-18', end_date: '2026-06-21' }));
    expect(plain.statusLabel).toBe('Completed');
    expect(plain.statusKind).toBe('muted');
    expect(plain.action).toBeUndefined();

    const dropIn = only(row({ start_date: '2026-06-12', end_date: '2026-06-14', drop_in: 1 }));
    expect(dropIn.statusLabel).toBe('Completed');

    const full = only(row({ start_date: '2026-06-18', end_date: '2026-06-21', enrolled: 10 }));
    expect(full.statusLabel).toBe('Completed');
  });

  it('marks a class spanning today as In session, or Drop-in when drop-in', () => {
    const running = only(row({ start_date: '2026-07-11', end_date: '2026-07-14' }));
    expect(running.statusLabel).toBe('In session');
    expect(running.statusKind).toBe('info');

    const clinic = only(row({ start_date: '2026-07-11', end_date: '2026-07-14', drop_in: 1 }));
    expect(clinic.statusLabel).toBe('Drop-in');
    expect(clinic.note).toBe('Just show up!');
    expect(clinic.action).toBeUndefined();
  });

  it('marks a future drop-in clinic Drop-in with the note, never a Register link', () => {
    const e = only(row({ drop_in: 1 }));
    expect(e.statusLabel).toBe('Drop-in');
    expect(e.note).toBe('Just show up!');
    expect(e.action).toBeUndefined();
  });

  it('gates a future class behind the registration-opens date', () => {
    const e = only(row(), '2027-03-15');
    expect(e.statusLabel).toBe('Opens Mar 15');
    expect(e.statusKind).toBe('info');
    expect(e.action).toBeUndefined();
  });

  it('ignores a registration-opens date already passed, and an empty one', () => {
    expect(only(row(), '2026-03-15').statusLabel).toBe('Open');
    expect(only(row(), '').statusLabel).toBe('Open');
  });

  it('marks a class at capacity Full, with the waitlist door', () => {
    const e = only(row({ enrolled: 10 }));
    expect(e.statusLabel).toBe('Full');
    expect(e.statusKind).toBe('warning');
    expect(e.action).toEqual({ href: '/classes/c1/signup', label: 'Join waitlist' });
  });

  it('marks a class with a live queue Full even below capacity (the freed-spot rule)', () => {
    const e = only(row({ enrolled: 8, queued: 1 }));
    expect(e.statusLabel).toBe('Full');
    expect(e.action?.label).toBe('Join waitlist');
  });

  it('marks an open future class Open, with the Register door', () => {
    const e = only(row());
    expect(e.statusLabel).toBe('Open');
    expect(e.statusKind).toBe('success');
    expect(e.action).toEqual({ href: '/classes/c1/signup', label: 'Register' });
  });

  it('the drop-in gate outranks the registration-opens gate', () => {
    const e = only(row({ drop_in: 1 }), '2027-03-15');
    expect(e.statusLabel).toBe('Drop-in');
  });
});

describe('buildClassSchedule seasonComplete', () => {
  it('is true only when every class has dates and all have passed', () => {
    const done = buildClassSchedule(
      [
        row({ id: 'a', start_date: '2026-06-12', end_date: '2026-06-14' }),
        row({ id: 'b', start_date: '2026-07-09', end_date: '2026-07-12' }),
      ],
      TODAY,
      '',
      '2026',
    );
    expect(done.seasonComplete).toBe(true);

    const mixed = buildClassSchedule(
      [row({ id: 'a', start_date: '2026-06-12', end_date: '2026-06-14' }), row({ id: 'b' })],
      TODAY,
      '',
      '2026',
    );
    expect(mixed.seasonComplete).toBe(false);

    const tbd = buildClassSchedule(
      [row({ id: 'a', start_date: null, end_date: null })],
      TODAY,
      '',
      '2026',
    );
    expect(tbd.seasonComplete).toBe(false);
  });

  it('is false for an empty schedule', () => {
    expect(buildClassSchedule([], TODAY, '', '2026').seasonComplete).toBe(false);
  });
});

describe('buildClassSchedule pending', () => {
  it('marks a season with no class rows yet as pending (the post-rollover window)', () => {
    const s = buildClassSchedule([], TODAY, '', '2027');
    expect(s.pending).toBe(true);
    expect(s.season).toBe('2027');
  });

  it('is not pending once any class row exists, even a dateless one', () => {
    expect(buildClassSchedule([row({ start_date: null, end_date: null })], TODAY, '', '2027').pending).toBe(false);
  });
});

describe('buildClassSchedule date display', () => {
  it('formats a same-month range compactly and keeps months on a cross-month range', () => {
    expect(only(row({ start_date: '2026-06-12', end_date: '2026-06-14' })).dateDisplay).toBe('Jun 12–14');
    expect(only(row({ start_date: '2026-06-30', end_date: '2026-07-02' })).dateDisplay).toBe('Jun 30–Jul 2');
  });
});
