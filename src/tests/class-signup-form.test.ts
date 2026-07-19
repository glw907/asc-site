import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidationError } from '@sveltejs/kit';
import * as v from 'valibot';
import {
  classSignupSchema,
  handleClassSignup,
  handleRequestClassRenewLink,
  type RequestClassRenewLinkSubmission,
} from '$theme/class-signup-form';
import { fakeD1 } from './_fake-d1';

/** `isValidationError`'s own declared type narrows to `ActionFailure` (the shared public shape),
 *  not the `ValidationError` class `invalid()` actually throws, so its real `.issues` array needs
 *  its own cast to read here, the same as any other place this repo casts a narrower runtime shape
 *  than the engine's public type states. */
function issueMessages(err: unknown): string[] {
  return (err as { issues: Array<{ message: string }> }).issues.map((issue) => issue.message);
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

/** The class-door standing gate's own lookups (Task 4): every fixture below signs up as a member
 *  in `current` standing (a paid `memberships` row from well within the last year), since these
 *  tests exercise capacity/Turnstile/interests behavior, not the standing gate itself (that gate
 *  has its own describe block further down). The `paid_at` date is computed relative to the real
 *  clock (matching the standing-gate describe block's own `isoDaysAgo` idiom) so these fixtures
 *  never go stale as the calendar moves on. */
const RECENT_PAID_AT = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const STANDING_ELIGIBLE = {
  'FROM members WHERE email': { id: 'member-1', household_id: 'household-1' },
  'FROM members WHERE id': { id: 'member-1', household_id: 'household-1', name: 'Jamie Rivera' },
  'FROM households WHERE id': { name: 'Rivera Household' },
  'FROM memberships WHERE household_id': { tier: 'individual', season: 2026, paid_at: RECENT_PAID_AT },
  "'renewal_grace_days'": { value: '30' },
};

function freeCapacityDb() {
  return fakeD1({
    firstResults: {
      'FROM classes WHERE id': CLASS_ROW,
      'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
      'FROM class_waitlist WHERE class_id': { n: 0 },
      ...STANDING_ELIGIBLE,
    },
  });
}

/** A full class (capacity already met): the same shape `enrollments.test.ts`'s own `fakeDbFull`
 *  uses, for the interests-answer tests below that need to exercise the waitlist branch. */
function fullClassDb() {
  return fakeD1({
    firstResults: {
      'FROM classes WHERE id': CLASS_ROW,
      'FROM class_enrollments WHERE class_id': { n: 10 },
      "COALESCE(MAX(position)": { next_position: 1 },
      'FROM class_waitlist WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 0 }),
      ...STANDING_ELIGIBLE,
    },
  });
}

const INPUT = {
  classId: CLASS_ROW.id,
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  phone: '',
  interests: '',
  'cf-turnstile-response': '',
};

describe('handleClassSignup (the Turnstile degrade path)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proceeds to sign up when no TURNSTILE_SECRET_KEY is configured, never calling siteverify', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = freeCapacityDb();

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks the submission when a secret is configured and siteverify reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }),
    );
    const { db } = freeCapacityDb();

    await expect(
      handleClassSignup(INPUT, { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' }, '203.0.113.5'),
    ).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'),
    );
  });

  it('proceeds when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }),
    );
    const { db } = freeCapacityDb();

    const result = await handleClassSignup(
      INPUT,
      { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' },
      '203.0.113.5',
    );
    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
  });

  it('refuses when CLUB_DB is not bound', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(handleClassSignup(INPUT, undefined, '203.0.113.5')).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((message) => message.includes('not available')),
    );
  });

  it('forwards DISCORD_WEBHOOK_CLASSES through to the class-filled Discord notice', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = freeCapacityDb();

    const result = await handleClassSignup(
      INPUT,
      { CLUB_DB: db, DISCORD_WEBHOOK_CLASSES: 'https://discord.com/api/webhooks/classes' },
      '203.0.113.5',
    );

    // freeCapacityDb enrolls the 10th of 10 seats: this signup fills the class.
    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
    expect(fetchSpy).toHaveBeenCalledWith('https://discord.com/api/webhooks/classes', expect.anything());
  });
});

describe('the interests answer (migration 0019_enrollment_interests)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('trims the answer and stores it on the enrollment row', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db, calls } = freeCapacityDb();
    const parsed = v.parse(classSignupSchema, { ...INPUT, interests: '  Reefing and docking  ' });

    const result = await handleClassSignup(parsed, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
    const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
    expect(enrollInsert?.args).toEqual([expect.any(String), CLASS_ROW.id, expect.any(String), 'Reefing and docking']);
  });

  it('stores NULL when the answer is left blank', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db, calls } = freeCapacityDb();

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
    const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
    expect(enrollInsert?.args).toEqual([expect.any(String), CLASS_ROW.id, expect.any(String), null]);
  });

  it("lands a waitlisted signup's answer in class_waitlist.notes instead", async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db, calls } = fullClassDb();
    const parsed = v.parse(classSignupSchema, { ...INPUT, interests: 'Spinnaker trim' });

    const result = await handleClassSignup(parsed, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'waitlisted', position: 1 });
    const waitlistInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_waitlist'));
    expect(waitlistInsert?.args).toEqual([expect.any(String), CLASS_ROW.id, INPUT.name, INPUT.email, null, 1, 'Spinnaker trim']);
  });

  it("rejects an answer over 1000 characters with the schema's friendly message", () => {
    const result = v.safeParse(classSignupSchema, { ...INPUT, interests: 'x'.repeat(1001) });

    expect(result.success).toBe(false);
    expect(result.issues?.map((issue) => issue.message)).toContain('Please keep your answer under 1000 characters.');
  });
});

