// Stripe webhook signature verification, lifted from the phase-2 payments reference
// implementation (cairn-cms/docs/superpowers/specs/assets/phase-2-reference/stripe-webhook-verify.ts,
// Fable, 2026-07-06), itself the clean Workers-native re-derivation of the retiring ops Worker's
// own hand-rolled verify (aksailingclub-legacy/src/lib/handlers/stripe.js). Guarantees: the
// signature is verified over the RAW body (never a re-serialization of the parsed event, which
// would not match Stripe's own signed bytes); a constant-time digest comparison; a bounded replay
// window; multiple v1 signatures tolerated (Stripe sends several during a secret rotation);
// fail-closed everywhere (every malformed or unverifiable input throws, never a silent pass).
const REPLAY_WINDOW_SECONDS = 300;

/** A verified Stripe webhook event: the parsed JSON body, narrowed by the caller's own dispatch
 *  on `event.type`, plus the header's own verified timestamp. */
export interface VerifiedStripeEvent {
  event: unknown;
  timestamp: number;
}

/**
 * Verify a Stripe `Stripe-Signature` header against `rawBody` (which must be the exact
 * `await request.text()`, untouched: a caller that re-stringifies `JSON.parse(rawBody)` before
 * verifying signs different bytes than Stripe did, and verification fails). Throws on any
 * failure: a missing or malformed header, a timestamp outside `nowSeconds` plus or minus the
 * replay window, or no `v1` signature in the header matching the computed HMAC.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedStripeEvent> {
  if (!signatureHeader) throw new Error('missing Stripe-Signature header');

  // Header shape: t=1699999999,v1=hex,v1=hex,v0=...
  const parts = new Map<string, string[]>();
  for (const seg of signatureHeader.split(',')) {
    const i = seg.indexOf('=');
    if (i < 1) continue;
    const k = seg.slice(0, i).trim();
    const v = seg.slice(i + 1).trim();
    parts.set(k, [...(parts.get(k) ?? []), v]);
  }
  const t = Number(parts.get('t')?.[0]);
  const v1s = parts.get('v1') ?? [];
  if (!Number.isFinite(t) || v1s.length === 0) throw new Error('malformed Stripe-Signature');
  if (Math.abs(nowSeconds - t) > REPLAY_WINDOW_SECONDS) throw new Error('signature outside replay window');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare against EVERY provided v1 (rotation tolerance); accumulate so a match's
  // position never shortcuts the loop.
  let anyMatch = 0;
  for (const sig of v1s) {
    let diff = sig.length ^ expected.length;
    const len = Math.max(sig.length, expected.length);
    for (let i = 0; i < len; i++) {
      diff |= (sig.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
    }
    anyMatch |= diff === 0 ? 1 : 0;
  }
  if (anyMatch !== 1) throw new Error('signature verification failed');

  return { event: JSON.parse(rawBody), timestamp: t };
}
