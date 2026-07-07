// The events-redesign pass: /events/[id]'s own `load`. Mirrors class-signup-route.test.ts's
// fakeD1 pattern (both routes read CLUB_DB directly), keyed on the two SQL substrings
// `readEventRows` issues (`$theme/events-data.ts`'s EVENTS_QUERY/CLASSES_QUERY).
import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { load } from '../routes/(site)/events/[id]/+page.server';
import { fakeD1 } from './_fake-d1';

type LoadEvent = Parameters<typeof load>[0];
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

function eventFor(id: string, db: unknown): LoadEvent {
  return { params: { id }, platform: { env: { CLUB_DB: db } } } as unknown as LoadEvent;
}

async function runLoad(id: string, db: unknown): Promise<LoadResult> {
  return (await load(eventFor(id, db))) as LoadResult;
}

const EVENT_ROW = {
  id: 'bnac-uuid',
  title: 'BNAC',
  slug: 'bnac',
  event_type: 'racing',
  start_date: '2026-10-09',
  start_time: null,
  end_date: '2026-10-11',
  end_time: null,
  date_history: null,
  location: 'Big Lake',
  short_description: 'The season closer.',
  long_description: null,
  hero_image: null,
  hero_image_alt: null,
  registration_url: null,
  registration_status: null,
  fee: null,
};

const HIDDEN_EVENT_ROW = { ...EVENT_ROW, id: 'hidden-uuid', slug: 'hidden-event', title: 'Hidden Event' };

function dbWith(eventRows: unknown[], classRows: unknown[] = []) {
  return fakeD1({
    allResults: {
      'FROM events WHERE visible': eventRows,
      'FROM classes WHERE visible': classRows,
    },
  }).db;
}

describe('/events/[id] load', () => {
  it('503s when CLUB_DB is not bound', async () => {
    await expect(load(eventFor('bnac', undefined))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 503,
    );
  });

  it('404s an id matching no visible row', async () => {
    const db = dbWith([EVENT_ROW]);
    await expect(load(eventFor('no-such-event', db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('404s an invisible row: readEventRows\' own "visible = 1" filter excludes it before this route ever sees it', async () => {
    // fakeD1 stands in for the real query's own WHERE clause: an invisible row's id simply never
    // appears in the rows a real read would return, so this exercises the same 404 path.
    const db = dbWith([EVENT_ROW]); // HIDDEN_EVENT_ROW deliberately absent, standing in for visible = 0
    await expect(load(eventFor(HIDDEN_EVENT_ROW.slug, db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('returns the enriched card for a matching event row, keyed by slug', async () => {
    const db = dbWith([EVENT_ROW]);
    const result = await runLoad('bnac', db);
    expect(result.event.title).toBe('BNAC');
    expect(result.event.routeId).toBe('bnac');
    expect(result.event.location).toBe('Big Lake');
    expect(result.seo.links.find((link: { rel: string }) => link.rel === 'canonical')?.href).toContain('/events/bnac');
  });

  it('routes a class row on its id, not its slug', async () => {
    const classRow = {
      ...EVENT_ROW,
      id: 'class-row-id',
      slug: 'adult-intro',
      title: 'Adult Intro Class',
      event_type: 'class',
      fee: 100,
      registration_url: '/classes/class-row-id/signup',
      registration_status: 'open',
    };
    const db = dbWith([EVENT_ROW], [classRow]);
    const result = await runLoad('class-row-id', db);
    expect(result.event.title).toBe('Adult Intro Class');
    expect(result.event.fee).toBe(100);
    expect(result.event.registrationStatusLabel).toBe('Open');
  });

  it('computes prev/next along the season, undefined at either boundary', async () => {
    // BNAC (EVENT_ROW) is October; May and July sort ahead of it.
    const may = { ...EVENT_ROW, id: 'may-id', slug: 'may-event', title: 'May Event', start_date: '2026-05-10', end_date: null };
    const july = { ...EVENT_ROW, id: 'july-id', slug: 'july-event', title: 'July Event', start_date: '2026-07-10', end_date: null };
    const db = dbWith([may, EVENT_ROW, july]);

    const first = await runLoad('may-event', db);
    expect(first.prev).toBeUndefined();
    expect(first.next?.routeId).toBe('july-event');

    const middle = await runLoad('july-event', db);
    expect(middle.prev?.routeId).toBe('may-event');
    expect(middle.next?.routeId).toBe('bnac');

    const last = await runLoad('bnac', db);
    expect(last.prev?.routeId).toBe('july-event');
    expect(last.next).toBeUndefined();
  });
});
