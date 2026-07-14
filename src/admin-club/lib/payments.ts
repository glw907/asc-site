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

/** The five kinds of payment the club collects through Stripe Checkout today. `donation` joined
 *  the other three (`docs/2026-07-13-money-ledger-design.md`'s "Live write path") once the
 *  ledger gave a donation somewhere durable to land; `donate.remote.ts` mints its own `refId`
 *  (a fresh uuid with no domain row behind it) rather than pointing at one, since a donation has
 *  no domain row of its own. `join` is the unified-signup initiative's own fifth kind
 *  (`docs/2026-07-13-unified-signup-design.md`): a `refId` pointing at the new `memberships` row
 *  a combined join-plus-classes checkout pays for, reconciled by `stripe-reconcile.ts`'s own
 *  `reconcileJoin`. */
export const PAYMENT_KINDS = ['dues', 'class-fee', 'asset-fee', 'donation', 'join'] as const;

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
  /** A multi-line Checkout Session (the `join` kind's own combined dues-plus-class-fees
   *  session): when given and non-empty, `buildCheckoutBody` emits one indexed
   *  `line_items[i][...]` group per entry instead of the single `line_items[0]` built from
   *  {@link amountCents}/{@link description} above, which are then ignored entirely. A
   *  single-line caller (every kind but `join`, today) omits this field and is byte-identical
   *  to before this field existed. */
  lines?: Array<{
    amountCents: number;
    /** The line item's own display name (`price_data.product_data.name`), matching
     *  {@link description}'s role in the single-line shape. */
    name: string;
    /** The line item's own longer strapline (`price_data.product_data.description`), matching
     *  {@link productDescription}'s role in the single-line shape. Omitted, Stripe shows no
     *  strapline for that line. */
    description?: string;
  }>;
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

/** `args.metadata`'s own keys this module already writes itself (`kind`/`refId`, both set from
 *  `args.kind`/`args.refId` above, never from caller-supplied metadata): skipped in the loop
 *  below so the doc comment's "cannot collide with either" claim on {@link CreateCheckoutArgs.metadata}
 *  is actually true, rather than merely intended. */
const RESERVED_METADATA_KEYS = new Set(['kind', 'refId']);

/**
 * The `application/x-www-form-urlencoded` body for `POST /v1/checkout/sessions`, generalizing
 * `donate-pricing.ts`'s own `buildStripeCheckoutBody` across every payment kind. `success_url` is
 * appended as a raw string, not through `URLSearchParams`, for the same reason that module's own
 * doc comment gives: `URLSearchParams` would percent-encode the `{CHECKOUT_SESSION_ID}`
 * placeholder Stripe expects literal.
 *
 * `args.lines`, when given and non-empty, builds one indexed `line_items[i][...]` group per
 * entry instead of the single `line_items[0]` group the `amountCents`/`description`/
 * `productDescription` fields build otherwise; a single-line call (no `lines`) produces the
 * exact same key order and content as before `lines` existed.
 */
