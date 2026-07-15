import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { buildRefundPlan, executeRefund } from '$admin-club/lib/refunds';
import type { TimelineTransaction } from '$admin-club/lib/money-store';

/** A join charge with a full-amount dues line and a partial-eligible class-fee line, mirroring
 *  the design doc's own "join charges are multi-line" example. `apiEligible` toggles per test. */
function joinCharge(overrides: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 'tx-1',
    kind: 'charge',
    source: 'stripe',
    occurredAt: '2026-06-01 12:00:00',
    amountTotalCents: 35000,
    feeCents: 1200,
    processorRef: 'cs_test_abc',
    refundsTransactionId: null,
    householdId: 'hh-1',
    householdName: 'The Larsen Household',
    payerName: 'Erik Larsen',
    payerEmail: 'erik@example.com',
    memo: null,
    mwRef: null,
    refundable: true,
    apiEligible: true,
    lines: [
      { id: 'line-dues', item: 'dues', description: 'Family Membership -- 2026 season', amountCents: 25000, membershipId: 'ms-1', enrollmentId: null, assignmentId: null, refundedCents: 0 },
      { id: 'line-fee', item: 'class-fee', description: 'Fleet Tune-Up Weekend class fee', amountCents: 10000, membershipId: null, enrollmentId: 'enr-1', assignmentId: null, refundedCents: 0 },
    ],
    ...overrides,
  };
}

function assetFeeCharge(overrides: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 'tx-2',
    kind: 'charge',
    source: 'stripe',
    occurredAt: '2026-06-01 12:00:00',
    amountTotalCents: 8000,
    feeCents: null,
    processorRef: 'pi_test_xyz',
    refundsTransactionId: null,
    householdId: 'hh-2',
    householdName: 'The Hunter Household',
    payerName: null,
    payerEmail: null,
    memo: null,
    mwRef: null,
    refundable: true,
    apiEligible: true,
    lines: [{ id: 'line-asset', item: 'asset-fee', description: 'Mooring fee -- Buoy M-14', amountCents: 8000, membershipId: null, enrollmentId: null, assignmentId: 'aa-1', refundedCents: 0 }],
    ...overrides,
  };
}

