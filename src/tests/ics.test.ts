import { describe, it, expect } from 'vitest';
import { buildIcs } from '$theme/ics';
import type { EventDetailRow } from '$theme/events-data';

function row(overrides: Partial<EventDetailRow>): EventDetailRow {
  return {
    title: 'An event',
    slug: 'an-event',
    event_type: 'regatta',
    start_date: null,
    end_date: null,
    date_history: null,
    location: null,
    short_description: null,
    long_description: null,
    hero_image: null,
    hero_image_alt: null,
    registration_url: null,
    registration_status: null,
    ...overrides,
  };
}

const BASE_URL = 'https://dev.aksailingclub.org';

describe('buildIcs', () => {
  it('wraps the calendar in the standard VCALENDAR header', () => {
    const ics = buildIcs([], BASE_URL);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('X-WR-CALNAME:Alaska Sailing Club Events');
  });

  it('excludes a genuinely TBD row (no start_date) entirely', () => {
    const ics = buildIcs([row({ title: 'TBD Event', slug: 'tbd-event' })], BASE_URL);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('emits one VEVENT per dated row, DTEND exclusive for a single-day event', () => {
    const ics = buildIcs(
      [row({ title: 'Icebreaker Regatta', slug: 'icebreaker-regatta', start_date: '2026-05-24' })],
      BASE_URL,
    );
    expect(ics).toContain('UID:icebreaker-regatta@aksailingclub.org');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260524');
    expect(ics).toContain('DTEND;VALUE=DATE:20260525');
    expect(ics).toContain('SUMMARY:Icebreaker Regatta');
    expect(ics).toContain('URL:https://dev.aksailingclub.org/events/#icebreaker-regatta');
  });

  it('spans DTEND to the day after a multi-day end_date', () => {
    const ics = buildIcs(
      [row({ title: 'BNAC', slug: 'bnac', start_date: '2026-10-09', end_date: '2026-10-11' })],
      BASE_URL,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261009');
    expect(ics).toContain('DTEND;VALUE=DATE:20261012');
  });

  it('includes the short description, escaped, when present, and omits it otherwise', () => {
    const withDesc = buildIcs(
      [row({ title: 'A', slug: 'a', start_date: '2026-06-01', short_description: 'Bring gloves, drills.' })],
      BASE_URL,
    );
    expect(withDesc).toContain('DESCRIPTION:Bring gloves\\, drills.');

    const withoutDesc = buildIcs([row({ title: 'B', slug: 'b', start_date: '2026-06-02' })], BASE_URL);
    expect(withoutDesc).not.toContain('DESCRIPTION:');
  });
});
