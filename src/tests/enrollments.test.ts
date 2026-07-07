import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** An existing `members` row for `INPUT.email`: most enrolled-branch tests below give
 *  `signUpForClass` a member `ensureMember` already knows, so they exercise the enrollment logic
 *  without also asserting on `ensureMember`'s own creation path (covered by `people.test.ts`, and
 *  by the dedicated "resolves a brand-new member" test below). */
const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1' };

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
          'FROM members WHERE email': MEMBER_ROW,
          'FROM class_enrollments WHERE class_id': (args: unknown[]) =>
            args.length === 2 ? (alreadyEnrolled ? { n: 1 } : null) : { n: 9 },
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });
    }

    it('enrolls with the real member id (ensureMember resolves it first) and records the ' +
      'enrolled-branch waiver acceptance in the same batch, auditing public:signup', async () => {
      const { db, calls } = fakeDbFreeCapacity();
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });

      const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
      expect(enrollInsert?.args).toEqual([expect.any(String), CLASS_ROW.id, MEMBER_ROW.id]);
      expect((result as { enrollmentId: string }).enrollmentId).toBe((enrollInsert?.args as unknown[])[0]);

      const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
      // The phone is not folded into the audit detail (a phone number is PII with no place in a
      // log meant to be safe to paste); it does now have a real home on the member row itself,
      // via ensureMember, covered by the dedicated "resolves a brand-new member" test below.
      expect(audit?.args).toEqual([
        'public:signup',
        'enroll',
        'enrollment',
        (enrollInsert?.args as unknown[])[0],
        `class=${CLASS_ROW.id}`,
      ]);

      const waiverInsert = calls.find((c) => c.sql.startsWith('INSERT INTO waiver_acceptances'));
      expect(waiverInsert?.args).toEqual([expect.any(String), INPUT.name, INPUT.email, INPUT.waiverVersion]);

      // All three land in one batch call, never as three separate .run()s. (An already-known
      // member, MEMBER_ROW here, adds no INSERT of its own: ensureMember only writes for a
      // brand-new person, see the dedicated test below.)
      expect(calls.filter((c) => c.sql.startsWith('INSERT'))).toHaveLength(3);
    });

    it('resolves a brand-new member through ensureMember, passing the signup\'s own phone to ' +
      'its create path, before enrolling', async () => {
      const { db, calls } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM members WHERE email': null, // unknown to ensureMember: it must create one
          'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });

      const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
      expect(memberInsert?.args).toEqual([expect.any(String), expect.any(String), INPUT.name, INPUT.email, INPUT.phone]);

      const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
      // The enrollment's member_id is the SAME id ensureMember just minted, not the raw email.
      expect((enrollInsert?.args as unknown[])[2]).toBe((memberInsert?.args as unknown[])[0]);
    });

    it('refuses a repeat signup from the same email', async () => {
      const { db, calls } = fakeDbFreeCapacity(true);
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ error: expect.stringContaining('already enrolled') });
      expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
    });
  });

  describe('the freed-spot rule: free capacity alone is not enough', () => {
    it('waitlists (never enrolls) a technically-free spot when the waitlist is nonempty', async () => {
      const { db, calls } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          // 9 enrolled of 10 capacity: a free spot by the naive rule, but the waitlist has 2
          // ahead of a brand-new signup, so the freed-spot rule must still waitlist.
          'FROM class_enrollments WHERE class_id': { n: 9 },
          "COALESCE(MAX(position)": { next_position: 3 },
          'FROM class_waitlist WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 2 }),
        },
      });
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'waitlisted', position: 3 });
      expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
    });

    it('waitlists (never enrolls) a technically-free, unqueued spot when a live offer is outstanding', async () => {
      const { db, calls } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM class_enrollments WHERE class_id': { n: 9 },
          "COALESCE(MAX(position)": { next_position: 1 },
          'FROM class_waitlist WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 0 }),
          // The other queue-signal: no waitlist entries, but an offer is currently live on the
          // spot that just freed (the offer chain is still working it privately).
          'FROM class_offers WHERE class_id': { n: 1 },
        },
      });
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'waitlisted', position: 1 });
      expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
    });

    it('enrolls once the queue is truly empty: free capacity, no waitlist, no active offer', async () => {
      const { db, calls } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM members WHERE email': MEMBER_ROW,
          'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });
      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
      expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(true);
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

  describe('the optional Discord notification', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('posts a class-filled notice to the classes webhook when an enrollment brings the class to capacity', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      vi.stubGlobal('fetch', fetchSpy);
      const { db } = fakeD1({
        // 9 already enrolled of 10 capacity: this signup is the one that fills it.
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM members WHERE email': MEMBER_ROW,
          'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });

      const result = await signUpForClass(db, INPUT, undefined, { DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes' });
      expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/classes');
      const body = JSON.parse(init.body as string) as { embeds: Array<{ title: string }> };
      expect(body.embeds[0].title).toBe(`Class filled: ${CLASS_ROW.name}`);
    });

    it('does not notify when the enrollment leaves the class short of capacity', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const { db } = fakeD1({
        // 5 already enrolled of 10 capacity: plenty of room left after this signup.
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM members WHERE email': MEMBER_ROW,
          'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 5 }),
          'FROM class_waitlist WHERE class_id': { n: 0 },
        },
      });

      const result = await signUpForClass(db, INPUT, undefined, { DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes' });
      expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('posts a waitlist-signup notice to the classes webhook when the class is full', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      vi.stubGlobal('fetch', fetchSpy);
      const { db } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM class_enrollments WHERE class_id': { n: 10 },
          "COALESCE(MAX(position)": { next_position: 3 },
          'FROM class_waitlist WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 2 }),
        },
      });

      const result = await signUpForClass(db, INPUT, undefined, { DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes' });
      expect(result).toEqual({ outcome: 'waitlisted', position: 3 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://discord.com/api/webhooks/classes');
      const body = JSON.parse(init.body as string) as { embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }> };
      expect(body.embeds[0].title).toBe(`New waitlist signup: ${CLASS_ROW.name}`);
      expect(body.embeds[0].fields).toEqual([
        { name: 'Name', value: INPUT.name },
        { name: 'Position', value: '3' },
      ]);
    });

    it('degrades silently (no fetch, no throw) when no discord binding is passed at all', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const { db } = fakeD1({
        firstResults: {
          'FROM classes WHERE id': CLASS_ROW,
          'FROM class_enrollments WHERE class_id': { n: 10 },
          "COALESCE(MAX(position)": { next_position: 1 },
          'FROM class_waitlist WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 0 }),
        },
      });

      const result = await signUpForClass(db, INPUT);
      expect(result).toEqual({ outcome: 'waitlisted', position: 1 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
