// /my-account/confirm's own actions (`confirm`, `resend`): the Turnstile gate the 2026-07-15
// hardening pass added to both (docs/2026-07-15-payments-live-smoke-design.md section 2a). Both
// actions already carry the member CSRF double-submit, so these tests hold that constant (a
// matching cookie/field pair) and vary only the Turnstile inputs, mirroring
// `my-account-actions.test.ts`'s own `requestLinkEvent` shape.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions } from '../routes/(site)/my-account/confirm/+page.server';
import { fakeD1 } from './_fake-d1';

const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1', name: 'Jamie Rivera', email: 'jamie@example.com', archived_at: null };

/** `confirm`'s own success path redirects (a real `throw redirect(303, ...)`), matching
 *  `my-account-actions.test.ts`'s own `catchThrown` precedent for exercising that path. */
async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

function confirmEvent(
  form: Record<string, string>,
  db: unknown,
  opts: { emailBinding?: { send: ReturnType<typeof vi.fn> }; turnstileSecret?: string; rateLimit?: { limit: ReturnType<typeof vi.fn> } } = {},
) {
  const fd = new FormData();
  fd.append('csrf', 'token');
  for (const [key, value] of Object.entries(form)) fd.append(key, value);
  const cookies: Record<string, string> = { 'asc-member-csrf': 'token' };
  return {
    url: new URL('http://localhost/my-account/confirm'),
    request: { formData: async () => fd, clone: () => ({ formData: async () => fd }) } as unknown as Request,
    cookies: { get: (name: string) => cookies[name], set: () => {} },
    getClientAddress: () => '203.0.113.5',
    platform: {
      env: {
        CLUB_DB: db,
        ...(opts.emailBinding ? { EMAIL: opts.emailBinding } : {}),
        ...(opts.turnstileSecret ? { TURNSTILE_SECRET_KEY: opts.turnstileSecret } : {}),
        ...(opts.rateLimit ? { RATE_LIMIT_PUBLIC_POST: opts.rateLimit } : {}),
      },
    },
  };
}

const SPAM_CHECK_MESSAGE = 'Spam check failed. Please try again.';

describe('?/confirm (the Turnstile gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured, never consuming the magic-link token, with the spam-check error shape (review fix)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db, calls } = fakeD1({});
    const result = await actions.confirm(confirmEvent({ token: 'a-magic-link-token' }, db, { turnstileSecret: 'secret' }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: null, error: SPAM_CHECK_MESSAGE });
    expect(calls.some((c) => c.sql.startsWith('UPDATE member_tokens'))).toBe(false);
  });

  it('rejects an invalid token when a secret is configured, with the spam-check error shape (review fix)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({});
    const result = await actions.confirm(
      confirmEvent({ token: 'a-magic-link-token', 'cf-turnstile-response': 'a-bad-token' }, db, { turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ ok: false, prefillEmail: null, error: SPAM_CHECK_MESSAGE });
  });

  it('rejects an over-limit caller before ever checking Turnstile, with the same spam-check error shape (review fix)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db, calls } = fakeD1({});
    const rateLimit = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const result = await actions.confirm(confirmEvent({ token: 'a-magic-link-token' }, db, { rateLimit }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: null, error: SPAM_CHECK_MESSAGE });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('UPDATE member_tokens'))).toBe(false);
  });

  it('returns the plain expired shape (no error) for a genuinely invalid token, distinct from a spam-check failure (review fix)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) });
    vi.stubGlobal('fetch', fetchSpy);
    // consumeMemberToken's own conditional UPDATE matches zero rows for an already-used or
    // unknown token; findMemberByTokenHash then also finds nothing to pre-fill.
    const { db } = fakeD1({ runResults: { 'UPDATE member_tokens': { changes: 0 } } });
    const result = await actions.confirm(
      confirmEvent({ token: 'a-magic-link-token', 'cf-turnstile-response': 'a-good-token' }, db, { turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ ok: false, prefillEmail: null });
  });

  it('proceeds when a secret is configured and siteverify reports success (redirects on to /my-account)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const { db } = fakeD1({ firstResults: { 'FROM member_tokens t JOIN members m': MEMBER_ROW } });
    const caught = await catchThrown(
      actions.confirm(confirmEvent({ token: 'a-magic-link-token', 'cf-turnstile-response': 'a-good-token' }, db, { turnstileSecret: 'secret' }) as never),
    );
    expect(isRedirect(caught)).toBe(true);
  });

  it('degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = fakeD1({ firstResults: { 'FROM member_tokens t JOIN members m': MEMBER_ROW } });
    const caught = await catchThrown(actions.confirm(confirmEvent({ token: 'a-magic-link-token' }, db) as never));
    expect(isRedirect(caught)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("redirects to a `next` value from its own closed allowlist (member-waivers T5b's deep link)", async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = fakeD1({ firstResults: { 'FROM member_tokens t JOIN members m': MEMBER_ROW } });
    const caught = await catchThrown(
      actions.confirm(confirmEvent({ token: 'a-magic-link-token', next: '/my-account/renew' }, db) as never),
    );
    expect(isRedirect(caught)).toBe(true);
    expect((caught as { location: string }).location).toBe('/my-account/renew');
  });

  it('falls back to /my-account for a `next` value outside the allowlist (never an open redirect)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = fakeD1({ firstResults: { 'FROM member_tokens t JOIN members m': MEMBER_ROW } });
    const caught = await catchThrown(
      actions.confirm(confirmEvent({ token: 'a-magic-link-token', next: 'https://evil.example/phish' }, db) as never),
    );
    expect(isRedirect(caught)).toBe(true);
    expect((caught as { location: string }).location).toBe('/my-account');
  });
});

describe('?/resend (the Turnstile gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured, never sending the email, with the spam-check error shape (review fix)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(confirmEvent({ email: MEMBER_ROW.email }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: false, error: SPAM_CHECK_MESSAGE });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an invalid token when a secret is configured, with the spam-check error shape (review fix)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(
      confirmEvent({ email: MEMBER_ROW.email, 'cf-turnstile-response': 'a-bad-token' }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: false, error: SPAM_CHECK_MESSAGE });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an over-limit caller before ever checking Turnstile, never sending the email, with the same spam-check error shape (review fix)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const rateLimit = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const result = await actions.resend(confirmEvent({ email: MEMBER_ROW.email }, db, { emailBinding: { send }, rateLimit }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: false, error: SPAM_CHECK_MESSAGE });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('proceeds when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(
      confirmEvent({ email: MEMBER_ROW.email, 'cf-turnstile-response': 'a-good-token' }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: true });
  });

  it('degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(confirmEvent({ email: MEMBER_ROW.email }, db, { emailBinding: { send } }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("carries a `next` value from its own closed allowlist through to the resent link (review fix: a waiver resend used to strand the member on the portal home)", async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': MEMBER_ROW } });
    const send = vi.fn().mockResolvedValue(undefined);
    await actions.resend(confirmEvent({ email: MEMBER_ROW.email, next: '/my-account/sign?context=renewal' }, db, { emailBinding: { send } }) as never);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { text: string };
    expect(message.text).toContain(`next=${encodeURIComponent('/my-account/sign?context=renewal')}`);
  });

  it('drops a `next` value outside the allowlist rather than carry it into the resent link (never an open redirect)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': MEMBER_ROW } });
    const send = vi.fn().mockResolvedValue(undefined);
    await actions.resend(confirmEvent({ email: MEMBER_ROW.email, next: 'https://evil.example/phish' }, db, { emailBinding: { send } }) as never);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { text: string };
    expect(message.text).not.toContain('next=');
  });
});
