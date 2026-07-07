import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidationError } from '@sveltejs/kit';
import { handleClassSignup } from '$theme/class-signup-form';
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

function freeCapacityDb() {
  return fakeD1({
    firstResults: {
      'FROM classes WHERE id': CLASS_ROW,
      'FROM class_enrollments WHERE class_id': (args: unknown[]) => (args.length === 2 ? null : { n: 9 }),
      'FROM class_waitlist WHERE class_id': { n: 0 },
      "'waiver_text_version'": { value: '2026-01' },
    },
  });
}

const INPUT = {
  classId: CLASS_ROW.id,
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  phone: '',
  waiverAccepted: true,
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
