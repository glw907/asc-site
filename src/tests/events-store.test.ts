import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent, type EventWrite } from '$admin-club/lib/events-store';

const RAW_ROW = {
  id: 'commodores-cup-regatta',
  title: "Commodore's Cup Regatta",
  slug: 'commodores-cup-regatta',
  category: 'racing',
  short_description: 'The marquee regatta.',
  long_description: 'Three fleets race the outer buoys.',
  start_date: '2026-07-18',
  start_time: '10:00',
  end_date: null,
  end_time: null,
  location: 'Outer buoys course',
  hero_image: 'regatta-start-2025.jpg',
  hero_image_alt: 'Boats rounding the first mark.',
  thumbnail_image: null,
  visible: 1 as const,
  created_at: '2026-06-01 00:00:00',
  updated_at: '2026-06-01 00:00:00',
};

const WRITE: EventWrite = {
  title: 'Board Meeting',
  slug: 'board-meeting-2026-08',
  category: 'governance',
  shortDescription: null,
  longDescription: null,
  startDate: '2026-08-11',
  startTime: '18:00',
  endDate: null,
  endTime: null,
  location: 'Clubhouse',
  visible: true,
};

describe('listEvents', () => {
  it('maps each raw row to the camelCased shape, preserving the query order', async () => {
    const secondRow = { ...RAW_ROW, id: 'work-party', title: 'Work Party', category: 'operations' };
    const { db, calls } = fakeD1({ allResults: { 'FROM events': [RAW_ROW, secondRow] } });

    await expect(listEvents(db)).resolves.toEqual([
      expect.objectContaining({ id: 'commodores-cup-regatta', category: 'racing', visible: true }),
      expect.objectContaining({ id: 'work-party', category: 'operations' }),
    ]);
    expect(calls[0].sql).toContain('ORDER BY start_date IS NULL, start_date ASC');
  });

  it('returns an empty list when the table has no rows', async () => {
    const { db } = fakeD1({ allResults: { 'FROM events': [] } });
    await expect(listEvents(db)).resolves.toEqual([]);
  });
});

describe('getEvent', () => {
  it('maps the found row', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM events WHERE id': RAW_ROW } });
    await expect(getEvent(db, 'commodores-cup-regatta')).resolves.toEqual(
      expect.objectContaining({ title: "Commodore's Cup Regatta", heroImage: 'regatta-start-2025.jpg' }),
    );
  });

  it('returns null for a missing id', async () => {
    const { db } = fakeD1();
    await expect(getEvent(db, 'no-such-event')).resolves.toBeNull();
  });
});

describe('createEvent', () => {
  it('inserts every writable column, excluding the hero/thumbnail image fields', async () => {
    const { db, calls } = fakeD1();
    await createEvent(db, 'board-meeting-2026-08', WRITE);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO events');
    expect(calls[0].sql).not.toContain('hero_image');
    expect(calls[0].args).toEqual([
      'board-meeting-2026-08',
      'Board Meeting',
      'board-meeting-2026-08',
      'governance',
      null,
      null,
      '2026-08-11',
      '18:00',
      null,
      null,
      'Clubhouse',
      1,
    ]);
  });
});

describe('updateEvent', () => {
  it('updates every writable column by id, never touching hero/thumbnail fields', async () => {
    const { db, calls } = fakeD1();
    await updateEvent(db, 'board-meeting-2026-08', { ...WRITE, visible: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('UPDATE events SET');
    expect(calls[0].sql).not.toContain('hero_image');
    expect(calls[0].args.at(-1)).toBe('board-meeting-2026-08');
    expect(calls[0].args.at(-2)).toBe(0);
  });
});

describe('deleteEvent', () => {
  it('deletes by id only', async () => {
    const { db, calls } = fakeD1();
    await deleteEvent(db, 'board-meeting-2026-08');
    expect(calls).toEqual([{ sql: 'DELETE FROM events WHERE id = ?1', args: ['board-meeting-2026-08'] }]);
  });
});
