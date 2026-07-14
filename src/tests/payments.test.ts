import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCheckoutBody, buildRefundIdempotencyKey, CheckoutUnavailableError, createCheckout, issueStripeRefund, PAYMENT_KINDS } from '$admin-club/lib/payments';

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
  it('lists the five kinds the webhook dispatches on', () => {
    expect(PAYMENT_KINDS).toEqual(['dues', 'class-fee', 'asset-fee', 'donation', 'join']);
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

  it('is byte-identical for a single-line call whether or not other fields are present (unaffected by the lines feature)', () => {
    expect(buildCheckoutBody(ARGS)).toBe(buildCheckoutBody({ ...ARGS, lines: undefined }));
  });

  it('emits one indexed line_items group per entry when lines is given, ignoring amountCents/description', () => {
    const body = buildCheckoutBody({
      ...ARGS,
      kind: 'join',
      amountCents: 999999,
      description: 'ignored',
      lines: [
        { amountCents: 25000, name: 'Family Membership -- 2026 season' },
        { amountCents: 10000, name: 'Fleet Tune-Up Weekend class fee', description: 'One seat, uncovered by a credit' },
      ],
    });
    const params = new URLSearchParams(body);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('25000');
    expect(params.get('line_items[0][price_data][product_data][name]')).toBe('Family Membership -- 2026 season');
    expect(params.has('line_items[0][price_data][product_data][description]')).toBe(false);
    expect(params.get('line_items[0][quantity]')).toBe('1');
    expect(params.get('line_items[1][price_data][unit_amount]')).toBe('10000');
    expect(params.get('line_items[1][price_data][product_data][name]')).toBe('Fleet Tune-Up Weekend class fee');
    expect(params.get('line_items[1][price_data][product_data][description]')).toBe('One seat, uncovered by a credit');
    expect(params.get('line_items[1][quantity]')).toBe('1');
    expect(params.has('line_items[2][price_data][unit_amount]')).toBe(false);
  });

  it('falls back to the single-line shape when lines is an empty array', () => {
    const params = new URLSearchParams(buildCheckoutBody({ ...ARGS, lines: [] }));
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe(String(ARGS.amountCents));
    expect(params.has('line_items[1][price_data][unit_amount]')).toBe(false);
  });

  it('never lets caller metadata collide with the reserved kind/refId keys', () => {
    const params = new URLSearchParams(
      buildCheckoutBody({ ...ARGS, metadata: { kind: 'donation', refId: 'evil-id', note: 'hi' } }),
    );
    expect(params.get('metadata[kind]')).toBe('class-fee');
    expect(params.get('metadata[refId]')).toBe('enr-1');
    expect(params.get('metadata[note]')).toBe('hi');
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

describe('issueStripeRefund', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers ok: false when STRIPE_SECRET_KEY is not bound, never throwing', async () => {
    const result = await issueStripeRefund({}, { processorRef: 'pi_test_1', amountCents: 5000, idempotencyKey: 'key-1' });
    expect(result).toEqual({ ok: false, error: 'STRIPE_SECRET_KEY is not configured.' });
  });

  it('refunds a payment intent ref directly, with one fetch call carrying the Idempotency-Key header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 're_test_1' }), { status: 200 }));
    const result = await issueStripeRefund({ STRIPE_SECRET_KEY: 'sk_test_1' }, { processorRef: 'pi_test_1', amountCents: 5000, idempotencyKey: 'key-1' });
    expect(result).toEqual({ ok: true, refundId: 're_test_1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/refunds',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Idempotency-Key': 'key-1' }) }),
    );
  });

  it('resolves a checkout session ref to its payment intent first, then refunds it', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_intent: 'pi_resolved' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_2' }), { status: 200 }));
    const result = await issueStripeRefund({ STRIPE_SECRET_KEY: 'sk_test_1' }, { processorRef: 'cs_test_1', amountCents: 5000, idempotencyKey: 'key-2' });
    expect(result).toEqual({ ok: true, refundId: 're_test_2' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.stripe.com/v1/checkout/sessions/cs_test_1', expect.anything());
    const refundBody = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new URLSearchParams(refundBody.body as string).get('payment_intent')).toBe('pi_resolved');
  });

  it('answers ok: false for an unrecognized processor reference, with no fetch call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await issueStripeRefund({ STRIPE_SECRET_KEY: 'sk_test_1' }, { processorRef: 'ch_unrecognized', amountCents: 5000, idempotencyKey: 'key-3' });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers ok: false when Stripe refuses the refund', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 402 }));
    const result = await issueStripeRefund({ STRIPE_SECRET_KEY: 'sk_test_1' }, { processorRef: 'pi_test_1', amountCents: 5000, idempotencyKey: 'key-4' });
    expect(result.ok).toBe(false);
  });

  it('answers ok: false when the network call itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await issueStripeRefund({ STRIPE_SECRET_KEY: 'sk_test_1' }, { processorRef: 'pi_test_1', amountCents: 5000, idempotencyKey: 'key-5' });
    expect(result.ok).toBe(false);
  });
});

describe('buildRefundIdempotencyKey', () => {
  it('is deterministic: the same inputs produce the same key', async () => {
    const picks = [
      { lineId: 'line-fee', amountCents: 10000 },
      { lineId: 'line-dues', amountCents: 25000 },
    ];
    const first = await buildRefundIdempotencyKey('tx-1', 0, picks);
    const second = await buildRefundIdempotencyKey('tx-1', 0, [...picks].reverse());
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a different key once refundedSoFarCents advances', async () => {
    const picks = [{ lineId: 'line-dues', amountCents: 10000 }];
    const before = await buildRefundIdempotencyKey('tx-1', 0, picks);
    const after = await buildRefundIdempotencyKey('tx-1', 15000, picks);
    expect(before).not.toBe(after);
  });

  it('produces a different key for a different selection', async () => {
    const a = await buildRefundIdempotencyKey('tx-1', 0, [{ lineId: 'line-dues', amountCents: 10000 }]);
    const b = await buildRefundIdempotencyKey('tx-1', 0, [{ lineId: 'line-dues', amountCents: 12000 }]);
    expect(a).not.toBe(b);
  });
});
