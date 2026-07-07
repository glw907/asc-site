import { describe, it, expect } from 'vitest';
import { donationAmountError, buildStripeCheckoutBody, DONATE_PRESETS } from '$theme/donate-pricing';

describe('donationAmountError', () => {
  it('accepts a preset amount in cents', () => {
    expect(donationAmountError(5000)).toBeUndefined();
  });

  it('rejects an amount below $1', () => {
    expect(donationAmountError(50)).toMatch(/valid donation amount/);
  });

  it('rejects an amount above $9,999', () => {
    expect(donationAmountError(1_000_000)).toMatch(/valid donation amount/);
  });

  it('rejects a non-finite or fractional-cent amount', () => {
    expect(donationAmountError(NaN)).toBeDefined();
    expect(donationAmountError(50.5)).toBeDefined();
  });

  it('lists the four preset amounts the live site offered', () => {
    expect(DONATE_PRESETS).toEqual([50, 100, 250, 500]);
  });
});

describe('buildStripeCheckoutBody', () => {
  it('carries the amount, currency, and redirect URLs', () => {
    const body = buildStripeCheckoutBody({ amountCents: 5000, origin: 'https://dev.aksailingclub.org' });
    const params = new URLSearchParams(body);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('5000');
    expect(params.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(params.get('cancel_url')).toBe('https://dev.aksailingclub.org/donate/');
    expect(body).toContain('success_url=https://dev.aksailingclub.org/payment/confirmation/?session_id={CHECKOUT_SESSION_ID}');
  });

  it('omits the note metadata when none is given', () => {
    const body = buildStripeCheckoutBody({ amountCents: 5000, origin: 'https://dev.aksailingclub.org' });
    expect(new URLSearchParams(body).has('metadata[note]')).toBe(false);
  });

  it('carries a donor note as checkout metadata', () => {
    const body = buildStripeCheckoutBody({
      amountCents: 5000,
      origin: 'https://dev.aksailingclub.org',
      note: 'In memory of a good sailor',
    });
    expect(new URLSearchParams(body).get('metadata[note]')).toBe('In memory of a good sailor');
  });
});