describe('buildRefundPlan', () => {
  it('marks the membership refunded when the dues line refunds in full', () => {
    const plan = buildRefundPlan(joinCharge(), [{ lineId: 'line-dues', amountCents: 25000 }]);
    expect(plan.unwinds).toEqual([{ kind: 'membership-refunded', membershipId: 'ms-1' }]);
    expect(plan.refundAmountCents).toBe(25000);
  });

  it('leaves the membership untouched on a partial dues refund', () => {
    const plan = buildRefundPlan(joinCharge(), [{ lineId: 'line-dues', amountCents: 10000 }]);
    expect(plan.unwinds).toEqual([]);
    expect(plan.refundAmountCents).toBe(10000);
  });

  it('handles a multi-line join charge with a partial dues selection and a full class-fee selection', () => {
    const plan = buildRefundPlan(joinCharge(), [
      { lineId: 'line-dues', amountCents: 5000 },
      { lineId: 'line-fee', amountCents: 10000 },
    ]);
    expect(plan.refundAmountCents).toBe(15000);
    expect(plan.unwinds).toEqual([{ kind: 'drop-enrollment', enrollmentId: 'enr-1' }]);
    expect(plan.lines).toHaveLength(2);
  });

  it('unwinds a class-fee line whether refunded in full or in part', () => {
    const plan = buildRefundPlan(joinCharge(), [{ lineId: 'line-fee', amountCents: 4000 }]);
    expect(plan.unwinds).toEqual([{ kind: 'drop-enrollment', enrollmentId: 'enr-1' }]);
  });

  it('unwinds an asset-fee line by unflipping its fee-paid state', () => {
    const plan = buildRefundPlan(assetFeeCharge(), [{ lineId: 'line-asset', amountCents: 8000 }]);
    expect(plan.unwinds).toEqual([{ kind: 'unflip-asset-fee', assignmentId: 'aa-1' }]);
  });

  it('produces no unwind for a donation line', () => {
    const charge = joinCharge({
      lines: [{ id: 'line-donation', item: 'donation', description: 'Donation', amountCents: 5000, membershipId: null, enrollmentId: null, assignmentId: null, refundedCents: 0 }],
    });
    const plan = buildRefundPlan(charge, [{ lineId: 'line-donation', amountCents: 5000 }]);
    expect(plan.unwinds).toEqual([]);
  });

  it('routes an imported MW row, a PayPal row, and a check/cash row to record-only', () => {
    for (const source of ['stripe', 'paypal', 'check', 'cash'] as const) {
      // `apiEligible` is Task 3's own eligibility flag, already computed off source/mwRef/
      // processorRef before this module ever sees the charge (`money-store.ts`'s own
      // `isApiEligible`); every one of these four rows reads `false` in the real data (an
      // imported MW row, a PayPal row, or an offline check/cash payment), so this asserts
      // `buildRefundPlan` honors that flag rather than re-deriving eligibility itself.
      const charge = joinCharge({ source, apiEligible: false });
      const plan = buildRefundPlan(charge, [{ lineId: 'line-dues', amountCents: 25000 }]);
      expect(plan.mode).toBe('record-only');
    }
  });

  it('routes an eligible Stripe charge to the api mode', () => {
    const plan = buildRefundPlan(joinCharge({ apiEligible: true }), [{ lineId: 'line-dues', amountCents: 25000 }]);
    expect(plan.mode).toBe('api');
  });

  it('mirrors the selected lines so they sum to the refund amount, the ledger sum invariant by construction', () => {
    const plan = buildRefundPlan(joinCharge(), [
      { lineId: 'line-dues', amountCents: 25000 },
      { lineId: 'line-fee', amountCents: 10000 },
    ]);
    const lineSum = plan.lines.reduce((total, line) => total + line.amountCents, 0);
    expect(lineSum).toBe(plan.header.amountTotalCents);
    expect(lineSum).toBe(plan.refundAmountCents);
  });

  it('throws for an already fully refunded charge', () => {
    expect(() => buildRefundPlan(joinCharge({ refundable: false }), [{ lineId: 'line-dues', amountCents: 25000 }])).toThrow(/already been fully refunded/);
  });

  it('throws for a selection amount above the line\'s own amount', () => {
    expect(() => buildRefundPlan(joinCharge(), [{ lineId: 'line-dues', amountCents: 99999 }])).toThrow(/must be between/);
  });

  it('throws for a duplicate line selection', () => {
    expect(() =>
      buildRefundPlan(joinCharge(), [
        { lineId: 'line-dues', amountCents: 1000 },
        { lineId: 'line-dues', amountCents: 1000 },
      ]),
    ).toThrow(/more than once/);
  });

  it('throws for an unknown line id', () => {
    expect(() => buildRefundPlan(joinCharge(), [{ lineId: 'line-nope', amountCents: 100 }])).toThrow(/carries no line/);
  });

  it('rejects a pick that would push a partially-refunded line past its original amount', () => {
    // A $150 partial refund of the $250 dues line already landed (refundedCents: 15000); another
    // $250 must be rejected -- the per-line CUMULATIVE cap, not the line's original amount alone.
    const charge = joinCharge({
      lines: [
        { id: 'line-dues', item: 'dues', description: 'Family Membership -- 2026 season', amountCents: 25000, membershipId: 'ms-1', enrollmentId: null, assignmentId: null, refundedCents: 15000 },
      ],
    });
    expect(() => buildRefundPlan(charge, [{ lineId: 'line-dues', amountCents: 25000 }])).toThrow(/must be between 1 and 10000/);
  });

  it('still allows a fresh line (refundedCents: 0) to refund to its full original amount', () => {
    const plan = buildRefundPlan(joinCharge(), [{ lineId: 'line-dues', amountCents: 25000 }]);
    expect(plan.refundAmountCents).toBe(25000);
  });

  it('marks the membership refunded when a pick zeroes out a line already partially refunded', () => {
    // The remaining $100 of a $250 dues line, $150 of which already came back: this pick
    // completes the full refund across two separate transactions, so the membership unwinds.
    const charge = joinCharge({
      lines: [
        { id: 'line-dues', item: 'dues', description: 'Family Membership -- 2026 season', amountCents: 25000, membershipId: 'ms-1', enrollmentId: null, assignmentId: null, refundedCents: 15000 },
      ],
    });
    const plan = buildRefundPlan(charge, [{ lineId: 'line-dues', amountCents: 10000 }]);
    expect(plan.unwinds).toEqual([{ kind: 'membership-refunded', membershipId: 'ms-1' }]);
  });
});

