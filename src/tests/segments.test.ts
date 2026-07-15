// segments.ts's own coverage: every segment at its standing boundaries, the shared-email
// household-primary tie-break, and the picker's own ordering. Follows member-standing.test.ts's
// own fixed-clock convention (vi.useFakeTimers, a synthetic NOW) since the membership segments
// share standing.ts's own rolling boundary math.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSegmentOptions, resolveSegment, type SegmentKey } from '$admin-club/lib/segments';
import { fakeD1 } from './_fake-d1';

const NOW = new Date('2027-06-15T12:00:00Z');

/** `paid_at` a fixed distance in the past from `NOW`, in the schema's own SQLite-datetime shape
 *  (mirrors `member-standing.test.ts`'s own helper). */
function paidAtDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

describe("resolveSegment: the 'current' segment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('includes current and grace households, excludes a lapsed one, and gives a shared email to the household primary', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h': [
          { household_id: 'hh-current', paid_at: paidAtDaysAgo(30), primary_member_id: 'mem-current' },
          { household_id: 'hh-grace', paid_at: paidAtDaysAgo(365 + 20), primary_member_id: null },
          { household_id: 'hh-lapsed', paid_at: paidAtDaysAgo(365 + 40), primary_member_id: null },
          { household_id: 'hh-shared', paid_at: paidAtDaysAgo(10), primary_member_id: 'mem-primary' },
        ],
        // hh-lapsed's id is never bound into this call: the household is filtered out before the
        // members query runs at all (proven below via the bound args).
        'FROM members WHERE archived_at': [
          { id: 'mem-current', name: 'Current Member', email: 'current@example.com', household_id: 'hh-current' },
          { id: 'mem-grace', name: 'Grace Member', email: 'grace@example.com', household_id: 'hh-grace' },
          { id: 'mem-shared-other', name: 'Not Primary', email: 'shared@example.com', household_id: 'hh-shared' },
          { id: 'mem-primary', name: 'The Primary', email: 'shared@example.com', household_id: 'hh-shared' },
        ],
      },
    });

    const segment = await resolveSegment(db, 'current');
    expect(segment.label).toBe('Current members');
    expect(segment.recipients).toEqual(
      expect.arrayContaining([
        { email: 'current@example.com', personName: 'Current Member', memberId: 'mem-current' },
        { email: 'grace@example.com', personName: 'Grace Member', memberId: 'mem-grace' },
        { email: 'shared@example.com', personName: 'The Primary', memberId: 'mem-primary' },
      ]),
    );
    expect(segment.recipients).toHaveLength(3); // the shared email dedupes to one recipient

    const membersCall = calls.find((c) => c.sql.includes('FROM members WHERE archived_at'));
    expect(membersCall?.sql).toContain('archived_at IS NULL');
    expect(membersCall?.args).not.toContain('hh-lapsed');
  });

  it('a household with no non-refunded paid row (never-paid or refunded-only) never grounds, so it never reaches the members query', async () => {
    const { db } = fakeD1({ allResults: { 'FROM households h': [] } });
    const segment = await resolveSegment(db, 'current');
    expect(segment.recipients).toEqual([]);
  });

  it('chunks the household-member query at D1s 100-bound-parameter cap: >100 current households still resolves (never throws), with the right total count', async () => {
    const households = Array.from({ length: 110 }, (_, i) => ({
      household_id: `hh-${i}`,
      paid_at: paidAtDaysAgo(10),
      primary_member_id: null,
    }));
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h': households,
        // Each chunk call binds a different subset of household ids as its own args; answer one
        // member per bound household id so the merged result covers every household regardless
        // of how many chunk calls the resolver makes.
        'FROM members WHERE archived_at': (args: unknown[]) =>
          args.map((householdId) => ({
            id: `mem-${householdId as string}`,
            name: `Member ${householdId as string}`,
            email: `${householdId as string}@example.com`,
            household_id: householdId as string,
          })),
      },
    });

    const segment = await resolveSegment(db, 'current');
    expect(segment.recipients).toHaveLength(110);

    const memberCalls = calls.filter((c) => c.sql.startsWith('SELECT id, name, email, household_id FROM members'));
    expect(memberCalls.length).toBeGreaterThan(1);
    for (const call of memberCalls) expect(call.args.length).toBeLessThanOrEqual(90);
  });
});

describe("resolveSegment: the 'lapsed' segment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('includes only a household past its grace window, excluding current and grace households', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM households h': [
          { household_id: 'hh-current', paid_at: paidAtDaysAgo(30), primary_member_id: null },
          { household_id: 'hh-grace', paid_at: paidAtDaysAgo(365 + 20), primary_member_id: null },
          { household_id: 'hh-lapsed', paid_at: paidAtDaysAgo(365 + 40), primary_member_id: null },
        ],
        'FROM members WHERE archived_at': [{ id: 'mem-lapsed', name: 'Lapsed Member', email: 'lapsed@example.com', household_id: 'hh-lapsed' }],
      },
    });
    const segment = await resolveSegment(db, 'lapsed');
    expect(segment.label).toBe('Lapsed members');
    expect(segment.recipients).toEqual([{ email: 'lapsed@example.com', personName: 'Lapsed Member', memberId: 'mem-lapsed' }]);
  });

  it('answers no recipients when no household has ever lapsed', async () => {
    const { db } = fakeD1({ allResults: { 'FROM households h': [{ household_id: 'hh-current', paid_at: paidAtDaysAgo(10), primary_member_id: null }] } });
    const segment = await resolveSegment(db, 'lapsed');
    expect(segment.recipients).toEqual([]);
  });
});

