import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  addInstructor,
  countEnrolled,
  countWaitlist,
  createClass,
  deleteClass,
  getClass,
  getClassWithCounts,
  isPubliclyOpen,
  listClasses,
  listClassesWithCounts,
  listEnrollments,
  listInstructors,
  listWaitlist,
  removeInstructor,
  updateClass,
  type ClassWithCounts,
  type ClassWrite,
} from '$admin-club/lib/classes-store';

const RAW_ROW = {
  id: '1st_adult_teen_intro',
  season: 2026,
  name: '1st Adult Intro Class',
  slug: '1st-adult-intro-class',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: '2026-06-01',
  end_date: '2026-06-08',
  location: 'Clubhouse',
  description: 'Learn to sail.',
  instructor_notes: null,
  custom_note: null,
  hero_image: 'adult-intro-class-1.jpg',
  hero_image_alt: 'Student at the tiller with an instructor.',
  visible: 1 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

const WRITE: ClassWrite = {
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 12,
  fee: 100,
  startDate: '2026-09-05',
  endDate: '2026-09-06',
  location: 'Clubhouse',
  description: 'Get your boat race-ready.',
  instructorNotes: 'Bring spare rigging.',
  customNote: 'Bring your own PFD.',
  visible: true,
};

describe('listClasses', () => {
  it('maps each raw row to the camelCased shape, preserving the query order', async () => {
    const secondRow = { ...RAW_ROW, id: 'fleet_tuneup', name: 'Fleet Tune-Up Weekend', track: 'youth' };
    const { db, calls } = fakeD1({ allResults: { 'FROM classes ORDER BY': [RAW_ROW, secondRow] } });

    await expect(listClasses(db)).resolves.toEqual([
      expect.objectContaining({ id: '1st_adult_teen_intro', track: 'adult-teen', fee: 100 }),
      expect.objectContaining({ id: 'fleet_tuneup', track: 'youth' }),
    ]);
    expect(calls[0].sql).toContain('ORDER BY start_date IS NULL, start_date ASC, name ASC');
  });
});

describe('getClass', () => {
  it('maps the found row', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': RAW_ROW } });
    await expect(getClass(db, '1st_adult_teen_intro')).resolves.toEqual(
      expect.objectContaining({
        name: '1st Adult Intro Class',
        capacity: 10,
        fee: 100,
        heroImage: 'adult-intro-class-1.jpg',
        heroImageAlt: 'Student at the tiller with an instructor.',
      }),
    );
  });

  it('returns null for a missing id', async () => {
    const { db } = fakeD1();
    await expect(getClass(db, 'no-such-class')).resolves.toBeNull();
  });
});

describe('createClass', () => {
  it('inserts every writable column plus the season and id, excluding the hero image fields', async () => {
    const { db, calls } = fakeD1();
    await createClass(db, 'fleet-tune-up-weekend', 2026, WRITE);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('INSERT INTO classes');
    expect(calls[0].sql).not.toContain('hero_image');
    expect(calls[0].args).toEqual([
      'fleet-tune-up-weekend',
      2026,
      'Fleet Tune-Up Weekend',
      'fleet-tune-up-weekend',
      'adult-teen',
      12,
      100,
      '2026-09-05',
      '2026-09-06',
      'Clubhouse',
      'Get your boat race-ready.',
      'Bring spare rigging.',
      'Bring your own PFD.',
      1,
    ]);
  });
});

describe('updateClass', () => {
  it('updates every writable column by id, never touching season or the hero image fields', async () => {
    const { db, calls } = fakeD1();
    await updateClass(db, 'fleet-tune-up-weekend', { ...WRITE, visible: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('UPDATE classes SET');
    expect(calls[0].sql).not.toContain('season');
    expect(calls[0].sql).not.toContain('hero_image');
    expect(calls[0].args.at(-1)).toBe('fleet-tune-up-weekend');
    expect(calls[0].args.at(-2)).toBe(0);
  });
});

describe('custom_note round-trip (migration 0013)', () => {
  it('reads a stored note off getClass, camelCased', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': { ...RAW_ROW, custom_note: 'Bring your own PFD.' } } });
    await expect(getClass(db, '1st_adult_teen_intro')).resolves.toEqual(
      expect.objectContaining({ customNote: 'Bring your own PFD.' }),
    );
  });

  it('reads null when no note has ever been set', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': RAW_ROW } });
    await expect(getClass(db, '1st_adult_teen_intro')).resolves.toEqual(expect.objectContaining({ customNote: null }));
  });

  it('updateClass writes a cleared note as null, not an empty string', async () => {
    const { db, calls } = fakeD1();
    await updateClass(db, 'fleet-tune-up-weekend', { ...WRITE, customNote: null });
    const update = calls.find((c) => c.sql.startsWith('UPDATE classes SET'));
    expect(update?.args).toContain(null);
  });
});