describe('executeRefund', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the ledger refund and the unwind in one batch for a record-only charge, with no Stripe call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { db, calls } = fakeD1();

    const result = await executeRefund(db, {}, joinCharge({ apiEligible: false, source: 'check' }), [{ lineId: 'line-dues', amountCents: 25000 }]);

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transactions'))).toBe(true);
    expect(calls.some((c) => c.sql.includes('UPDATE memberships SET refunded_at'))).toBe(true);
  });

  it('calls Stripe first in api mode, then writes the ledger refund plus the unwind together', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_intent: 'pi_test_123' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_1' }), { status: 200 }));
    const { db, calls } = fakeD1();

    const result = await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, joinCharge(), [{ lineId: 'line-dues', amountCents: 25000 }]);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const txInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txInsert?.args).toContain('re_test_1');
  });

  it('carries a deterministic Idempotency-Key on the Stripe refund call, derived from the charge, its refunded-so-far total, and the selection', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_a' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_b' }), { status: 200 }));
    const { db } = fakeD1();

    await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, assetFeeCharge(), [{ lineId: 'line-asset', amountCents: 8000 }]);
    const firstHeaders = fetchMock.mock.calls[0][1] as RequestInit;
    const firstKey = (firstHeaders.headers as Record<string, string>)['Idempotency-Key'];
    expect(firstKey).toMatch(/^[0-9a-f]{64}$/);

    // Same charge, same refunded-so-far state, same selection: the retry (a double-click, or a
    // retry after a transient DB failure) must replay the IDENTICAL key so Stripe dedupes it.
    await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, assetFeeCharge(), [{ lineId: 'line-asset', amountCents: 8000 }]);
    const secondHeaders = fetchMock.mock.calls[1][1] as RequestInit;
    const secondKey = (secondHeaders.headers as Record<string, string>)['Idempotency-Key'];
    expect(secondKey).toBe(firstKey);
  });

  it('carries a different Idempotency-Key once the charge already carries a refunded-so-far total', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_a' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 're_test_b' }), { status: 200 }));
    const { db } = fakeD1();

    const fresh = assetFeeCharge();
    const partiallyRefunded = assetFeeCharge({
      lines: [{ id: 'line-asset', item: 'asset-fee', description: 'Mooring fee -- Buoy M-14', amountCents: 8000, membershipId: null, enrollmentId: null, assignmentId: 'aa-1', refundedCents: 3000 }],
    });

    await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, fresh, [{ lineId: 'line-asset', amountCents: 5000 }]);
    const freshKey = ((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>)['Idempotency-Key'];

    await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, partiallyRefunded, [{ lineId: 'line-asset', amountCents: 5000 }]);
    const advancedKey = ((fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>)['Idempotency-Key'];

    expect(advancedKey).not.toBe(freshKey);
  });

  it('writes nothing to the database when the Stripe refund fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 402 }));
    const { db, calls } = fakeD1();

    const result = await executeRefund(db, { STRIPE_SECRET_KEY: 'sk_test_1' }, joinCharge(), [{ lineId: 'line-dues', amountCents: 25000 }]);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('carries an optional memo onto the refund transaction row (the live-smoke marking), leaving it null by default', async () => {
    const { db: dbWithMemo, calls: callsWithMemo } = fakeD1();
    await executeRefund(dbWithMemo, {}, joinCharge({ apiEligible: false, source: 'check' }), [{ lineId: 'line-dues', amountCents: 25000 }], 'live-smoke 2026-07-16');
    const txnInsertWithMemo = callsWithMemo.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsertWithMemo?.args[11]).toBe('live-smoke 2026-07-16');

    const { db: dbNoMemo, calls: callsNoMemo } = fakeD1();
    await executeRefund(dbNoMemo, {}, joinCharge({ apiEligible: false, source: 'check' }), [{ lineId: 'line-dues', amountCents: 25000 }]);
    const txnInsertNoMemo = callsNoMemo.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txnInsertNoMemo?.args[11]).toBeNull();
  });

  it('answers ok: false, writing nothing, when the plan itself is invalid', async () => {
    const { db, calls } = fakeD1();
    const result = await executeRefund(db, {}, joinCharge({ refundable: false }), [{ lineId: 'line-dues', amountCents: 25000 }]);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
