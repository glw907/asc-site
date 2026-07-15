// The donate form's remote function (completion-pass manifest item 2): creates a Stripe Checkout
// Session for a one-time donation, ported from the retiring Worker's own
// src/lib/handlers/donate.js. STRIPE_SECRET_KEY is a site-owned Worker secret this environment
// has not provisioned yet (see src/app.d.ts); with it absent, the form degrades to the same
// graceful message the live handler itself falls back to, rather than a broken checkout.
//
// The Checkout Session itself now goes through `$admin-club/lib/payments`'s `createCheckout`
// (the money-ledger design, "Live write path": a fourth `donation` kind joined the other three),
// rather than this module's own hand-rolled fetch: the webhook's donation reconciler needs the
// same `metadata.kind`/`metadata.refId` pair every other kind already carries to record the
// donation in the ledger, and `createCheckout` is the one place that pair gets set.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { donationAmountError } from '$theme/donate-pricing';
import { verifyTurnstile } from '$theme/turnstile';
import { checkRateLimit, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';
import { createCheckout, CheckoutUnavailableError } from '$admin-club/lib/payments';

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

  // Coverage table item 1, the money-path tightest cap (docs/2026-07-15-payments-live-smoke-
  // design.md section 2b): the donation form carries no email field, so this keys on IP alone.
  if (!(await checkRateLimit(platform?.env?.RATE_LIMIT_MONEY, `ip:${getClientAddress()}`))) {
    invalid(RATE_LIMIT_MESSAGE);
  }

  const amountCents = Math.round(Number(amount) * 100);
  const amountError = donationAmountError(amountCents);
  if (amountError) invalid(amountError);

  const secret = platform?.env?.TURNSTILE_SECRET_KEY;
  if (secret && !(await verifyTurnstile(token, getClientAddress(), secret))) {
    invalid('Please complete the verification.');
  }

  let result: Awaited<ReturnType<typeof createCheckout>>;
  try {
    result = await createCheckout(platform?.env ?? {}, {
      kind: 'donation',
      refId: crypto.randomUUID(),
      amountCents,
      description: 'Donation for the Alaska Sailing Club',
      productDescription: 'Tax-deductible donation to the Alaska Sailing Club, a 501(c)(3) nonprofit.',
      origin: url.origin,
      successPath: '/payment/confirmation/',
      cancelPath: '/donate/',
      ...(note ? { metadata: { note } } : {}),
    });
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) invalid(err.message);
    throw err;
  }

  if ('stub' in result) {
    invalid('Payment service is temporarily unavailable. You can email board@aksailingclub.org instead.');
  }
  return { url: result.url };
});
