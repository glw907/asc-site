// The Stripe webhook (Stripe's own dashboard is already pointed at this exact path, sandbox mode,
// per this worktree's own README): the one place a completed Checkout Session (`payments.ts`'s
// `createCheckout`) actually reconciles into asc-club's own tables. Every response is either 400
// (a verification or shape failure Stripe should NOT keep retrying: a signature that will never
// verify, a payload that will never parse, stays wrong forever) or 200 (everything else,
// INCLUDING a reconciliation refusal or an unexpected database error, both logged loudly via
// `console.error` rather than thrown): a non-2xx response makes Stripe redeliver the same event
// for up to three days, and a persistently-unreconcilable event (a stale `refId`, a genuine
// outage) can never self-heal from a retry, so answering 200 and relying on Workers Logs for
// operator visibility (this repo's own "diagnose from the logs first" convention, CLAUDE.md) beats
// an infinite redelivery loop. `stripe-reconcile.ts`'s own header carries the reconciliation
// engine's reasoning; this route is intentionally thin, verify-then-dispatch only.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyStripeWebhook } from '$admin-club/lib/stripe-webhook-verify';
import { claimStripeSession, parseSessionMetadata, reconcileCheckoutSession, type StripeCheckoutSession } from '$admin-club/lib/stripe-reconcile';

export const prerender = false;

interface StripeWebhookEvent {
  type: string;
  data?: { object?: unknown };
}

/** A structural check, not a full Stripe SDK parse: this route reads only `id`, `amount_total`,
 *  and `metadata` off the Checkout Session object (`stripe-reconcile.ts`'s own header on why
 *  `metadata.kind`/`metadata.refId` are the only fields any reconciler trusts). */
function isStripeCheckoutSession(value: unknown): value is StripeCheckoutSession {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string';
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const webhookSecret = platform?.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Not expected in production (this worktree's own README: the sandbox secret is already set
    // on the live worker); a real config gap in some other environment degrades the same honest
    // way every other optional site secret does, rather than a crash.
    console.error('api/stripe/webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return new Response('Stripe webhook is not configured.', { status: 503 });
  }

  const rawBody = await request.text();

  let verified: Awaited<ReturnType<typeof verifyStripeWebhook>>;
  try {
    verified = await verifyStripeWebhook(rawBody, request.headers.get('stripe-signature'), webhookSecret);
  } catch (err) {
    console.error('api/stripe/webhook: signature verification failed', err);
    return new Response('Invalid signature.', { status: 400 });
  }

  const event = verified.event as StripeWebhookEvent;
  if (typeof event?.type !== 'string') {
    return new Response('Malformed event payload.', { status: 400 });
  }

  // Every other Stripe event type is a clean, silent ack: this webhook is registered for
  // `checkout.session.completed` only, but Stripe's own dashboard can widen an endpoint's
  // subscribed events later without this route ever needing a matching code change.
  if (event.type !== 'checkout.session.completed') {
    return json({ received: true });
  }

  const session = event.data?.object;
  if (!isStripeCheckoutSession(session)) {
    return new Response('Malformed session payload.', { status: 400 });
  }

  const meta = parseSessionMetadata(session);
  if (!meta) {
    return new Response('Malformed session metadata.', { status: 400 });
  }

  const db = platform?.env.CLUB_DB;
  if (!db) {
    console.error('api/stripe/webhook: CLUB_DB is not bound');
    return new Response('Not available right now.', { status: 503 });
  }

  try {
    const claimed = await claimStripeSession(db, session.id, meta.kind, meta.refId);
    if (!claimed) {
      // Already reconciled by an earlier delivery of this exact session id: a clean, idempotent
      // no-op (`stripe-reconcile.ts`'s own header), never a second write or a second receipt.
      return json({ received: true, duplicate: true });
    }

    const outcome = await reconcileCheckoutSession(db, platform.env, meta.kind, meta.refId, session);
    if (!outcome.ok) {
      console.error(`api/stripe/webhook: reconciliation refused for session ${session.id} (${meta.kind}/${meta.refId}): ${outcome.reason}`);
    }
  } catch (err) {
    // An unexpected failure past the session claim (a D1 outage, say): this route's own header on
    // why a 500 here would be worse, not better, than logging and acking.
    console.error(`api/stripe/webhook: reconciliation threw for session ${session.id} (${meta.kind}/${meta.refId})`, err);
  }

  return json({ received: true });
};
