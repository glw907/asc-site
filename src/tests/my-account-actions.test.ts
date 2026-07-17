// The landing's asset-fee pay doors (Task 6): the write-then-checkout actions themselves, wired
// through `portalAction`'s own CSRF/session gate exactly the way a real request reaches them.
// `member-portal-assets.test.ts` covers the pure fee-lookup logic these actions call; this file
// covers the wiring: does the right row get written, and does the checkout carry the right amount
// and refId. The portal renew card's own `?/renew` moved to `/my-account/renew` in T2c (the
// portal redesign pass's "the renewal door" ruling); its wiring tests moved with it to
// `my-account-renew-actions.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import { actions } from '../routes/(site)/my-account/+page.server';
import { fakeD1 } from './_fake-d1';

const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1', name: 'Scratch Member', email: 'scratch@example.com', archived_at: null };

function fakeEvent(form: Record<string, string>, db: unknown, stripeKey?: string) {
  const fd = new FormData();
  fd.append('csrf', 'token');
  for (const [key, value] of Object.entries(form)) fd.append(key, value);
  const cookies: Record<string, string> = { 'asc-member-csrf': 'token', 'asc-member': 'sess-1' };
  return {
    url: new URL('http://localhost/my-account'),
    request: { clone: () => ({ formData: async () => fd }) } as unknown as Request,
    cookies: { get: (name: string) => cookies[name], set: () => {} },
    platform: { env: { CLUB_DB: db, ...(stripeKey ? { STRIPE_SECRET_KEY: stripeKey } : {}) } },
  };
}

async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

/** `?/requestLink`'s own event shape: no member session, so a bare CSRF cookie is enough, and
 *  (2026-07-15 hardening pass) `getClientAddress` and an optional Turnstile secret for the gate.
 *  `request.formData()` must work directly (not just via `.clone()`), matching the action's own
 *  read order: `validateMemberCsrfToken` clones first, then the action reads the original body. */
function requestLinkEvent(form: Record<string, string>, db: unknown, opts: { emailBinding?: { send: ReturnType<typeof vi.fn> }; turnstileSecret?: string } = {}) {
  const fd = new FormData();
  fd.append('csrf', 'token');
  for (const [key, value] of Object.entries(form)) fd.append(key, value);
  const cookies: Record<string, string> = { 'asc-member-csrf': 'token' };
  return {
    url: new URL('http://localhost/my-account'),
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

describe('?/requestLink (the Turnstile gate, 2026-07-15 hardening pass)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const result = await actions.requestLink(requestLinkEvent({ email: 'jamie@example.com' }, undefined, { turnstileSecret: 'secret' }) as never);
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const result = await actions.requestLink(
      requestLinkEvent({ email: 'jamie@example.com', 'cf-turnstile-response': 'a-bad-token' }, undefined, { turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
  });

  it('proceeds when a secret is configured and siteverify reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) }));
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.requestLink(
      requestLinkEvent({ email: 'jamie@example.com', 'cf-turnstile-response': 'a-good-token' }, db, { emailBinding: { send }, turnstileSecret: 'secret' }) as never,
    );
    expect(result).toEqual({ sent: true });
  });

  it('degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.requestLink(requestLinkEvent({ email: 'jamie@example.com' }, db, { emailBinding: { send } }) as never);
    expect(result).toEqual({ sent: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('?/payAssetFee', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses an assignment with no outstanding fee for this household (the pay door only opens for approved, unpaid assignments)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'FROM asset_assignments aa': null,
      },
    });
    const result = await actions.payAssetFee(fakeEvent({ assignmentId: 'aa-1' }, db) as never);
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
  });

  it('redirects to a real asset-fee checkout for an approved, unpaid assignment', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'FROM asset_assignments aa': { asset_type_name: 'Mooring', amount: 150 },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_2' }), { status: 200 })),
    );

    const caught = await catchThrown(actions.payAssetFee(fakeEvent({ assignmentId: 'aa-1' }, db, 'sk_test_1') as never));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('https://checkout.stripe.com/pay/cs_test_2');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('metadata[kind]')).toBe('asset-fee');
    expect(params.get('metadata[refId]')).toBe('aa-1');
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('15000');
  });
});

describe('?/payRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the approved request into an assignment, then redirects straight to its checkout', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'FROM asset_requests WHERE id': { asset_type: 'mooring', household_id: 'hh-1' },
        'FROM memberships WHERE household_id': { id: 'ms-1' },
        'FROM asset_types WHERE id': { fee: 150 },
        'FROM asset_assignments aa': { asset_type_name: 'Mooring', amount: 150 },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_3' }), { status: 200 })),
    );

    const caught = await catchThrown(actions.payRequest(fakeEvent({ requestId: 'req-1' }, db, 'sk_test_1') as never));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('https://checkout.stripe.com/pay/cs_test_3');
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_assignments'))).toBe(true);
  });
});
