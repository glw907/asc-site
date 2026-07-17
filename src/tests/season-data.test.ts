import { describe, it, expect } from 'vitest';
import { buildSeasonMonths, loadSeasonHasLiveEvents, loadSeasonMonths, routeIdOf, seasonHasLiveEvents, splitSeasonColumns } from '$theme/season-data';
import type { SeasonMonth } from '$theme/season-data';
import { fakeD1 } from './_fake-d1';

const CURRENT_YEAR = 2026;

// A representative slice of the live asc-club rows this module reads, fixed here rather than
// fetched, so the taxonomy and grouping stay pinned even if the club's own live data changes.
function row(overrides: Partial<Parameters<typeof buildSeasonMonths>[0][number]>) {
  return {
    id: 'an-event-id',
    title: 'An event',
    slug: 'an-event',
    event_type: 'racing',
    start_date: null,
    end_date: null,
    date_history: null,
    ...overrides,
  };
}

describe('buildSeasonMonths', () => {
  it('marks a class or clinic with the gold dot, mission-first', () => {
    const [june] = buildSeasonMonths(
      [row({ title: 'Fleet Tune-Up Weekend', event_type: 'class', start_date: '2026-06-12', end_date: '2026-06-14' })],
      CURRENT_YEAR,
    );
    expect(june).toEqual({
      label: 'June',
      events: [{ dateRange: 'Jun 12–14', name: 'Fleet Tune-Up Weekend', routeId: 'an-event-id', dot: 'class' }],
    });
  });

  it('marks a racing event with the blue dot', () => {
    const [may] = buildSeasonMonths(
      [row({ title: 'Icebreaker Regatta', event_type: 'racing', start_date: '2026-05-24', end_date: '2026-05-24' })],
      CURRENT_YEAR,
    );
    expect(may.events[0]).toEqual({
      dateRange: 'May 24',
      name: 'Icebreaker Regatta',
      routeId: 'an-event',
      dot: 'racing',
    });
  });

  it('marks a social entry with the green dot', () => {
    const [may] = buildSeasonMonths(
      [row({ title: 'Icebreaker Potluck', event_type: 'social', start_date: '2026-05-23', end_date: '2026-05-23' })],
      CURRENT_YEAR,
    );
    expect(may.events[0].dot).toBe('social');
  });

  it.each(['operations', 'governance'])('marks a club-business "%s" entry with the gray dot', (eventType) => {
    const [may] = buildSeasonMonths(
      [row({ title: 'Spring Work Party', event_type: eventType, start_date: '2026-05-23', end_date: '2026-05-23' })],
      CURRENT_YEAR,
    );
    expect(may.events[0].dot).toBe('business');
  });

  it('groups May through September by name and drops an empty month', () => {
    const months = buildSeasonMonths(
      [
        row({ title: 'May event', start_date: '2026-05-10' }),
        row({ title: 'July event', start_date: '2026-07-10' }),
      ],
      CURRENT_YEAR,
    );
    expect(months.map((m) => m.label)).toEqual(['May', 'July']);
  });

  it('buckets everything outside May-September into one trailing Off-season group', () => {
    const months = buildSeasonMonths(
      [
        row({ title: 'BNAC', start_date: '2026-10-09', end_date: '2026-10-11' }),
        row({ title: 'Annual Meeting', event_type: 'governance', start_date: '2026-11-14' }),
      ],
      CURRENT_YEAR,
    );
    expect(months).toHaveLength(1);
    expect(months[0].label).toBe('Off-season');
    // Chronological, not insertion order.
    expect(months[0].events.map((e) => e.name)).toEqual(['BNAC', 'Annual Meeting']);
  });

  it('sorts within a month by day', () => {
    const [june] = buildSeasonMonths(
      [
        row({ title: 'Later', start_date: '2026-06-20' }),
        row({ title: 'Earlier', start_date: '2026-06-05' }),
      ],
      CURRENT_YEAR,
    );
    expect(june.events.map((e) => e.name)).toEqual(['Earlier', 'Later']);
  });

  it('formats a single-day, same-month, and cross-month range', () => {
    const months = buildSeasonMonths(
      [
        row({ title: 'One day', start_date: '2026-08-08', end_date: null }),
        row({ title: 'Same month', start_date: '2026-06-12', end_date: '2026-06-14' }),
        row({ title: 'Cross month', start_date: '2026-07-31', end_date: '2026-08-02' }),
      ],
      CURRENT_YEAR,
    );
    const byName = months.flatMap((m) => m.events).reduce<Record<string, string>>((acc, e) => {
      acc[e.name] = e.dateRange;
      return acc;
    }, {});
    expect(byName['One day']).toBe('Aug 8');
    expect(byName['Same month']).toBe('Jun 12–14');
    expect(byName['Cross month']).toBe('Jul 31–Aug 2');
  });

  it('reads a wrong-year end_date without exposing the year (a live data anomaly stays inert)', () => {
    const months = buildSeasonMonths(
      [row({ title: '2nd Adult Intro Class', event_type: 'class', start_date: '2026-07-09', end_date: '2016-07-12' })],
      CURRENT_YEAR,
    );
    expect(months.flatMap((m) => m.events)[0].dateRange).toBe('Jul 9–12');
  });

  it('gives an undated (TBD) event no crash and an off-season placement', () => {
    // row()'s own default event_type ('racing') now carries the blue dot (round-5 addendum), so
    // this fixture stays a real, mapped category rather than an artificial no-dot case.
    const months = buildSeasonMonths([row({ title: 'To be scheduled' })], CURRENT_YEAR);
    expect(months).toHaveLength(1);
    expect(months[0]).toEqual({
      label: 'Off-season',
      events: [{ dateRange: 'Date TBD', name: 'To be scheduled', routeId: 'an-event', dot: 'racing' }],
    });
  });

  it('falls back to date_history when there is no start_date at all', () => {
    const months = buildSeasonMonths(
      [
        row({
          title: 'Recurring regatta',
          start_date: null,
          date_history: JSON.stringify({ 2025: { start_date: '2025-06-01' }, 2024: { start_date: '2024-06-05' } }),
        }),
      ],
      CURRENT_YEAR,
    );
    // No start_date, so it lands by its most recent history entry's month (June), not dropped and
    // not miscategorized as off-season.
    expect(months[0].label).toBe('June');
  });

  it('returns no groups for an empty input', () => {
    expect(buildSeasonMonths([], CURRENT_YEAR)).toEqual([]);
  });
});

