import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isHttpError } from '@sveltejs/kit';
import { load, actions } from '../routes/(site)/classes/offer/[token]/+page.server';
import { fakeD1 } from './_fake-d1';

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.claim>[0];
/** `PageServerLoad`'s declared type allows `void` (a load may return nothing, to inherit parent
 *  data); this route's own `load` never does, so tests that read fields off the result narrow it
 *  away here rather than repeating the cast at every call site. */
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

/** `opts.turnstileSecret` and `opts.formEntries` exercise the Turnstile/origin gate
 *  (2026-07-15 hardening pass): `request.headers` backs the origin check, `request.formData()`
 *  the token read (only invoked at all when a secret is configured, matching the gate's own
 *  degrade-open shape). `opts.origin` defaults to the same origin `url` carries, so a plain
 *  `eventFor` call is same-origin by construction; a test only sets it to something else to
 *  exercise the cross-origin refusal. */
function eventFor(
  token: string,
  db: unknown,
  opts: { turnstileSecret?: string; formEntries?: Record<string, string>; origin?: string } = {},
): LoadEvent & ActionEvent {
  const url = new URL('https://dev.aksailingclub.org/classes/offer/a-token');
  const fd = new FormData();
  for (const [key, value] of Object.entries(opts.formEntries ?? {})) fd.append(key, value);
  const headers = new Headers();
  headers.set('origin', opts.origin ?? url.origin);
  return {
    params: { token },
    platform: { env: { CLUB_DB: db, ...(opts.turnstileSecret ? { TURNSTILE_SECRET_KEY: opts.turnstileSecret } : {}) } },
    url,
    request: { headers, formData: async () => fd } as unknown as Request,
    getClientAddress: () => '203.0.113.5',
  } as unknown as LoadEvent & ActionEvent;
}

async function runLoad(token: string, db: unknown): Promise<LoadResult> {
  return (await load(eventFor(token, db))) as LoadResult;
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

const ACTIVE_OFFER_ROW = {
  token_hash: 'irrelevant-because-fake', // fakeD1 answers by SQL substring, not real hashing
  waitlist_id: 'wait-1',
  class_id: CLASS_ROW.id,
  offered_by: 'admin@example.com',
  offered_at: '2026-07-09 00:00:00',
  expires_at: '2026-07-12 00:00:00',
  resolved: null,
  resolved_at: null,
};

describe('/classes/offer/[token] load', () => {
  const NOW = new Date('2026-07-10T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('503s when CLUB_DB is not bound', async () => {
    await expect(load(eventFor('a-token', undefined))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 503,
    );
  });

  it('404s an unknown token', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_offers WHERE token': null } });
    await expect(load(eventFor('no-such-token', db))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 404,
    );
  });

  it('previews an active, unexpired offer without resolving it', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': ACTIVE_OFFER_ROW, 'FROM classes WHERE id': CLASS_ROW },
    });
    const result = await runLoad('a-token', db);
    expect(result).toEqual({
      offer: { classId: CLASS_ROW.id, className: CLASS_ROW.name, expiresAt: ACTIVE_OFFER_ROW.expires_at, resolved: null },
      isExpired: false,
    });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('flags an unresolved but past-expiry offer as expired, without mutating it', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': { ...ACTIVE_OFFER_ROW, expires_at: '2026-07-09 00:00:00' },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    const result = await runLoad('a-token', db);
    expect(result.isExpired).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('reports an already-claimed offer as not expired but resolved', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': { ...ACTIVE_OFFER_ROW, resolved: 'claimed', resolved_at: '2026-07-10 00:00:00' },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    const result = await runLoad('a-token', db);
    expect(result.isExpired).toBe(false);
    expect(result.offer.resolved).toBe('claimed');
  });
});

describe('/classes/offer/[token] actions', () => {
  it('claim: 503s when CLUB_DB is not bound', async () => {
    const result = await actions.claim(eventFor('a-token', undefined));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(503);
  });

  it('claim: fails 400 with the offer error on an already-consumed token', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { ...ACTIVE_OFFER_ROW, resolved: 'claimed', resolved_at: '2026-07-10 00:00:00' } },
    });
    const result = await actions.claim(eventFor('a-token', db));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect((result as { data: { error: string } }).data.error).toContain('already been used');
  });

  it('claim: succeeds and returns the enrollment result on a valid, unexpired offer', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM class_waitlist WHERE id': { id: 'wait-1', applicant_name: 'Jamie Rivera', applicant_email: 'jamie@example.com', member_id: null },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const result = await actions.claim(eventFor('a-token', db));
    vi.useRealTimers();
    expect(result).toEqual({ claimed: true, result: expect.objectContaining({ classId: CLASS_ROW.id }) });
  });

  it('decline: 503s when CLUB_DB is not bound', async () => {
    const result = await actions.decline(eventFor('a-token', undefined));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(503);
  });

  it('decline: succeeds on a pending offer', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { waitlist_id: 'wait-1', resolved: null } },
    });
    const result = await actions.decline(eventFor('a-token', db));
    expect(result).toEqual({ declined: true });
  });

  it('decline: fails 400 on an already-resolved token', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { waitlist_id: 'wait-1', resolved: 'declined' } },
    });
    const result = await actions.decline(eventFor('a-token', db));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });
});

describe('/classes/offer/[token] actions (the Turnstile/origin gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('claim: refuses a cross-origin submission before touching the database', async () => {
    const result = await actions.claim(eventFor('a-token', undefined, { origin: 'https://evil.example' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('claim: rejects a missing token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const result = await actions.claim(eventFor('a-token', undefined, { turnstileSecret: 'secret' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number; data: { error: string } }).data.error).toContain('Spam check failed');
  });

  it('claim: rejects an invalid token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const result = await actions.claim(eventFor('a-token', undefined, { turnstileSecret: 'secret', formEntries: { 'cf-turnstile-response': 'a-bad-token' } }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number; data: { error: string } }).data.error).toContain('Spam check failed');
  });

  it('claim: proceeds past the gate when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const { db } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM class_waitlist WHERE id': { id: 'wait-1', applicant_name: 'Jamie Rivera', applicant_email: 'jamie@example.com', member_id: null },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const result = await actions.claim(eventFor('a-token', db, { turnstileSecret: 'secret', formEntries: { 'cf-turnstile-response': 'a-good-token' } }));
    vi.useRealTimers();
    expect(result).toEqual({ claimed: true, result: expect.objectContaining({ classId: CLASS_ROW.id }) });
  });

  it('claim: degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await actions.claim(eventFor('a-token', undefined));
    expect(fetchSpy).not.toHaveBeenCalled();
    // No secret and no origin mismatch: the gate passes through to the ordinary CLUB_DB check.
    expect((result as { status: number }).status).toBe(503);
  });

  it('decline: refuses a cross-origin submission before touching the database', async () => {
    const result = await actions.decline(eventFor('a-token', undefined, { origin: 'https://evil.example' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('decline: rejects a missing token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const result = await actions.decline(eventFor('a-token', undefined, { turnstileSecret: 'secret' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number; data: { error: string } }).data.error).toContain('Spam check failed');
  });

  it('decline: proceeds past the gate when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const { db } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { waitlist_id: 'wait-1', resolved: null } },
    });
    const result = await actions.decline(eventFor('a-token', db, { turnstileSecret: 'secret', formEntries: { 'cf-turnstile-response': 'a-good-token' } }));
    expect(result).toEqual({ declined: true });
  });
});
