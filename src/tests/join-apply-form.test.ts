import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidationError } from '@sveltejs/kit';
import { handleJoinApply, type JoinApplySubmission } from '$theme/join-apply-form';
import { requestMemberLink } from '$member-auth/lib/auth';
import { fakeD1 } from './_fake-d1';

// The renew-and-welcome-back pivot (2026-07-14 amendment) hands off to `requestMemberLink`
// (`$member-auth/lib/auth`) instead of writing anything itself; mocked here (resolved by file
// path, matching `job-registry.test.ts`'s own precedent) so these tests assert the handoff
// happened without re-proving `requestMemberLink`'s own enumeration-safety transition table
// (already covered end to end in `member-auth.test.ts`).
vi.mock('../member-auth/lib/auth', () => ({
  requestMemberLink: vi.fn().mockResolvedValue({ status: 'sent' }),
}));

function issueMessages(err: unknown): string[] {
  return (err as { issues: Array<{ message: string }> }).issues.map((issue) => issue.message);
}

const ORIGIN = 'https://dev.aksailingclub.org';

function submission(overrides: Partial<JoinApplySubmission> = {}): JoinApplySubmission {
  return {
    tier: 'individual',
    purchaserName: 'Ada Lovelace',
    purchaserEmail: 'ada@example.com',
    purchaserPhone: '',
    purchaserBirthdate: '',
    members: [],
    picks: [],
    'cf-turnstile-response': '',
    ...overrides,
  };
}

/** Fixtures shared by every welcome-back scenario: a matched, previously-paid member ("member-1"
 *  of "household-1"), used by `findMemberByEmail` and `getMemberStanding`'s own two reads
 *  (`members` by id, `households` by id). Callers layer their own `paid_at IS NOT NULL AND
 *  refunded_at IS NULL ORDER BY paid_at DESC` (the paid-row read) and `FROM members WHERE
 *  household_id` (the roster read) on
 *  top, since those vary per scenario. */
function knownMemberFixtures() {
  return {
    'FROM members WHERE email': { id: 'member-1', household_id: 'household-1' },
    'FROM members WHERE id': { id: 'member-1', household_id: 'household-1', name: 'Ada Lovelace' },
    'FROM households WHERE id': { name: 'Lovelace Household' },
  };
}

const TIER_PRICE_ROWS = [
  { key: 'tier_price_individual', value: '250' },
  { key: 'tier_price_family', value: '500' },
  { key: 'tier_price_young_adult', value: '100' },
];

function classRow(id: string, fee: number) {
  return {
    id,
    season: 2026,
    name: `Class ${id}`,
    slug: id,
    track: 'adult-teen',
    capacity: 10,
    fee,
    start_date: null,
    end_date: null,
    location: null,
    description: null,
    instructor_notes: null,
    custom_note: null,
    hero_image: null,
    hero_image_alt: null,
    visible: 1 as const,
    drop_in: 0 as const,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
  };
}

