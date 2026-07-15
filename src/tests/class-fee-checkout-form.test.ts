import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidationError } from '@sveltejs/kit';
import { handleClassFeeCheckout } from '$theme/class-fee-checkout-form';
import { fakeD1 } from './_fake-d1';

function issueMessages(err: unknown): string[] {
  return (err as { issues: Array<{ message: string }> }).issues.map((issue) => issue.message);
}

const CLASS_ROW = {
  id: 'fleet-tune-up-weekend',
  season: 2026,
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  visible: 1 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

const FREE_CLASS_ROW = { ...CLASS_ROW, id: 'youth-clinic', fee: 0 };

const INPUT = { enrollmentId: 'enr-1', classId: CLASS_ROW.id, 'cf-turnstile-response': '' };
const ORIGIN = 'https://dev.aksailingclub.org';
const IP = '203.0.113.5';

describe('handleClassFeeCheckout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses when CLUB_DB is not bound', async () => {
    await expect(handleClassFeeCheckout(INPUT, undefined, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('not available right now')),
    );
  });

  it('refuses an unknown class', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': null } });
    await expect(handleClassFeeCheckout(INPUT, { CLUB_DB: db }, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('No such class')),
    );
  });

  it('refuses a free class (nothing to pay)', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes WHERE id': FREE_CLASS_ROW } });
    await expect(
      handleClassFeeCheckout({ enrollmentId: 'enr-1', classId: FREE_CLASS_ROW.id, 'cf-turnstile-response': '' }, { CLUB_DB: db }, IP, ORIGIN),
    ).rejects.toSatisfy((err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('no fee to pay')));
  });

  it('refuses an enrollment that does not belong to the submitted class', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE id': { class_id: 'a-different-class' } },
    });
    await expect(handleClassFeeCheckout(INPUT, { CLUB_DB: db }, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('No such enrollment')),
    );
  });

  it('degrades to a stub when STRIPE_SECRET_KEY is not bound, never throwing', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE id': { class_id: CLASS_ROW.id } },
    });
    const result = await handleClassFeeCheckout(INPUT, { CLUB_DB: db }, IP, ORIGIN);
    expect(result).toEqual({ stub: true });
  });

  it('creates a real session for the class fee (whole-dollar fee converted to cents) when a key is configured', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE id': { class_id: CLASS_ROW.id } },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 }));
    const result = await handleClassFeeCheckout(INPUT, { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' }, IP, ORIGIN);
    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_1' });

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe(String(CLASS_ROW.fee * 100));
    expect(params.get('metadata[kind]')).toBe('class-fee');
    expect(params.get('metadata[refId]')).toBe(INPUT.enrollmentId);
    expect(params.get('cancel_url')).toBe(`${ORIGIN}/classes/${CLASS_ROW.id}/signup/`);
  });

  it('turns a configured-but-failing Stripe call into a validation error, not a throw', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE id': { class_id: CLASS_ROW.id } },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 402 }));
    await expect(handleClassFeeCheckout(INPUT, { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' }, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('temporarily unavailable')),
    );
  });
});

describe('handleClassFeeCheckout (the Turnstile gate)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function feeDb() {
    return fakeD1({
      firstResults: { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE id': { class_id: CLASS_ROW.id } },
    });
  }

  it('rejects a missing token when a secret is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    const { db } = feeDb();
    await expect(handleClassFeeCheckout(INPUT, { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'),
    );
  });

  it('rejects an invalid token when a secret is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    const { db } = feeDb();
    const input = { ...INPUT, 'cf-turnstile-response': 'a-bad-token' };
    await expect(handleClassFeeCheckout(input, { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'),
    );
  });

  it('proceeds when a secret is configured and siteverify reports success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const { db } = feeDb();
    const result = await handleClassFeeCheckout({ ...INPUT, 'cf-turnstile-response': 'a-good-token' }, { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' }, IP, ORIGIN);
    expect(result).toEqual({ stub: true });
  });

  it('degrades to open (no siteverify call) when no secret is configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = feeDb();
    const result = await handleClassFeeCheckout(INPUT, { CLUB_DB: db }, IP, ORIGIN);
    expect(result).toEqual({ stub: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
