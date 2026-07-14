// Generic Stripe Checkout Session creation for every kind of payment the club needs to collect
// online (dues, class fees, asset fees): the ops parity audit's #1 blocker. `createCheckout`
// generalizes this site's own proven Stripe integration (`$theme/donate-pricing.ts`'s
// `buildStripeCheckoutBody`, `$theme/donate.remote.ts`'s STRIPE_SECRET_KEY read and its graceful
// degrade when unbound) into one helper every consumer shares, rather than each payment kind
// hand-rolling its own fetch call the way the donate flow did before this module existed.
//
// STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both already set on the live worker, sandbox
// mode (see this worktree's own README): a caller with no key still degrades to the stub signal
// below rather than throwing, the same posture every other optional site secret already takes
// (TURNSTILE_SECRET_KEY, EMAIL), for any environment (a preview deploy, a future site fork) that
// has not provisioned its own key yet.
//
// Every session this helper creates carries `metadata[kind]`/`metadata[refId]`: the webhook
// (`src/routes/(site)/api/stripe/webhook/+server.ts`) reads those two fields back, and only
// those two, to decide which row a completed session reconciles.
//
// DEFERRED CONSUMERS (not wired in this worktree, both `portal-capstone`'s own work): the join/
// renewal flow that would create an unpaid `memberships` row and immediately call
// `createCheckout({ kind: 'dues', refId: membership.id, ... })` (the seam's natural landing spot
// is `/my-account`, near `getMemberStanding`'s own `'grace'`/`'lapsed'` states, see that route's
// own comment), and the approved-asset-request "pay to confirm" screen that would call
// `createCheckout({ kind: 'asset-fee', refId: assignment.id, ... })` once an `asset_requests` row
// resolves to a real `asset_assignments` row (see `assets-store.ts`'s own header on why that
// table carries no "pending payment" status to gate on). The webhook's own reconciliation for
// both kinds (`stripe-reconcile.ts`) is already built and tested; only the call sites that CREATE
// the session are missing, deliberately left to the worktree that owns those screens.

/** The four kinds of payment the club collects through Stripe Checkout today. `donation` joined
 *  the other three (`docs/2026-07-13-money-ledger-design.md`'s "Live write path") once the
 *  ledger gave a donation somewhere durable to land; `donate.remote.ts` mints its own `refId`
 *  (a fresh uuid with no domain row behind it) rather than pointing at one, since a donation has
 *  no domain row of its own. */
export const PAYMENT_KINDS = ['dues', 'class-fee', 'asset-fee', 'donation'] as const;

/** One allowed payment kind, also the webhook's own dispatch key. */
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/** The slice of `App.Platform['env']` `createCheckout` actually reads: a plain, loosely-typed
 *  argument (mirroring `enrollments.ts`'s own `ClassSignupEnv` reasoning), so a caller never has
 *  to satisfy the site's full `Platform['env']` shape just to create a Checkout session. */
export interface CreateCheckoutEnv {
  STRIPE_SECRET_KEY?: string;
}

/** `createCheckout`'s own arguments. `refId` is the row this payment is FOR (a `memberships.id`
 *  for `'dues'`, a `class_enrollments.id` for `'class-fee'`, an `asset_assignments.id` for
 *  `'asset-fee'`): carried into the session's metadata verbatim, and the webhook's only handle on
 *  which row to reconcile. `successPath`/`cancelPath` are origin-relative (e.g.
 *  `/payment/confirmation/`), matching `donate-pricing.ts`'s own `origin` + relative-path shape;
 *  `origin` is the caller's own request origin (`url.origin` in a remote function, the same
 *  value `donate.remote.ts` already reads this way). The success URL always gets Stripe's own
 *  `{CHECKOUT_SESSION_ID}` placeholder appended, exactly as `buildStripeCheckoutBody` does. */