describe('handleJoinApply', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requestMemberLink).mockClear();
  });

  it('refuses when the turnstile check fails, writing nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false }) }));
    const { db, calls } = fakeD1();

    await expect(
      handleJoinApply(submission(), { CLUB_DB: db, TURNSTILE_SECRET_KEY: 'secret' }, '203.0.113.5', ORIGIN),
    ).rejects.toSatisfy((err: unknown) => isValidationError(err) && issueMessages(err).includes('Spam check failed. Please try again.'));

    expect(calls).toHaveLength(0);
  });

  it('refuses when CLUB_DB is not bound', async () => {
    await expect(handleJoinApply(submission(), undefined, '203.0.113.5', ORIGIN)).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).some((m) => m.includes('not available right now')),
    );
  });

  it('surfaces every validateJoinInput rule violation together, writing nothing', async () => {
    const { db, calls } = fakeD1();
    await expect(
      handleJoinApply(submission({ members: [{ name: 'Bob', birthdate: '', email: '' }] }), { CLUB_DB: db }, '203.0.113.5', ORIGIN),
    ).rejects.toSatisfy(
      (err: unknown) => isValidationError(err) && issueMessages(err).includes('Only the family tier can include additional household members.'),
    );
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('a fresh solo join batches the write, then creates a join checkout with empty class metadata', async () => {
    const { db, calls } = fakeD1({
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
      firstResults: { "'current_season'": { value: '2026' } },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_1' }), { status: 200 })),
    );

    const result = await handleJoinApply(submission(), { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' }, '203.0.113.5', ORIGIN);
    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_1' });

    const householdInsert = calls.find((c) => c.sql.startsWith('INSERT INTO households'));
    expect(householdInsert).toBeDefined();
    const membershipInsert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(membershipInsert?.args).toEqual([expect.any(String), householdInsert?.args[0], 2026, 'individual', 250]);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('metadata[kind]')).toBe('join');
    expect(params.get('metadata[refId]')).toBe(membershipInsert?.args[0]);
    expect(params.get('metadata[enrollment_ids]')).toBe('');
    expect(params.get('metadata[covered_enrollment_ids]')).toBe('');
    expect(params.get('metadata[grant_credits]')).toBe('1');
    expect(params.get('metadata[dues_cents]')).toBe('25000');
    expect(params.get('metadata[paid_fee_cents]')).toBe('');
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('25000');
    expect(params.get('line_items[1][price_data][unit_amount]')).toBeNull();
  });

  it('a purchaser email belonging to a household that has paid before sends a sign-in link exactly once, returns no household data, and writes nothing (2026-07-14 amendment)', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        ...knownMemberFixtures(),
        'paid_at IS NOT NULL AND refunded_at IS NULL ORDER BY paid_at DESC': { tier: 'individual', season: 2025, paid_at: '2025-06-01' },
      },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await handleJoinApply(submission(), { CLUB_DB: db, EMAIL: { send } }, '203.0.113.5', ORIGIN);

    expect(result).toEqual({ pivot: 'renewal-link-sent' });
    expect(result).not.toHaveProperty('householdName');
    expect(result).not.toHaveProperty('members');
    expect(requestMemberLink).toHaveBeenCalledTimes(1);
    expect(requestMemberLink).toHaveBeenCalledWith(
      db,
      'ada@example.com',
      expect.any(Function),
      expect.objectContaining({ origin: ORIGIN, from: 'noreply@aksailingclub.org' }),
    );
    expect(calls.some((c) => c.sql.startsWith('INSERT') || c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('degrades silently (no send attempted, still answers the pivot) when EMAIL is not bound', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        ...knownMemberFixtures(),
        'paid_at IS NOT NULL AND refunded_at IS NULL ORDER BY paid_at DESC': { tier: 'individual', season: 2025, paid_at: '2025-06-01' },
      },
    });

    const result = await handleJoinApply(submission(), { CLUB_DB: db }, '203.0.113.5', ORIGIN);

    expect(result).toEqual({ pivot: 'renewal-link-sent' });
    expect(requestMemberLink).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith('INSERT') || c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('a purchaser email belonging to a household with only an unpaid row for the current season reuses that row', async () => {
    const { db, calls } = fakeD1({
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
      firstResults: {
        'FROM members WHERE email': { id: 'member-1', household_id: 'household-1' },
        'FROM members WHERE id': null,
        "'current_season'": { value: '2026' },
        'AND season = ?2 AND paid_at IS NULL': { id: 'membership-1' },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_2' }), { status: 200 })),
    );

    const result = await handleJoinApply(submission({ tier: 'family' }), { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' }, '203.0.113.5', ORIGIN);
    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_2' });

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO households'))).toBe(false);
    const update = calls.find((c) => c.sql.startsWith('UPDATE memberships'));
    expect(update?.args).toEqual(['family', 500, 'membership-1']);
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:join', 'retry', 'membership', 'membership-1', 'tier=family']);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('metadata[refId]')).toBe('membership-1');
    expect(params.get('metadata[purchaser_member_id]')).toBe('member-1');
    expect(params.get('metadata[grant_credits]')).toBe('1');
  });

  it('delegates the running total to computeJoinPricing: credits cover picks up to the tier grant, further picks add a class-fee line', async () => {
    const { db, calls } = fakeD1({
      allResults: { tier_price_individual: TIER_PRICE_ROWS },
      firstResults: {
        "'current_season'": { value: '2026' },
        'FROM classes WHERE id': (args: unknown[]) => {
          const id = args[0] as string;
          if (id === 'intro-sailing') return classRow('intro-sailing', 100);
          if (id === 'youth-sailing') return classRow('youth-sailing', 75);
          return classRow('third-class', 50);
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_3' }), { status: 200 })),
    );

    const result = await handleJoinApply(
      submission({
        tier: 'family',
        members: [{ name: 'Bob Lovelace', birthdate: '2012-01-01', email: '' }],
        picks: ['intro-sailing', 'youth-sailing'],
      }),
      { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' },
      '203.0.113.5',
      ORIGIN,
    );
    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/cs_test_3' });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    // Family grants two credits; both picks are covered, so only the dues line exists.
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('50000');
    expect(params.get('line_items[1][price_data][unit_amount]')).toBeNull();
    const enrollmentIds = (params.get('metadata[enrollment_ids]') ?? '').split(',').filter(Boolean);
    expect(enrollmentIds).toHaveLength(2);
    expect((params.get('metadata[covered_enrollment_ids]') ?? '').split(',').filter(Boolean)).toHaveLength(2);

    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toHaveLength(2);
  });

  it('snapshots dues and the paid subset\'s own fee cents into checkout metadata, aligned with the paid subset of enrollment_ids', async () => {
    const { db } = fakeD1({
      allResults: { tier_price_family: TIER_PRICE_ROWS },
      firstResults: {
        "'current_season'": { value: '2026' },
        'FROM classes WHERE id': (args: unknown[]) => {
          const id = args[0] as string;
          if (id === 'intro-sailing') return classRow('intro-sailing', 100);
          if (id === 'youth-sailing') return classRow('youth-sailing', 75);
          return classRow('advanced-racing', 150);
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_cents' }), { status: 200 })),
    );

    // Family grants two credits: the first two picks (in pick order) are covered, leaving the
    // third (advanced-racing, $150) as the only paid line.
    await handleJoinApply(
      submission({
        tier: 'family',
        members: [
          { name: 'Bob Lovelace', birthdate: '2012-01-01', email: '' },
          { name: 'Cleo Lovelace', birthdate: '2015-01-01', email: '' },
        ],
        picks: ['intro-sailing', 'youth-sailing', 'advanced-racing'],
      }),
      { CLUB_DB: db, STRIPE_SECRET_KEY: 'sk_test_1' },
      '203.0.113.5',
      ORIGIN,
    );

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    expect(params.get('metadata[dues_cents]')).toBe('50000');
    expect(params.get('metadata[paid_fee_cents]')).toBe('15000');
  });
});