describe('routeIdOf', () => {
  it("routes a plain event on its (globally unique) slug", () => {
    expect(routeIdOf({ event_type: 'racing', slug: 'bnac', id: 'some-uuid' })).toBe('bnac');
  });

  it("routes a class on its id, since a class's slug is only unique within its season", () => {
    expect(routeIdOf({ event_type: 'class', slug: 'adult-intro', id: 'class-row-id' })).toBe('class-row-id');
  });
});

describe('splitSeasonColumns', () => {
  // A month with `count` placeholder events, only their number matters for balancing.
  function month(label: string, count: number): SeasonMonth {
    return {
      label,
      events: Array.from({ length: count }, (_, i) => ({
        dateRange: `${label} ${i + 1}`,
        name: `${label} event ${i + 1}`,
        routeId: `${label}-${i}`,
      })),
    };
  }

  it('keeps every month intact, never splitting one across columns', () => {
    const months = [month('May', 3), month('June', 5), month('July', 2)];
    const [left, right] = splitSeasonColumns(months);
    const allMonths = [...left, ...right];
    expect(allMonths.map((m) => m.label)).toEqual(['May', 'June', 'July']);
    for (const m of allMonths) {
      const original = months.find((om) => om.label === m.label);
      expect(m.events).toEqual(original?.events);
    }
  });

  it('preserves chronological order across both columns', () => {
    const months = [month('May', 4), month('June', 4), month('July', 4), month('August', 4)];
    const [left, right] = splitSeasonColumns(months);
    expect(left.map((m) => m.label)).toEqual(['May', 'June']);
    expect(right.map((m) => m.label)).toEqual(['July', 'August']);
  });

  it('balances an uneven distribution by total row count, not month count', () => {
    // May carries most of the season's rows; splitting by month count alone (2/2) would leave
    // column one far taller than column two. The nearest-to-half boundary puts May alone on the
    // left (10 rows) against June+July+August (3+2+1=6) rather than an even month-count split.
    const months = [month('May', 10), month('June', 3), month('July', 2), month('August', 1)];
    const [left, right] = splitSeasonColumns(months);
    expect(left.map((m) => m.label)).toEqual(['May']);
    expect(right.map((m) => m.label)).toEqual(['June', 'July', 'August']);
  });

  it('falls back to a single column for one month', () => {
    const months = [month('May', 3)];
    expect(splitSeasonColumns(months)).toEqual([months, []]);
  });

  it('falls back to a single (empty) column for no months', () => {
    expect(splitSeasonColumns([])).toEqual([[], []]);
  });

  it('guarantees at least one month per column when there are two or more months', () => {
    // All the weight is on the first month, so a naive "closest to half" search could otherwise
    // put every month on the left and leave the right column empty.
    const months = [month('May', 20), month('June', 1)];
    const [left, right] = splitSeasonColumns(months);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });
});

