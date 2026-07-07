import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { load } from '../routes/(site)/classes/[id]/signup/+page.server';
import { fakeD1 } from './_fake-d1';

type LoadEvent = Parameters<typeof load>[0];
/** `PageServerLoad`'s declared type allows `void` (a load may return nothing, to inherit parent
 *  data); this route's own `load` never does, so tests that read fields off the result narrow it
 *  away here rather than repeating the cast at every call site. */
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

function eventFor(id: string, db: unknown): LoadEvent {
  return { params: { id }, platform: { env: { CLUB_DB: db } } } as unknown as LoadEvent;
}

async function runLoad(id: string, db: unknown): Promise<LoadResult> {
  return (await load(eventFor(id, db))) as LoadResult;
}

const CLASS_ROW = {
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
  visible: 1 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

describe('/classes/[id]/signup load', () => {
  it('503s when CLUB_DB is not bound', async () => {
    await expect(load(eventFor(CLASS_ROW.id, undefined))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 503,
    );
  });

  it('404s an unknown class', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': null } });
    await expect(load(eventFor('no-such-class', db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('404s an invisible class', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': { ...CLASS_ROW, visible: 0 as const },
        'FROM class_enrollments WHERE class_id': { n: 0 },
        'FROM class_waitlist WHERE class_id': { n: 0 },
      },
    });
    await expect(load(eventFor(CLASS_ROW.id, db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('returns the class with counts plus the current waiver text version', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': { n: 9 },
        'FROM class_waitlist WHERE class_id': { n: 0 },
        "'waiver_text_version'": { value: '2026-02' },
      },
    });
    const result = await runLoad(CLASS_ROW.id, db);
    expect(result.waiverVersion).toBe('2026-02');
    expect(result.cls).toEqual(expect.objectContaining({ id: CLASS_ROW.id, enrolledCount: 9, isFull: false }));
  });
});
