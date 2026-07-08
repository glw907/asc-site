import { describe, it, expect } from 'vitest';
import { buildSeasonMonths, routeIdOf } from '$theme/season-data';

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

  it('keeps a racing event plain ink: no dot at all', () => {
    const [may] = buildSeasonMonths(
      [row({ title: 'Icebreaker Regatta', event_type: 'racing', start_date: '2026-05-24', end_date: '2026-05-24' })],
      CURRENT_YEAR,
    );
    expect(may.events[0]).toEqual({
      dateRange: 'May 24',
      name: 'Icebreaker Regatta',
      routeId: 'an-event',
      dot: undefined,
    });
  });

  it('marks a social entry with the sage dot', () => {
    const [may] = buildSeasonMonths(
      [row({ title: 'Icebreaker Potluck', event_type: 'social', start_date: '2026-05-23', end_date: '2026-05-23' })],
      CURRENT_YEAR,
    );
    expect(may.events[0].dot).toBe('social');
  });

  it.each(['operations', 'governance'])('marks a club-business "%s" entry with the slate dot', (eventType) => {
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
    const months = buildSeasonMonths([row({ title: 'To be scheduled' })], CURRENT_YEAR);
    expect(months).toHaveLength(1);
    expect(months[0]).toEqual({
      label: 'Off-season',
      events: [{ dateRange: 'Date TBD', name: 'To be scheduled', routeId: 'an-event', dot: undefined }],
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
