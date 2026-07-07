import { describe, expect, it } from 'vitest';
import { verifyStripeWebhook } from '$admin-club/lib/stripe-webhook-verify';

const SECRET = 'whsec_test_secret';
const BODY = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const NOW = 1_700_000_000;

async function sign(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function header(timestamp: number, sigs: string[]): Promise<string> {
  return [`t=${timestamp}`, ...sigs.map((s) => `v1=${s}`)].join(',');
}

describe('verifyStripeWebhook', () => {
  it('verifies a valid signature and returns the parsed event', async () => {
    const sig = await sign(SECRET, NOW, BODY);
    const result = await verifyStripeWebhook(BODY, await header(NOW, [sig]), SECRET, NOW);
    expect(result).toEqual({ event: JSON.parse(BODY), timestamp: NOW });
  });

  it('throws for a wrong secret', async () => {
    const sig = await sign('whsec_other', NOW, BODY);
    await expect(verifyStripeWebhook(BODY, await header(NOW, [sig]), SECRET, NOW)).rejects.toThrow('signature verification failed');
  });

  it('throws for a tampered body', async () => {
    const sig = await sign(SECRET, NOW, BODY);
    await expect(verifyStripeWebhook(`${BODY} `, await header(NOW, [sig]), SECRET, NOW)).rejects.toThrow('signature verification failed');
  });

  it('throws for a missing header', async () => {
    await expect(verifyStripeWebhook(BODY, null, SECRET, NOW)).rejects.toThrow('missing Stripe-Signature header');
  });

  it('throws for a malformed header (no v1, no t)', async () => {
    await expect(verifyStripeWebhook(BODY, 'garbage', SECRET, NOW)).rejects.toThrow('malformed Stripe-Signature');
  });

  it('throws when the timestamp is outside the replay window', async () => {
    const staleTimestamp = NOW - 301;
    const sig = await sign(SECRET, staleTimestamp, BODY);
    await expect(verifyStripeWebhook(BODY, await header(staleTimestamp, [sig]), SECRET, NOW)).rejects.toThrow('replay window');
  });

  it('accepts a timestamp exactly at the replay window edge', async () => {
    const edgeTimestamp = NOW - 300;
    const sig = await sign(SECRET, edgeTimestamp, BODY);
    const result = await verifyStripeWebhook(BODY, await header(edgeTimestamp, [sig]), SECRET, NOW);
    expect(result.timestamp).toBe(edgeTimestamp);
  });

  it('tolerates multiple v1 signatures (secret rotation), matching any one of them', async () => {
    const goodSig = await sign(SECRET, NOW, BODY);
    const staleSig = await sign('whsec_old', NOW, BODY);
    const result = await verifyStripeWebhook(BODY, await header(NOW, [staleSig, goodSig]), SECRET, NOW);
    expect(result.event).toEqual(JSON.parse(BODY));
  });

  it('replaying the exact same header a second time verifies again (the route, not this function, owns idempotency)', async () => {
    const sig = await sign(SECRET, NOW, BODY);
    const h = await header(NOW, [sig]);
    const first = await verifyStripeWebhook(BODY, h, SECRET, NOW);
    const second = await verifyStripeWebhook(BODY, h, SECRET, NOW);
    expect(first).toEqual(second);
  });
});
