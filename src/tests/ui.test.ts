import { describe, expect, it } from 'vitest';
import { formatClubTimestamp, formatCivilDate, formatDollars } from '$admin-club/lib/ui';

describe('formatClubTimestamp', () => {
  it('renders in America/Anchorage, not the runtime\'s own (UTC, on a Worker) local zone', () => {
    // 2026-07-10T12:00:00Z is 04:00 in Anchorage (AKDT, UTC-8 under daylight saving), not the
    // UTC wall-clock a bare `undefined`-timezone formatter would print on a Cloudflare Worker,
    // whose runtime zone is UTC.
    expect(formatClubTimestamp('2026-07-10 12:00:00')).toContain('4:00');
    expect(formatClubTimestamp('2026-07-10 12:00:00')).not.toContain('12:00');
  });

  it('returns the raw string unparsed rather than "Invalid Date"', () => {
    expect(formatClubTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
  });
});

describe('formatCivilDate', () => {
  it('parses a bare calendar day at local midnight, never shifting a day west', () => {
    expect(formatCivilDate('2026-07-04')).toContain('Jul');
  });

  it('answers the fallback for a null date', () => {
    expect(formatCivilDate(null)).toBe('Not yet');
    expect(formatCivilDate(null, 'TBD')).toBe('TBD');
  });
});

describe('formatDollars', () => {
  it('formats a whole-dollar amount with no cents', () => {
    expect(formatDollars(100)).toBe('$100');
  });

  it('answers an em dash for a null amount', () => {
    expect(formatDollars(null)).toBe('—');
  });
});
