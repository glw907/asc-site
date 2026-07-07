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
  it('lists the three kinds the webhook dispatches on', () => {
    expect(PAYMENT_KINDS).toEqual(['dues', 'class-fee', 'asset-fee']);
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
