import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { POST } from '../routes/(site)/api/stripe/webhook/+server';
import { fakeD1 } from './_fake-d1';

const SECRET = 'whsec_test_secret';
// The route calls `verifyStripeWebhook` with no `nowSeconds` override, so it defaults to the real
// clock: a fixed past epoch here (matching `stripe-webhook-verify.test.ts`'s own `NOW`) would sit
// outside the verify function's own 300-second replay window and fail every signed request in this
// file for a reason unrelated to what each test actually means to exercise.
const NOW = Math.floor(Date.now() / 1000);

async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(body: string, timestamp = NOW, secret = SECRET): Promise<Request> {
  const sig = await sign(secret, timestamp, body);
  return new Request('https://dev.aksailingclub.org/api/stripe/webhook', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': `t=${timestamp},v1=${sig}` },
  });
}

const MEMBERSHIP_ROW = { id: 'mem-1', household_id: 'hh-1', tier: 'family' as const, season: 2026, paid_at: null };
const HOUSEHOLD_ROW = { primary_member_id: null }; // no primary member: reconciles, sends nothing (this test's own focus is the route, not the email)

function completedSessionEvent(overrides: Partial<{ id: string; amount_total: number | null; metadata: Record<string, string> | null }> = {}): string {
  return JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', amount_total: 25000, metadata: { kind: 'dues', refId: 'mem-1' }, ...overrides } },
  });
}

function eventFor(request: Request, env: Record<string, unknown>) {
  return { request, platform: { env } } as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/stripe/webhook', () => {
  it('503s when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const request = await signedRequest(completedSessionEvent());
    const response = await POST(eventFor(request, {}));
    expect(response.status).toBe(503);
  });

  it('400s an invalid signature', async () => {
    const body = completedSessionEvent();
    const request = await signedRequest(body, NOW, 'whsec_wrong');
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(response.status).toBe(400);
  });

  it('400s a missing Stripe-Signature header', async () => {
    const request = new Request('https://dev.aksailingclub.org/api/stripe/webhook', { method: 'POST', body: completedSessionEvent() });
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(response.status).toBe(400);
  });

  it('200s a verified event of a type this route does not act on, without touching the database', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'payment_intent.succeeded', data: { object: {} } });
    const request = await signedRequest(body);
    const { db, calls } = fakeD1();
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET, CLUB_DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(calls).toHaveLength(0);
  });

  it('400s a checkout.session.completed event whose session has no id', async () => {
    const body = JSON.stringify({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { amount_total: 100 } } });
    const request = await signedRequest(body);
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(response.status).toBe(400);
  });

  it('400s a checkout.session.completed event with malformed metadata', async () => {
    const body = completedSessionEvent({ metadata: { kind: 'donation', refId: 'x' } });
    const request = await signedRequest(body);
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(response.status).toBe(400);
  });

  it('503s when CLUB_DB is not bound', async () => {
    const request = await signedRequest(completedSessionEvent());
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET }));
    expect(response.status).toBe(503);
  });

  it('reconciles a first delivery: claims the session and writes the row', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM memberships WHERE id': MEMBERSHIP_ROW, 'FROM households WHERE id': HOUSEHOLD_ROW },
    });
    const request = await signedRequest(completedSessionEvent());
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET, CLUB_DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(calls.some((c) => c.sql.startsWith('INSERT OR IGNORE INTO processed_stripe_sessions'))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE memberships'))).toBe(true);
  });

  it('is a clean idempotent no-op on a redelivered session id, never re-querying the reconciled row', async () => {
    const { db, calls } = fakeD1({
      runResults: { 'INSERT OR IGNORE INTO processed_stripe_sessions': { changes: 0 } },
    });
    const request = await signedRequest(completedSessionEvent());
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET, CLUB_DB: db }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(calls.some((c) => c.sql.includes('FROM memberships'))).toBe(false);
  });

  it('answers 200, not 500, when reconciliation throws unexpectedly after the session was already claimed', async () => {
    const throwingDb = {
      prepare(sql: string) {
        const stmt = {
          bind: () => stmt,
          async first() {
            if (sql.includes('FROM memberships WHERE id')) throw new Error('D1 outage');
            return null;
          },
          async run() {
            return { results: [], success: true, meta: { changes: 1 } };
          },
          async all() {
            return { results: [], success: true, meta: {} };
          },
        };
        return stmt;
      },
      async batch() {
        return [];
      },
    } as unknown as D1Database;

    const request = await signedRequest(completedSessionEvent());
    const response = await POST(eventFor(request, { STRIPE_WEBHOOK_SECRET: SECRET, CLUB_DB: throwingDb }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});
