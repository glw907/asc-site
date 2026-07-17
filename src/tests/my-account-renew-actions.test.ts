// The renewal door's own `?/renew` action (T2c, moved verbatim from `/my-account/+page.server.ts`
// when that route's masthead CTA became a plain link to `/my-account/renew`): the same
// write-then-checkout wiring `my-account-actions.test.ts` already proved for the landing's own
// actions, now exercised against the new route. `member-portal-renewal.test.ts` covers the pure
// mint/reuse logic this action calls; this file covers the wiring: does the right row get
// written, and does the checkout carry the right amount and refId.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import { actions } from '../routes/(site)/my-account/renew/+page.server';
import { fakeD1 } from './_fake-d1';

const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1', name: 'Scratch Member', email: 'scratch@example.com', archived_at: null };

const TIER_PRICE_ROWS = [
  { key: 'tier_price_individual', value: '250' },
  { key: 'tier_price_family', value: '500' },
  { key: 'tier_price_young_adult', value: '100' },
];

function fakeEvent(form: Record<string, string>, db: unknown, stripeKey?: string) {
  const fd = new FormData();
  fd.append('csrf', 'token');
  for (const [key, value] of Object.entries(form)) fd.append(key, value);
  const cookies: Record<string, string> = { 'asc-member-csrf': 'token', 'asc-member': 'sess-1' };
  return {
    url: new URL('http://localhost/my-account/renew'),
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

describe('?/renew', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints an unpaid membership row for the next unclaimed season, then redirects to a real dues checkout', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'AND paid_at IS NOT NULL LIMIT 1': null,
        'AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1': null,
      },
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 })),
    );

    const caught = await catchThrown(actions.renew(fakeEvent({ tier: 'individual' }, db, 'sk_test_1') as never));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('https://checkout.stripe.com/pay/cs_test_1');

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(insert?.args).toEqual([expect.any(String), 'hh-1', 2026, 'individual', 250]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('metadata[kind]')).toBe('dues');
    expect(params.get('metadata[refId]')).toBe(insert?.args[0] as string);
  });

  it('reprices from the current settings value when the member changes tier', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'AND paid_at IS NOT NULL LIMIT 1': null,
        'AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1': null,
      },
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 })),
    );

    await catchThrown(actions.renew(fakeEvent({ tier: 'family' }, db, 'sk_test_1') as never));

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(insert?.args).toEqual([expect.any(String), 'hh-1', 2026, 'family', 500]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    expect(new URLSearchParams(body).get('line_items[0][price_data][unit_amount]')).toBe('50000');
  });

  it('reuses an abandoned unpaid row for the target season instead of minting a second one', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'AND paid_at IS NOT NULL LIMIT 1': null,
        'AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1': { id: 'ms-existing' },
      },
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 })),
    );

    const caught = await catchThrown(actions.renew(fakeEvent({ tier: 'individual' }, db, 'sk_test_1') as never));
    expect(isRedirect(caught)).toBe(true);

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO memberships'))).toBe(false);
    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual(['individual', 250, 'ms-existing']);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    expect(new URLSearchParams(body).get('metadata[refId]')).toBe('ms-existing');
  });

  it('degrades to a renewStubbed result, never throwing, when STRIPE_SECRET_KEY is not bound', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
        "'current_season'": { value: '2026' },
        'AND paid_at IS NOT NULL LIMIT 1': null,
        'AND (paid_at IS NULL OR refunded_at IS NOT NULL) LIMIT 1': null,
      },
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
    });
    const result = await actions.renew(fakeEvent({ tier: 'individual' }, db) as never);
    expect(result).toEqual({ renewStubbed: true });
  });

  it('refuses an unrecognized tier before touching the database', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM member_sessions': MEMBER_ROW, 'FROM households WHERE id': { primary_member_id: 'mem-1' } },
    });
    const result = await actions.renew(fakeEvent({ tier: 'platinum' }, db) as never);
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
    expect(calls.some((c) => c.sql.startsWith('INSERT') || c.sql.startsWith('UPDATE'))).toBe(false);
  });
});