export function buildCheckoutBody(args: CreateCheckoutArgs): string {
  const { kind, refId, amountCents, description, origin, cancelPath, customerEmail, productDescription, metadata, lines } = args;

  const lineItemParams: Record<string, string> =
    lines && lines.length > 0
      ? lines.reduce<Record<string, string>>((acc, line, i) => {
          acc[`line_items[${i}][price_data][currency]`] = 'usd';
          acc[`line_items[${i}][price_data][unit_amount]`] = String(line.amountCents);
          acc[`line_items[${i}][price_data][product_data][name]`] = line.name;
          if (line.description) acc[`line_items[${i}][price_data][product_data][description]`] = line.description;
          acc[`line_items[${i}][quantity]`] = '1';
          return acc;
        }, {})
      : {
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': String(amountCents),
          'line_items[0][price_data][product_data][name]': description,
          ...(productDescription ? { 'line_items[0][price_data][product_data][description]': productDescription } : {}),
          'line_items[0][quantity]': '1',
        };

  const params = new URLSearchParams({
    mode: 'payment',
    ...lineItemParams,
    cancel_url: `${origin}${cancelPath}`,
    'metadata[kind]': kind,
    'metadata[refId]': refId,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
  });
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (RESERVED_METADATA_KEYS.has(key)) continue;
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

/** {@link issueStripeRefund}'s own arguments: `processorRef` is a ledger charge's own
 *  `processorRef` (`money-store.ts`'s `TimelineTransaction`), a Checkout Session id (`cs_...`) or
 *  a payment intent id (`pi_...`) -- the two prefixes `apiEligible` already restricts a refundable
 *  charge to (`money-store.ts`'s own `isApiEligible`). `amountCents` is the refund's own amount,
 *  which may be less than the charge's full total (a partial refund). `idempotencyKey` is
 *  {@link buildRefundIdempotencyKey}'s own output, always required so the header below is never
 *  optional at the call site. */
export interface IssueRefundArgs {
  processorRef: string;
  amountCents: number;
  idempotencyKey: string;
}

/** One line the admin selected to refund, as {@link buildRefundIdempotencyKey} needs it: mirrors
 *  `refunds.ts`'s own `RefundLineSelection` shape structurally without importing it, since that
 *  module already imports THIS one for {@link issueStripeRefund} and a reverse import would cycle. */
export interface RefundLinePick {
  lineId: string;
  amountCents: number;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a Stripe `Idempotency-Key` for one refund attempt: a SHA-256 hex digest of the charge's
 * own id, how many cents of that charge had already come back BEFORE this attempt
 * (`refundedSoFarCents`, `refunds.ts`'s own read off `money-store.ts`'s per-line `refundedCents`),
 * and the sorted `lineId=amountCents` pairs of what is being refunded now. Same inputs always
 * produce the same key, which is exactly the self-healing property this exists for: if Stripe
 * succeeds but the ledger write that follows it fails (a transient D1 error), nothing in this
 * charge's own refunded state has changed, so the admin's retry recomputes the IDENTICAL key,
 * Stripe answers with the SAME refund object instead of creating a second one, and the retry's
 * ledger batch then lands cleanly -- no double money moved. Once the charge's own refunded-so-far
 * state genuinely advances (an earlier or later, unrelated refund against the same charge),
 * `refundedSoFarCents` differs and the key changes, so a genuinely new refund is never blocked by
 * an old one's key.
 */
export async function buildRefundIdempotencyKey(chargeTransactionId: string, refundedSoFarCents: number, picks: RefundLinePick[]): Promise<string> {
  const pairs = [...picks]
    .sort((a, b) => a.lineId.localeCompare(b.lineId))
    .map((pick) => `${pick.lineId}=${pick.amountCents}`)
    .join(',');
  return sha256Hex(`refund:${chargeTransactionId}:${refundedSoFarCents}:${pairs}`);
}

/** `issueStripeRefund`'s success shape: the Stripe refund object's own id, so the caller can
 *  snapshot it as the ledger refund transaction's `processorRef`. */
export type IssueRefundResult = { ok: true; refundId: string } | { ok: false; error: string };

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Issue a refund against a charge this site's own checkout created (never an imported MW row, a
 * PayPal row, or a check/cash row -- `refunds.ts`'s own `apiEligible` gate keeps those on the
 * record-only path instead). A `cs_...` session id is resolved to its payment intent with a GET
 * first, since Stripe's refunds endpoint refunds a payment intent (or a charge), never a session
 * directly; a `pi_...` ref refunds straight away. Raw fetch with `STRIPE_SECRET_KEY`, matching
 * {@link createCheckout}'s own idiom -- no Stripe SDK, `application/x-www-form-urlencoded`
 * bodies. The refund POST itself carries `args.idempotencyKey` as Stripe's own `Idempotency-Key`
 * header ({@link buildRefundIdempotencyKey}'s own header explains the dedupe/self-healing
 * property this buys); the session-resolution GET carries no such header, since it mutates
 * nothing. Never throws: every failure (no key configured, an unreachable network, an
 * unrecognized ref, a non-2xx Stripe response) answers `{ ok: false }` so the caller
 * (`refunds.ts`'s `executeRefund`) can turn it into "writes nothing" without a `try`/`catch` of
 * its own.
 */
export async function issueStripeRefund(env: CreateCheckoutEnv, args: IssueRefundArgs): Promise<IssueRefundResult> {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { ok: false, error: 'STRIPE_SECRET_KEY is not configured.' };

  let paymentIntentId = args.processorRef;
  if (args.processorRef.startsWith('cs_')) {
    let sessionResponse: Response;
    try {
      sessionResponse = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${args.processorRef}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
    } catch {
      return { ok: false, error: 'We could not reach the payment service to resolve this charge. You can email board@aksailingclub.org instead.' };
    }
    if (!sessionResponse.ok) {
      return { ok: false, error: 'The payment service could not find that checkout session.' };
    }
    const session = (await sessionResponse.json()) as { payment_intent: string | null };
    if (!session.payment_intent) {
      return { ok: false, error: 'That checkout session carries no payment to refund.' };
    }
    paymentIntentId = session.payment_intent;
  } else if (!args.processorRef.startsWith('pi_')) {
    return { ok: false, error: `Unrecognized processor reference: ${args.processorRef}` };
  }

  let refundResponse: Response;
  try {
    refundResponse = await fetch(`${STRIPE_API_BASE}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': args.idempotencyKey,
      },
      body: new URLSearchParams({ payment_intent: paymentIntentId, amount: String(args.amountCents) }).toString(),
    });
  } catch {
    return { ok: false, error: 'We could not reach the payment service to issue this refund. You can email board@aksailingclub.org instead.' };
  }
  if (!refundResponse.ok) {
    return { ok: false, error: 'The payment service refused this refund. You can email board@aksailingclub.org instead.' };
  }

  const refund = (await refundResponse.json()) as { id: string };
  return { ok: true, refundId: refund.id };
}
