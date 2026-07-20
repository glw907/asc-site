import { describe, expect, it } from 'vitest';
import { load, type ClassWaitlistOverviewRow } from '../routes/admin/club/classes/waitlist/+page.server';
import { fakeD1 } from './_fake-d1';
import { editorWithRole } from './_editor';

// The cross-class Class waitlist overview's own load (pass B T4,
// docs/2026-07-19-asc-sidebar-build.md): proves the season filter, the freed-seat flag, and the
// active-offer pairing against the real `classes`/`class_waitlist`/`class_offers` shapes, plus
// the lazy sweep and the missing-binding degrade every other Club load already carries.

type LoadEvent = Parameters<typeof load>[0];
/** `PageServerLoad`'s declared type allows `void` (a load may return nothing, to inherit parent
 *  data); this route's own `load` never does, so tests that read fields off the result narrow it
 *  away here rather than repeating the cast at every call site (the same recipe
 *  `class-offer-route.test.ts` already uses). */
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

function eventFor(db: unknown): LoadEvent {
  return {
    locals: { editor: editorWithRole('Club manager') },
    platform: { env: { CLUB_DB: db } },
  } as unknown as LoadEvent;
}

async function runLoad(db: unknown): Promise<LoadResult> {
  return (await load(eventFor(db))) as LoadResult;
}

const OPEN_CLASS_ROW = {
  id: 'fleet-tune-up-weekend',
  season: 2026,
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  custom_note: null,
  hero_image: null,
  hero_image_alt: null,
  visible: 1 as const,
  drop_in: 0 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  enrolled_count: 5, // under capacity(10): a freed seat
  waitlist_count: 1,
};

const FULL_CLASS_ROW = {
  ...OPEN_CLASS_ROW,
  id: 'youth-racing-clinic',
  name: 'Youth Racing Clinic',
  season: 2026,
  capacity: 8,
  enrolled_count: 8, // at capacity: not a freed seat, ordinary queued case
  waitlist_count: 1,
};

const LAST_SEASON_ROW = {
  ...OPEN_CLASS_ROW,
  id: 'old-clinic',
  name: 'Old Clinic',
  season: 2025,
  waitlist_count: 2,
};

const NO_WAITLIST_ROW = {
  ...OPEN_CLASS_ROW,
  id: 'no-queue-class',
  name: 'No Queue Class',
  waitlist_count: 0,
};

const WAITLIST_ENTRY = {
  id: 'wait-1',
  class_id: OPEN_CLASS_ROW.id,
  member_id: null,
  applicant_name: 'Jamie Rivera',
  applicant_email: 'jamie@example.com',
  applicant_phone: null,
  position: 1,
  requested_at: '2026-05-01 00:00:00',
  notes: null,
};

describe('/admin/club/classes/waitlist load', () => {
  it('returns an honest error and no rows when CLUB_DB is not bound', async () => {
    const result = await runLoad(undefined);
    expect(result).toEqual({ rows: [], error: 'CLUB_DB is not bound.' });
  });

  it('lists only current-season classes with a nonempty waitlist, dropping other seasons and ' +
    'empty-waitlist classes', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_ROW, LAST_SEASON_ROW, NO_WAITLIST_ROW],
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM class_waitlist WHERE class_id': [WAITLIST_ENTRY],
      },
    });
    const result = await runLoad(db);
    expect(result.error).toBeNull();
    expect(result.rows.map((row: ClassWaitlistOverviewRow) => row.cls.id)).toEqual([OPEN_CLASS_ROW.id]);
  });

  it('sweeps stale offers before reading, so a past-expiry offer never counts as active', async () => {
    const { db, calls } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM class_offers WHERE resolved IS NULL AND expires_at': [
          { token: 'hash-a', waitlist_id: 'wait-a' },
        ],
        'FROM classes ORDER BY': [NO_WAITLIST_ROW],
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM class_waitlist WHERE class_id': [],
      },
    });
    await load(eventFor(db));
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'expired'"))).toBe(true);
  });

  it('flags a freed seat with no active offer, but not a full class with the same waitlist shape', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_ROW, FULL_CLASS_ROW],
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM class_waitlist WHERE class_id': [WAITLIST_ENTRY],
      },
    });
    const result = await runLoad(db);
    const openRow = result.rows.find((row: ClassWaitlistOverviewRow) => row.cls.id === OPEN_CLASS_ROW.id);
    const fullRow = result.rows.find((row: ClassWaitlistOverviewRow) => row.cls.id === FULL_CLASS_ROW.id);
    expect(openRow?.freedSeatNoOffer).toBe(true);
    expect(fullRow?.freedSeatNoOffer).toBe(false);
  });

  it('pairs a queued entry with its active offer by waitlistId, clearing the freed-seat flag ' +
    'once every entry has one', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_ROW],
        'FROM class_offers WHERE resolved IS NULL': [
          {
            token: 'hash-a',
            waitlist_id: WAITLIST_ENTRY.id,
            class_id: OPEN_CLASS_ROW.id,
            offered_by: 'admin@example.com',
            offered_at: '2026-07-01 00:00:00',
            expires_at: '2026-07-05 00:00:00',
            resolved: null,
            resolved_at: null,
          },
        ],
        'FROM class_waitlist WHERE class_id': [WAITLIST_ENTRY],
      },
    });
    const result = await runLoad(db);
    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row.freedSeatNoOffer).toBe(false);
    expect(row.entries).toEqual([
      expect.objectContaining({
        entry: expect.objectContaining({ id: WAITLIST_ENTRY.id }),
        activeOffer: expect.objectContaining({ waitlistId: WAITLIST_ENTRY.id, expiresAt: '2026-07-05 00:00:00' }),
      }),
    ]);
  });
});