describe('deleteClass', () => {
  it('deletes by id only', async () => {
    const { db, calls } = fakeD1();
    await deleteClass(db, 'fleet-tune-up-weekend');
    expect(calls).toEqual([{ sql: 'DELETE FROM classes WHERE id = ?1', args: ['fleet-tune-up-weekend'] }]);
  });
});

describe('countEnrolled / countWaitlist', () => {
  it('reads the count off the respective table', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_enrollments WHERE class_id': { n: 4 }, 'FROM class_waitlist WHERE class_id': { n: 2 } },
    });
    await expect(countEnrolled(db, '1st_adult_teen_intro')).resolves.toBe(4);
    await expect(countWaitlist(db, '1st_adult_teen_intro')).resolves.toBe(2);
  });

  it('defaults to zero when the query returns nothing', async () => {
    const { db } = fakeD1();
    await expect(countEnrolled(db, 'no-such-class')).resolves.toBe(0);
  });
});

describe('getClassWithCounts: fullness flips exactly at capacity', () => {
  it('is not full one seat under capacity', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': RAW_ROW, 'FROM class_enrollments WHERE class_id': { n: 9 }, 'FROM class_waitlist WHERE class_id': { n: 0 } },
    });
    await expect(getClassWithCounts(db, '1st_adult_teen_intro')).resolves.toEqual(
      expect.objectContaining({ enrolledCount: 9, capacity: 10, isFull: false }),
    );
  });

  it('is full at exactly capacity', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': RAW_ROW, 'FROM class_enrollments WHERE class_id': { n: 10 }, 'FROM class_waitlist WHERE class_id': { n: 0 } },
    });
    await expect(getClassWithCounts(db, '1st_adult_teen_intro')).resolves.toEqual(
      expect.objectContaining({ enrolledCount: 10, capacity: 10, isFull: true }),
    );
  });

  it('returns null for a missing class, never querying the counts', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM classes WHERE id': null } });
    await expect(getClassWithCounts(db, 'no-such-class')).resolves.toBeNull();
    expect(calls.some((c) => c.sql.includes('class_enrollments') || c.sql.includes('class_waitlist'))).toBe(false);
  });
});

describe('listClassesWithCounts', () => {
  it('maps the derived counts and isFull alongside the row', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM classes ORDER BY': [
          { ...RAW_ROW, enrolled_count: 10, waitlist_count: 1 },
          { ...RAW_ROW, id: 'fleet_tuneup', capacity: 12, enrolled_count: 3, waitlist_count: 0 },
        ],
      },
    });
    await expect(listClassesWithCounts(db)).resolves.toEqual([
      expect.objectContaining({ id: '1st_adult_teen_intro', enrolledCount: 10, waitlistCount: 1, isFull: true }),
      expect.objectContaining({ id: 'fleet_tuneup', enrolledCount: 3, waitlistCount: 0, isFull: false }),
    ]);
  });
});

describe('listInstructors', () => {
  it('joins members for the real email, keeping member_name as the display name', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM class_instructors ci': [{ email: 'coach@example.com', name: 'Coach' }] },
    });
    await expect(listInstructors(db, '1st_adult_teen_intro')).resolves.toEqual([
      { email: 'coach@example.com', name: 'Coach' },
    ]);
    expect(calls[0].sql).toContain('JOIN members');
  });
});