export interface CreateCheckoutArgs {
  kind: PaymentKind;
  refId: string;
  amountCents: number;
  /** The line item's own display name on the Checkout page (e.g. "2026 Family Membership",
   *  "Fleet Tune-Up Weekend class fee", "Mooring fee -- Buoy M-14"). */
  description: string;
  origin: string;
  successPath: string;
  cancelPath: string;
  /** Pre-fills Stripe's own email field when the payer's address is already known (a signed-in
   *  member paying dues, say); omitted, Stripe collects it fresh. */
  customerEmail?: string;
  /** Stripe's own `product_data.description`, the line item's longer strapline below its name
   *  (distinct from {@link description} above, which is the product's display name). Only the
   *  donation kind uses this today (the tax-deductible notice `donate.remote.ts` used to carry
   *  in its own hand-rolled body). */
  productDescription?: string;
  /** Extra session metadata beyond the `kind`/`refId` pair every reconciler already reads (a
   *  donor's optional note, say). Merged in after `kind`/`refId`, so a caller cannot collide
   *  with either. */
  metadata?: Record<string, string>;
}

/** `createCheckout`'s success shape: the Checkout Session's own redirect URL. */
export interface CheckoutCreated {
  url: string;
}

/** `createCheckout`'s keyless-degrade shape: `STRIPE_SECRET_KEY` is not bound yet (see this
 *  module's own header), so no real session was created. A caller shows the same honest
 *  "payment coming soon" message every other optional-secret feature already shows, never a
 *  broken checkout. */
export interface CheckoutStubbed {
  stub: true;
}

export type CreateCheckoutResult = CheckoutCreated | CheckoutStubbed;

/** Thrown when a Stripe key IS configured but creating the session still failed: the network
 *  call itself errored, or Stripe's API answered with a non-2xx status. Distinct from the
 *  keyless-degrade case above, which is not an error at all, just an unconfigured feature; a
 *  caller catches this and shows the same "try again, or email the club" message
 *  `donate.remote.ts`'s own fetch-failure branch already shows. */
export class CheckoutUnavailableError extends Error {}

const STRIPE_CHECKOUT_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';

/**
 * The `application/x-www-form-urlencoded` body for `POST /v1/checkout/sessions`, generalizing
 * `donate-pricing.ts`'s own `buildStripeCheckoutBody` across every payment kind. `success_url` is
 * appended as a raw string, not through `URLSearchParams`, for the same reason that module's own
 * doc comment gives: `URLSearchParams` would percent-encode the `{CHECKOUT_SESSION_ID}`
 * placeholder Stripe expects literal.
 */
export function buildCheckoutBody(args: CreateCheckoutArgs): string {
  const { kind, refId, amountCents, description, origin, cancelPath, customerEmail, productDescription, metadata } = args;
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': description,
    ...(productDescription ? { 'line_items[0][price_data][product_data][description]': productDescription } : {}),
    'line_items[0][quantity]': '1',
    cancel_url: `${origin}${cancelPath}`,
    'metadata[kind]': kind,
    'metadata[refId]': refId,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
  });
  for (const [key, value] of Object.entries(metadata ?? {})) {
    params.set(`metadata[${key}]`, value);
  }
  return `${params.toString()}&success_url=${origin}${args.successPath}?session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * Create a Stripe Checkout Session for one of the three payment kinds. Degrades to
 * {@link CheckoutStubbed} when `STRIPE_SECRET_KEY` is not bound (this module's own header); once
 * it is, a network failure or a non-2xx Stripe response throws {@link CheckoutUnavailableError}
 * rather than degrading, since that failure is transient and worth surfacing as "try again", not
 * silently indistinguishable from the feature being off.
 */
export async function createCheckout(env: CreateCheckoutEnv, args: CreateCheckoutArgs): Promise<CreateCheckoutResult> {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { stub: true };

  const body = buildCheckoutBody(args);
  let response: Response;
  try {
    response = await fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new CheckoutUnavailableError('We could not reach the payment service. You can email board@aksailingclub.org instead.');
  }
  if (!response.ok) {
    throw new CheckoutUnavailableError('Payment service is temporarily unavailable. You can email board@aksailingclub.org instead.');
  }

  const session = (await response.json()) as { url: string };
  return { url: session.url };
}
