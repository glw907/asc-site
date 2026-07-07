// The donate form's remote function (completion-pass manifest item 2): creates a Stripe Checkout
// Session for a one-time donation, ported from the retiring Worker's own
// src/lib/handlers/donate.js. STRIPE_SECRET_KEY is a site-owned Worker secret this environment
// has not provisioned yet (see src/app.d.ts); with it absent, the form degrades to the same
// graceful message the live handler itself falls back to, rather than a broken checkout.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { donationAmountError, buildStripeCheckoutBody } from '$theme/donate-pricing';
import { verifyTurnstile } from '$theme/turnstile';

const donateSchema = v.object({
  // The dollar amount the client-side preset buttons or the custom-amount input settled on,
  // carried in a hidden field; validated as cents once parsed below.
  amount: v.pipe(v.string(), v.trim(), v.nonEmpty('Please choose or enter a donation amount.')),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500, 'Keep the note under 500 characters.')), ''),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export const createDonationCheckout = form(donateSchema, async ({ amount, note, 'cf-turnstile-response': token }) => {
  const { platform, getClientAddress, url } = getRequestEvent();

  const amountCents = Math.round(Number(amount) * 100);
  const amountError = donationAmountError(amountCents);
  if (amountError) invalid(amountError);

  const secret = platform?.env?.TURNSTILE_SECRET_KEY;
  if (secret && !(await verifyTurnstile(token, getClientAddress(), secret))) {
    invalid('Please complete the verification.');
  }

  const stripeKey = platform?.env?.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    invalid('Payment service is temporarily unavailable. You can email board@aksailingclub.org instead.');
  }

  const body = buildStripeCheckoutBody({ amountCents, note: note || undefined, origin: url.origin });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => invalid('We could not reach the payment service. You can email board@aksailingclub.org instead.'));

  if (!response.ok) {
    invalid('Payment service is temporarily unavailable. You can email board@aksailingclub.org instead.');
  }

  const session = (await response.json()) as { url: string };
  return { url: session.url };
});
