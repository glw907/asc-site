import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCheckoutBody, CheckoutUnavailableError, createCheckout, PAYMENT_KINDS } from '$admin-club/lib/payments';

const ARGS = {
  kind: 'class-fee' as const,
  refId: 'enr-1',
  amountCents: 10000,
  description: 'Fleet Tune-Up Weekend class fee',
  origin: 'https://dev.aksailingclub.org',
  successPath: '/payment/confirmation/',
  cancelPath: '/classes/fleet-tune-up-weekend/signup/',
};

describe('PAYMENT_KINDS', () => {
  it('lists the four kinds the webhook dispatches on', () => {
    expect(PAYMENT_KINDS).toEqual(['dues', 'class-fee', 'asset-fee', 'donation']);
  });
});

describe('buildCheckoutBody', () => {
  it('carries the amount, kind/refId metadata, and redirect URLs', () => {
    const body = buildCheckoutBody(ARGS);
    const params = new URLSearchParams(body);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('10000');
    expect(params.get('line_items[0][price_data][product_data][name]')).toBe(ARGS.description);
    expect(params.get('metadata[kind]')).toBe('class-fee');
    expect(params.get('metadata[refId]')).toBe('enr-1');
    expect(params.get('cancel_url')).toBe(`${ARGS.origin}${ARGS.cancelPath}`);
    expect(body).toContain(`success_url=${ARGS.origin}${ARGS.successPath}?session_id={CHECKOUT_SESSION_ID}`);
  });

  it('omits customer_email when none is given, carries it when one is', () => {
    expect(new URLSearchParams(buildCheckoutBody(ARGS)).has('customer_email')).toBe(false);
    const withEmail = new URLSearchParams(buildCheckoutBody({ ...ARGS, customerEmail: 'jamie@example.com' }));
    expect(withEmail.get('customer_email')).toBe('jamie@example.com');
  });

  it('omits the product description and any extra metadata when neither is given', () => {
    const params = new URLSearchParams(buildCheckoutBody(ARGS));
    expect(params.has('line_items[0][price_data][product_data][description]')).toBe(false);
    expect(params.has('metadata[note]')).toBe(false);
  });

  it('carries a product description and extra metadata when given', () => {
    const params = new URLSearchParams(
      buildCheckoutBody({
        ...ARGS,
        kind: 'donation',
        productDescription: 'Tax-deductible donation to the Alaska Sailing Club, a 501(c)(3) nonprofit.',
        metadata: { note: 'In memory of a good sailor' },
      }),
    );
    expect(params.get('line_items[0][price_data][product_data][description]')).toBe(
      'Tax-deductible donation to the Alaska Sailing Club, a 501(c)(3) nonprofit.',
    );
    expect(params.get('metadata[note]')).toBe('In memory of a good sailor');
  });
});

describe('createCheckout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('degrades to a stub when STRIPE_SECRET_KEY is not bound, never throwing', async () => {
    const result = await createCheckout({}, ARGS);
    expect(result).toEqual({ stub: true });
  });

  it('creates a real session and returns its url when a key is configured', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 }));
    const result = await createCheckout({ STRIPE_SECRET_KEY: 'sk_test_1' }, ARGS);
    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer sk_test_1' }) }),
    );
  });

  it('throws CheckoutUnavailableError on a non-2xx Stripe response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 402 }));
    await expect(createCheckout({ STRIPE_SECRET_KEY: 'sk_test_1' }, ARGS)).rejects.toBeInstanceOf(CheckoutUnavailableError);
  });

  it('throws CheckoutUnavailableError when the network call itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(createCheckout({ STRIPE_SECRET_KEY: 'sk_test_1' }, ARGS)).rejects.toBeInstanceOf(CheckoutUnavailableError);
  });
});