describe('addInstructor / removeInstructor', () => {
  it('addInstructor resolves a real member id through ensureMember, then inserts (class_id, ' +
    'member_id, name)', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM members WHERE email': { id: 'mem-1', household_id: 'hh-1' } },
    });
    await addInstructor(db, '1st_adult_teen_intro', 'coach@example.com', 'Coach');
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO class_instructors'));
    expect(insert?.sql).toContain('ON CONFLICT');
    expect(insert?.args).toEqual(['1st_adult_teen_intro', 'mem-1', 'Coach']);
    // No member/household INSERT: ensureMember found an existing row and wrote nothing.
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO members'))).toBe(false);
  });

  it('addInstructor creates a member (falling back to the email as ensureMember\'s required ' +
    'name) when no display name is given for a brand-new instructor', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    await addInstructor(db, '1st_adult_teen_intro', 'coach@example.com', null);
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect((memberInsert?.args as unknown[])[2]).toBe('coach@example.com'); // the name column
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO class_instructors'));
    expect((insert?.args as unknown[])[2]).toBeNull(); // member_name itself stays null
  });

  it('removeInstructor deletes by class_id and a member_id resolved from email, only that row', async () => {
    const { db, calls } = fakeD1();
    await removeInstructor(db, '1st_adult_teen_intro', 'coach@example.com');
    expect(calls).toEqual([
      {
        sql: 'DELETE FROM class_instructors WHERE class_id = ?1 AND member_id = (SELECT id FROM members WHERE email = ?2)',
        args: ['1st_adult_teen_intro', 'coach@example.com'],
      },
    ]);
  });
});

describe('listWaitlist', () => {
  it('maps each row, position order', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM class_waitlist WHERE class_id': [
          {
            id: 'wait-1',
            class_id: '1st_adult_teen_intro',
            member_id: null,
            applicant_name: 'Jamie Rivera',
            applicant_email: 'jamie@example.com',
            applicant_phone: null,
            position: 1,
            requested_at: '2026-05-01 00:00:00',
            notes: null,
          },
        ],
      },
    });
    await expect(listWaitlist(db, '1st_adult_teen_intro')).resolves.toEqual([
      {
        id: 'wait-1',
        classId: '1st_adult_teen_intro',
        memberId: null,
        applicantName: 'Jamie Rivera',
        applicantEmail: 'jamie@example.com',
        applicantPhone: null,
        position: 1,
        requestedAt: '2026-05-01 00:00:00',
        notes: null,
      },
    ]);
    expect(calls[0].sql).toContain('ORDER BY position ASC');
  });
});

describe('listEnrollments', () => {
  it('maps each row, feePaid as a boolean', async () => {
    const { db } = fakeD1({
      allResults: {
        'guardian_contact FROM class_enrollments': [
          { id: 'enr-1', member_id: 'member-1', enrolled_at: '2026-05-01 00:00:00', fee_paid: 1, guardian_contact: null },
        ],
      },
    });
    await expect(listEnrollments(db, '1st_adult_teen_intro')).resolves.toEqual([
      { id: 'enr-1', memberId: 'member-1', enrolledAt: '2026-05-01 00:00:00', feePaid: true, guardianContact: null },
    ]);
  });
});

describe('isPubliclyOpen (the freed-spot rule)', () => {
  const BASE: ClassWithCounts = {
    id: 'fleet-tune-up-weekend',
    season: 2026,
    name: 'Fleet Tune-Up Weekend',
    slug: 'fleet-tune-up-weekend',
    track: 'adult-teen',
    capacity: 10,
    fee: 100,
    startDate: null,
    endDate: null,
    location: null,
    description: null,
    instructorNotes: null,
    customNote: null,
    heroImage: null,
    heroImageAlt: null,
    visible: true,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-01-01 00:00:00',
    enrolledCount: 5,
    waitlistCount: 0,
    isFull: false,
  };

  it('is open with free capacity, an empty waitlist, and no active offer', () => {
    expect(isPubliclyOpen(BASE, false)).toBe(true);
  });

  it('is closed once full, regardless of the waitlist or offer state', () => {
    expect(isPubliclyOpen({ ...BASE, enrolledCount: 10, isFull: true }, false)).toBe(false);
  });

  it('is closed with free capacity but a nonempty waitlist: a freed spot never publicly ' +
    'reopens while anyone queues', () => {
    expect(isPubliclyOpen({ ...BASE, waitlistCount: 1 }, false)).toBe(false);
  });

  it('is closed with free capacity, an empty waitlist, but a live offer outstanding: the offer ' +
    'chain works the queue privately first', () => {
    expect(isPubliclyOpen(BASE, true)).toBe(false);
  });

  it('is closed when every gate would independently close it (full, queued, AND offered)', () => {
    expect(isPubliclyOpen({ ...BASE, enrolledCount: 10, isFull: true, waitlistCount: 2 }, true)).toBe(false);
  });
});
