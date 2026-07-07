// The donate form's amount validation and the Stripe Checkout Session request body, ported from
// the retiring Worker's src/lib/handlers/donate.js. Pure and dependency-free so the amount rules
// and the request-body shape are unit-testable without a live Stripe account; donate.remote.ts
// only wires this to the actual fetch.

/** The four preset amounts the form offers, in dollars. */
export const DONATE_PRESETS: readonly number[] = [50, 100, 250, 500];

const MIN_CENTS = 100; // $1
const MAX_CENTS = 999_900; // $9,999

/** The donation amount's own validation message, or undefined when the amount is acceptable. */
export function donationAmountError(amountCents: number): string | undefined {
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return 'Please enter a valid donation amount between $1 and $9,999.';
  }
  return undefined;
}

/** What a checkout session needs to build the Stripe request body. */
export interface DonationCheckoutInput {
  amountCents: number;
  /** A donor's optional note, already trimmed and length-capped by the caller. */
  note?: string;
  /** The request's own origin, for the cancel/success redirect URLs. */
  origin: string;
}

/**
 * The `application/x-www-form-urlencoded` body for `POST /v1/checkout/sessions`. `success_url` is
 * appended as a raw string rather than through `URLSearchParams`, which would percent-encode the
 * `{CHECKOUT_SESSION_ID}` placeholder Stripe expects literal.
 */
export function buildStripeCheckoutBody(input: DonationCheckoutInput): string {
  const { amountCents, note, origin } = input;
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': 'Donation for the Alaska Sailing Club',
    'line_items[0][price_data][product_data][description]':
      "Tax-deductible donation to the Alaska Sailing Club, a 501(c)(3) nonprofit.",
    'line_items[0][quantity]': '1',
    cancel_url: `${origin}/donate/`,
    'metadata[type]': 'donation',
    ...(note ? { 'metadata[note]': note } : {}),
  });
  return `${params.toString()}&success_url=${origin}/payment/confirmation/?session_id={CHECKOUT_SESSION_ID}`;
}
