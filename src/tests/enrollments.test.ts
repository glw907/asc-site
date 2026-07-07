import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { signUpForClass } from '$admin-club/lib/enrollments';

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

const INVISIBLE_CLASS_ROW = { ...CLASS_ROW, visible: 0 as const };

const INPUT = {
  classId: CLASS_ROW.id,
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  phone: '+19075551234',
  waiverVersion: '2026-01',
};

describe('signUpForClass', () => {
  it('refuses an unknown class', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM classes WHERE id': null } });
    const result = await signUpForClass(db, INPUT);
    expect(result).toEqual({ error: expect.stringContaining('not open for signup') });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('refuses an invisible class (the schema\'s only signup-closed field)', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM classes WHERE id': INVISIBLE_CLASS_ROW } });
    const result = await signUpForClass(db, INPUT);
    expect(result).toEqual({ error: expect.stringContaining('not open for signup') });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  describe('with free capacity', () => {
    function fakeDbFreeCapacity(alreadyEnrolled = false) {
      return fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM class_enrollments WHERE class_id': (args: unknown[]) =>
            args.length === 2 ? (alreadyEnrolled ? { n: 1 } : null) : { n: 9 },
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });
    }

    it('enrolls and records the enrolled-branch waiver acceptance in the same batch, auditing public:signup', async () => {
      const { db, calls } = fakeDbFreeCapacity();
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'enrolled' });

      const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
      expect(enrollInsert?.args).toEqual([expect.any(String), CLASS_ROW.id, INPUT.email]);

      const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
      // The phone is never retained on the enrolled path: no column to write it to, and not
      // folded into the audit detail either (a phone number is PII with no place in a log meant
      // to be safe to paste).
      expect(audit?.args).toEqual([
        'public:signup',
        'enroll',
        'enrollment',
        (enrollInsert?.args as unknown[])[0],
        `class=${CLASS_ROW.id}`,
      ]);

      const waiverInsert = calls.find((c) => c.sql.startsWith('INSERT INTO waiver_acceptances'));
      expect(waiverInsert?.args).toEqual([expect.any(String), INPUT.name, INPUT.email, INPUT.waiverVersion]);

      // All three land in one batch call, never as three separate .run()s.
      expect(calls.filter((c) => c.sql.startsWith('INSERT'))).toHaveLength(3);
    });

    it('refuses a repeat signup from the same email', async () => {
      const { db, calls } = fakeDbFreeCapacity(true);
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ error: expect.stringContaining('already enrolled') });
      expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
    });
  });

  describe('when the class is full', () => {
    function fakeDbFull(opts: { alreadyWaitlisted?: boolean; existingMaxPosition?: number } = {}) {
      const { alreadyWaitlisted = false, existingMaxPosition = 2 } = opts;
      return fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM class_enrollments WHERE class_id': { n: 10 },
          "COALESCE(MAX(position)": { next_position: existingMaxPosition + 1 },
          'FROM class_waitlist WHERE class_id': (args: unknown[]) =>
            args.length === 2 ? (alreadyWaitlisted ? { n: 1 } : null) : { n: existingMaxPosition },
        },
      });
    }

    it('waitlists (never enrolls) and records the waitlist-branch waiver acceptance in the same batch', async () => {
      const { db, calls } = fakeDbFull();
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'waitlisted', position: 3 });

      expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);

      const waitlistInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_waitlist'));
      expect(waitlistInsert?.args).toEqual([
        expect.any(String),
        CLASS_ROW.id,
        INPUT.name,
        INPUT.email,
        INPUT.phone,
        3,
      ]);

      const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
      expect(audit?.args).toEqual([
        'public:signup',
        'waitlist',
        'waitlist',
        (waitlistInsert?.args as unknown[])[0],
        `class=${CLASS_ROW.id} position=3`,
      ]);

      const waiverInsert = calls.find((c) => c.sql.startsWith('INSERT INTO waiver_acceptances'));
      expect(waiverInsert?.args).toEqual([expect.any(String), INPUT.name, INPUT.email, INPUT.waiverVersion]);
    });

    it('refuses a repeat waitlist join from the same email', async () => {
      const { db, calls } = fakeDbFull({ alreadyWaitlisted: true });
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ error: expect.stringContaining('already on the waitlist') });
      expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
    });

    it('answers the same clean refusal, not the generic fallback, when a raced double-join loses ' +
      "to migration 0004's uq_waitlist_class_email constraint after the pre-check already passed", async () => {
      const { db } = fakeDbFull();
      db.batch = () =>
        Promise.reject(
          new Error(
            'UNIQUE constraint failed: class_waitlist.class_id, class_waitlist.applicant_email: SQLITE_CONSTRAINT',
          ),
        );
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ error: expect.stringContaining('already on the waitlist') });
    });
  });

  it('refuses (never silently succeeds) when the atomic batch itself fails', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
        'FROM class_waitlist WHERE class_id': { n: 0 },
      },
    });
    db.batch = () => Promise.reject(new Error('D1 is unavailable'));
    const result = await signUpForClass(db, INPUT);
    expect(result).toEqual({ error: expect.stringContaining('Something went wrong') });
  });
});