describe('loadSeasonMonths', () => {
  // A class row minted across three seasons under the same name (the MembershipWorks import's
  // own shape: a template class re-minted every rollover), keyed to the season the fake classes
  // query is bound with.
  const CLASS_ROWS_BY_SEASON: Record<number, { id: string; title: string; slug: string; event_type: string; start_date: string; end_date: string; date_history: null }[]> = {
    2024: [{ id: 'class-2024', title: 'Adult Intro', slug: 'adult-intro', event_type: 'class', start_date: '2024-06-12', end_date: '2024-06-14', date_history: null }],
    2025: [{ id: 'class-2025', title: 'Adult Intro', slug: 'adult-intro', event_type: 'class', start_date: '2025-06-12', end_date: '2025-06-14', date_history: null }],
    2026: [{ id: 'class-2026', title: 'Adult Intro', slug: 'adult-intro', event_type: 'class', start_date: '2026-06-12', end_date: '2026-06-14', date_history: null }],
  };
  const EVENT_ROWS = [{ id: 'bnac', title: 'BNAC', slug: 'bnac', event_type: 'racing', start_date: '2026-05-24', end_date: '2026-05-24', date_history: null }];

  it('filters historical class instances out, keeping only the current season row', async () => {
    const { db } = fakeD1({
      firstResults: { "FROM settings WHERE key = 'current_season'": { value: '2026' } },
      allResults: {
        'FROM events WHERE': EVENT_ROWS,
        'FROM classes WHERE': (args) => CLASS_ROWS_BY_SEASON[args[0] as number] ?? [],
      },
    });
    const months = await loadSeasonMonths(db, 2026);
    const names = months.flatMap((m) => m.events).map((e) => e.name);
    expect(names.filter((n) => n === 'Adult Intro')).toHaveLength(1);
    const june = months.find((m) => m.label === 'June');
    expect(june?.events.map((e) => e.routeId)).toEqual(['class-2026']);
  });

  it('returns no class rows (but still renders events) when current_season is unset', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM events WHERE': EVENT_ROWS,
        'FROM classes WHERE': (args) => CLASS_ROWS_BY_SEASON[args[0] as number] ?? [],
      },
    });
    const months = await loadSeasonMonths(db, 2026);
    const names = months.flatMap((m) => m.events).map((e) => e.name);
    expect(names).not.toContain('Adult Intro');
    expect(names).toContain('BNAC');
  });
});