describe('the class-door standing gate (Task 4)', () => {
  const HOUSEHOLD_ROW = { id: 'household-1', name: 'Rivera Household' };
  const MEMBER_ROW = { id: 'member-1', household_id: HOUSEHOLD_ROW.id, name: 'Jamie Rivera' };

  function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  /** A free-capacity class DB (`freeCapacityDb`'s own shape) plus the standing-gate's own lookups:
   *  a member (or not, for the no-match branch) whose household's most recently paid membership row
   *  landed `paidAt` days ago (or never paid, for `paidAt: null`). */
  function standingDb(opts: { memberFound: boolean; paidAt: string | null; email?: unknown | ((args: unknown[]) => unknown) }) {
    return fakeD1({
      firstResults: {
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
        'FROM class_waitlist WHERE class_id': { n: 0 },
        "'renewal_grace_days'": { value: '30' },
        'FROM members WHERE email': opts.email ?? (opts.memberFound ? { id: MEMBER_ROW.id, household_id: MEMBER_ROW.household_id } : null),
        'FROM members WHERE id': opts.memberFound ? MEMBER_ROW : null,
        'FROM households WHERE id': HOUSEHOLD_ROW,
        'FROM memberships WHERE household_id': opts.paidAt ? { tier: 'individual', season: 2025, paid_at: opts.paidAt } : null,
      },
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a current member proceeds through the ordinary enroll path', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = standingDb({ memberFound: true, paidAt: isoDaysAgo(60) });

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
  });

  it('a member in grace standing proceeds too', async () => {
    vi.stubGlobal('fetch', vi.fn());
    // ~365 days past this paid_at is ~15 days ago: past the boundary, still inside the default
    // 30-day grace window.
    const { db } = standingDb({ memberFound: true, paidAt: isoDaysAgo(380) });

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
  });

  it('an email with no matching member pivots into the join door, carrying the submitted fields', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = standingDb({ memberFound: false, paidAt: null });

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({
      pivot: 'join',
      classId: CLASS_ROW.id,
      name: INPUT.name,
      email: INPUT.email,
      phone: undefined,
    });
  });

  it('a lapsed household gets the renewal handoff instead of the join pivot (2026-07-14 amendment)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    // Well past the 1-year boundary plus the 30-day grace window.
    const { db } = standingDb({ memberFound: true, paidAt: isoDaysAgo(450) });

    const result = await handleClassSignup({ ...INPUT, phone: '907-555-0100' }, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ pivot: 'renew', email: INPUT.email });
  });

  it('a household with no paid membership at all also gets the renewal handoff, not the join pivot', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = standingDb({ memberFound: true, paidAt: null });

    const result = await handleClassSignup(INPUT, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ pivot: 'renew', email: INPUT.email });
  });

  it('resolves the member by normalized email', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = standingDb({
      memberFound: true,
      paidAt: isoDaysAgo(60),
      email: (args: unknown[]) => (args[0] === 'jamie@example.com' ? { id: MEMBER_ROW.id, household_id: MEMBER_ROW.household_id } : null),
    });

    const result = await handleClassSignup({ ...INPUT, email: '  Jamie@Example.COM  ' }, { CLUB_DB: db }, '203.0.113.5');

    expect(result).toEqual({ outcome: 'enrolled', enrollmentId: expect.any(String) });
  });
});

describe('handleRequestClassRenewLink (2026-07-14 amendment)', () => {
  const ACTIVE_MEMBER = {
    id: 'member-1',
    household_id: 'household-1',
    name: 'Jamie Rivera',
    email: 'jamie@example.com',
    archived_at: null,
  };
  const ORIGIN = 'https://dev.aksailingclub.org';
  const IP = '203.0.113.5';
  const RENEW_INPUT: RequestClassRenewLinkSubmission = { email: 'jamie@example.com', 'cf-turnstile-response': '' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the member their own sign-in link when CLUB_DB and EMAIL are both bound', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } });
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await handleRequestClassRenewLink(RENEW_INPUT, { CLUB_DB: db, EMAIL: { send } }, IP, ORIGIN);

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(ACTIVE_MEMBER.email);
  });

  it('still answers sent, sending nothing, when EMAIL is not bound', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } });

    const result = await handleRequestClassRenewLink(RENEW_INPUT, { CLUB_DB: db }, IP, ORIGIN);

    expect(result).toEqual({ sent: true });
  });

  it('still answers sent when CLUB_DB is not bound', async () => {
    const result = await handleRequestClassRenewLink(RENEW_INPUT, undefined, IP, ORIGIN);

    expect(result).toEqual({ sent: true });
  });
});

describe('handleRequestClassRenewLink (the Turnstile gate)', () => {
  const ORIGIN = 'https://dev.aksailingclub.org';
  const IP = '203.0.113.5';
  const RENEW_INPUT: RequestClassRenewLinkSubmission = { email: 'jamie@example.com', 'cf-turnstile-response': '' };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    await expect(
      handleRequestClassRenewLink(RENEW_INPUT, { TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN),
    ).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'),
    );
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const input = { ...RENEW_INPUT, 'cf-turnstile-response': 'a-bad-token' };
    await expect(
      handleRequestClassRenewLink(input, { TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN),
    ).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'),
    );
  });

  it('proceeds when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const input = { ...RENEW_INPUT, 'cf-turnstile-response': 'a-good-token' };
    const result = await handleRequestClassRenewLink(input, { TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN);
    expect(result).toEqual({ sent: true });
  });

  it('degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await handleRequestClassRenewLink(RENEW_INPUT, undefined, IP, ORIGIN);
    expect(result).toEqual({ sent: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
