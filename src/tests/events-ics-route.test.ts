// The events-redesign pass: /events/[id].ics's own `GET`, the per-event add-to-calendar endpoint.
// Same fakeD1 pattern as events-detail-route.test.ts.
import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { GET } from '../routes/(site)/events/[id].ics/+server';
import { fakeD1 } from './_fake-d1';

type RequestEvent = Parameters<typeof GET>[0];

function requestFor(id: string, db: unknown): RequestEvent {
  return { params: { id }, platform: { env: { CLUB_DB: db } } } as unknown as RequestEvent;
}

const DATED_ROW = {
  id: 'bnac-uuid',
  title: 'BNAC',
  slug: 'bnac',
  event_type: 'racing',
  start_date: '2026-10-09',
  start_time: null,
  end_date: '2026-10-11',
  end_time: null,
  date_history: null,
  location: null,
  short_description: null,
  long_description: null,
  hero_image: null,
  hero_image_alt: null,
  registration_url: null,
  registration_status: null,
  fee: null,
};

const TBD_ROW = { ...DATED_ROW, id: 'tbd-uuid', slug: 'tbd-event', title: 'TBD Event', start_date: null, end_date: null };

function dbWith(eventRows: unknown[]) {
  return fakeD1({
    allResults: {
      'FROM events WHERE visible': eventRows,
      'FROM classes WHERE visible': [],
    },
  }).db;
}

describe('/events/[id].ics GET', () => {
  it('503s when CLUB_DB is not bound', async () => {
    await expect(GET(requestFor('bnac', undefined))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 503,
    );
  });

  it('404s an unknown id', async () => {
    const db = dbWith([DATED_ROW]);
    await expect(GET(requestFor('no-such-event', db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('404s a genuinely TBD row (no start_date to schedule against)', async () => {
    const db = dbWith([TBD_ROW]);
    await expect(GET(requestFor('tbd-event', db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('serves exactly one VEVENT as a calendar attachment', async () => {
    const db = dbWith([DATED_ROW]);
    const response = await GET(requestFor('bnac', db));
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="bnac.ics"');
    const body = await response.text();
    expect(body).toContain('UID:bnac@aksailingclub.org');
    expect(body.indexOf('BEGIN:VEVENT', body.indexOf('BEGIN:VEVENT') + 1)).toBe(-1);
  });
});