describe('seasonHasLiveEvents', () => {
  const TODAY = new Date('2026-07-07T00:00:00Z');

  it('is true when a row starts today or later', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2026-07-07' })], TODAY)).toBe(true);
    expect(seasonHasLiveEvents([row({ start_date: '2026-09-05' })], TODAY)).toBe(true);
  });

  it('is false when every row is strictly in the past', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2026-07-06' })], TODAY)).toBe(false);
  });

  it('prefers end_date over start_date, so a multi-day event stays live through its last day', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2026-07-01', end_date: '2026-07-07' })], TODAY)).toBe(true);
    expect(seasonHasLiveEvents([row({ start_date: '2026-07-01', end_date: '2026-07-06' })], TODAY)).toBe(false);
  });

  it('counts a row with a null end_date on its start_date alone', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2026-07-07', end_date: null })], TODAY)).toBe(true);
  });

  it('never counts a genuinely undated (TBD) row toward liveness', () => {
    expect(seasonHasLiveEvents([row({ start_date: null, end_date: null })], TODAY)).toBe(false);
  });

  it('is true if any one row among several is live', () => {
    expect(
      seasonHasLiveEvents(
        [row({ start_date: '2026-01-01' }), row({ start_date: '2026-08-01' })],
        TODAY,
      ),
    ).toBe(true);
  });

  it('is false for an empty calendar', () => {
    expect(seasonHasLiveEvents([], TODAY)).toBe(false);
  });

  it('with no currentSeason bound, counts a future-year row live (the pre-fix, unscoped behavior)', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2027-05-01' })], TODAY)).toBe(true);
  });

  it('excludes a row dated a LATER season than currentSeason: next season entered early during off-season admin prep is not evidence the current season still has anything live', () => {
    expect(seasonHasLiveEvents([row({ start_date: '2027-05-01' })], TODAY, 2026)).toBe(false);
  });

  it('still counts a currentSeason-year row live when a later-season row is also present', () => {
    expect(
      seasonHasLiveEvents(
        [row({ start_date: '2027-05-01' }), row({ start_date: '2026-09-05' })],
        TODAY,
        2026,
      ),
    ).toBe(true);
  });
});

describe('loadSeasonHasLiveEvents', () => {
  const EVENT_ROWS = [{ id: 'bnac', title: 'BNAC', slug: 'bnac', event_type: 'racing', start_date: '2026-05-24', end_date: '2026-05-24', date_history: null }];
  const FUTURE_CLASS_ROWS = [{ id: 'class-2026', title: 'Adult Intro', slug: 'adult-intro', event_type: 'class', start_date: '2026-08-12', end_date: '2026-08-14', date_history: null }];

  it('reads true off a future class row for the current season', async () => {
    const { db } = fakeD1({
      firstResults: { "FROM settings WHERE key = 'current_season'": { value: '2026' } },
      allResults: { 'FROM events WHERE': EVENT_ROWS, 'FROM classes WHERE': FUTURE_CLASS_ROWS },
    });
    expect(await loadSeasonHasLiveEvents(db, new Date('2026-07-07T00:00:00Z'))).toBe(true);
  });

  it('reads false once every event and class is in the past', async () => {
    const { db } = fakeD1({
      firstResults: { "FROM settings WHERE key = 'current_season'": { value: '2026' } },
      allResults: { 'FROM events WHERE': EVENT_ROWS, 'FROM classes WHERE': FUTURE_CLASS_ROWS },
    });
    expect(await loadSeasonHasLiveEvents(db, new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });

  it('degrades to false (never throws) on a D1 read failure', async () => {
    const { db } = fakeD1({
      firstResults: {
        "FROM settings WHERE key = 'current_season'": () => {
          throw new Error('D1 unavailable');
        },
      },
    });
    expect(await loadSeasonHasLiveEvents(db, new Date('2026-07-07T00:00:00Z'))).toBe(false);
  });

  it('the season-rollover boundary: a next-year event entered during off-season admin prep does not pin the portal off the off-season state', async () => {
    // Reproduces the finding this scoping fixes: an admin enters next year's regatta in
    // December, well before `settings.current_season` itself rolls over. Without the
    // `currentSeason` bound, that one row would read as "live" year-round and the off-season
    // state (the reassure-and-anticipate window this exact scenario needs) would never be
    // reachable again until the season setting advances.
    const NEXT_SEASON_ROW = [{ id: 'frostbite-2027', title: 'Frostbite Regatta', slug: 'frostbite-2027', event_type: 'racing', start_date: '2027-05-01', end_date: null, date_history: null }];
    const { db } = fakeD1({
      firstResults: { "FROM settings WHERE key = 'current_season'": { value: '2026' } },
      allResults: { 'FROM events WHERE': NEXT_SEASON_ROW, 'FROM classes WHERE': [] },
    });
    expect(await loadSeasonHasLiveEvents(db, new Date('2026-12-15T00:00:00Z'))).toBe(false);
  });
});
