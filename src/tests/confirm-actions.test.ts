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

function confirmEvent(form: Record<string, string>, db: unknown, opts: { emailBinding?: { send: ReturnType<typeof vi.fn> }; turnstileSecret?: string } = {}) {
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
      },
    },
  };
}

describe('?/confirm (the Turnstile gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured, never consuming the magic-link token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db, calls } = fakeD1({});
    const result = await actions.confirm(confirmEvent({ token: 'a-magic-link-token' }, db, { turnstileSecret: 'secret' }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: null });
    expect(calls.some((c) => c.sql.startsWith('UPDATE member_tokens'))).toBe(false);
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({});
    const result = await actions.confirm(
      confirmEvent({ token: 'a-magic-link-token', 'cf-turnstile-response': 'a-bad-token' }, db, { turnstileSecret: 'secret' }) as never,
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
});

describe('?/resend (the Turnstile gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured, never sending the email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(confirmEvent({ email: MEMBER_ROW.email }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never);
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.resend(
      confirmEvent({ email: MEMBER_ROW.email, 'cf-turnstile-response': 'a-bad-token' }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ ok: false, prefillEmail: MEMBER_ROW.email, resent: false });
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
});