describe("resolveSegment: the 'instructors' segment", () => {
  it('reaches every non-archived, emailed instructor assigned to a current-season class', async () => {
    const { db, calls } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM class_instructors': [
          { id: 'mem-instr-1', name: 'Instr One', email: 'instr1@example.com' },
          { id: 'mem-instr-2', name: 'Instr Two', email: 'instr2@example.com' },
        ],
      },
    });
    const segment = await resolveSegment(db, 'instructors');
    expect(segment.label).toBe('Instructors');
    expect(segment.recipients).toEqual([
      { email: 'instr1@example.com', personName: 'Instr One', memberId: 'mem-instr-1' },
      { email: 'instr2@example.com', personName: 'Instr Two', memberId: 'mem-instr-2' },
    ]);
    const call = calls.find((c) => c.sql.includes('class_instructors'));
    expect(call?.args).toEqual([2026]);
  });

  it('deduplicates an instructor assigned to two current-season classes', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM class_instructors': [
          { id: 'mem-instr-1', name: 'Instr One', email: 'instr1@example.com' },
          { id: 'mem-instr-1', name: 'Instr One', email: 'instr1@example.com' },
        ],
      },
    });
    const segment = await resolveSegment(db, 'instructors');
    expect(segment.recipients).toHaveLength(1);
  });
});

const RAW_CLASS = {
  id: 'cls-1',
  season: 2026,
  name: 'Keelboat 101',
  slug: 'keelboat-101',
  track: 'youth',
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
  visible: 1,
  drop_in: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

describe("resolveSegment: the 'class:<id>' segment", () => {
  it('resolves the enrollment roster through the guardian-aware contact resolver (a youth enrollment routes to the household primary)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': RAW_CLASS,
        "'current_season'": { value: '2026' },
        'FROM members WHERE id': (args: unknown[]) =>
          args[0] === 'mem-parent' ? { name: 'Parent Larsen', email: 'parent@example.com' } : { name: 'Kid Larsen', email: null, household_id: 'hh-larsen' },
        'FROM households WHERE id': { primary_member_id: 'mem-parent' },
      },
      allResults: {
        'FROM class_enrollments': [{ id: 'enr-1', member_id: 'mem-kid', enrolled_at: '2026-01-01', fee_paid: 1, guardian_contact: null, interests: null }],
      },
    });
    const segment = await resolveSegment(db, 'class:cls-1');
    expect(segment.label).toBe('Keelboat 101');
    expect(segment.recipients).toEqual([{ email: 'parent@example.com', personName: 'Parent Larsen', memberId: 'mem-kid' }]);
  });

  it("labels an older-season class with its year, and a class with no enrollments resolves to zero recipients (never an error)", async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': { ...RAW_CLASS, season: 2024 }, "'current_season'": { value: '2026' } },
      allResults: { 'FROM class_enrollments': [] },
    });
    const segment = await resolveSegment(db, 'class:cls-1');
    expect(segment.label).toBe('Keelboat 101 (2024)');
    expect(segment.recipients).toEqual([]);
  });

  it('throws for an unknown class id, never a silent empty segment', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': null } });
    await expect(resolveSegment(db, 'class:no-such')).rejects.toThrow(/unknown segment/i);
  });
});

describe('resolveSegment: an unrecognized key', () => {
  it('throws rather than returning a silently empty segment', async () => {
    const { db } = fakeD1({});
    await expect(resolveSegment(db, 'bogus' as SegmentKey)).rejects.toThrow(/unknown segment/i);
  });
});

describe('listSegmentOptions', () => {
  it('lists the two membership segments and instructors, then classes-with-enrollments, current season first and an older season labeled with its year', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM classes c': [
          { id: 'cls-new', name: 'Keelboat 101', season: 2026 },
          { id: 'cls-old', name: 'Dinghy Basics', season: 2024 },
        ],
      },
    });
    const options = await listSegmentOptions(db);
    expect(options).toEqual([
      { key: 'current', label: 'Current members' },
      { key: 'lapsed', label: 'Lapsed members' },
      { key: 'instructors', label: 'Instructors' },
      { key: 'class:cls-new', label: 'Keelboat 101' },
      { key: 'class:cls-old', label: 'Dinghy Basics (2024)' },
    ]);
  });

  it("only lists a class that has at least one enrollment (asserted via the query's own EXISTS clause: fakeD1 answers canned rows, it never filters)", async () => {
    const { db, calls } = fakeD1({ firstResults: { "'current_season'": { value: '2026' } }, allResults: { 'FROM classes c': [] } });
    await listSegmentOptions(db);
    const call = calls.find((c) => c.sql.includes('FROM classes c'));
    expect(call?.sql).toContain('EXISTS (SELECT 1 FROM class_enrollments');
  });
});
