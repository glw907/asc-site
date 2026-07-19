// The join flow's ONE shared checkout builder (member-waivers T5c, the money-critical piece):
// `buildJoinCheckoutArgs` produces the exact `join`-kind metadata `reconcileJoin` reads, and it is
// the SAME function whether the checkout is built at submit (from in-memory statements) or rebuilt
// at the payment-resume unlock (from the persisted rows, `loadJoinApplication`). The load-bearing
// test is the last one: it constructs one persisted application two ways -- as the fresh-join path
// would, and by reading the identical rows back through `loadJoinApplication` -- and asserts the
// metadata is byte-identical, so a resumed join can never desync the ledger from a straight-through
// one.
import { describe, expect, it } from 'vitest';
import type { MembershipTier } from '$admin-club/lib/member-types';
import { buildJoinCheckoutArgs, loadJoinApplication, type PersistedJoinApplication } from '$member-signup/lib/join-checkout';
import { fakeD1 } from './_fake-d1';

const ORIGIN = 'https://dev.aksailingclub.org';
const PRICES: Record<MembershipTier, number> = { individual: 250, family: 500, 'young-adult': 100 };

function app(overrides: Partial<PersistedJoinApplication> = {}): PersistedJoinApplication {
  return {
    membershipId: 'membership-1',
    tier: 'family',
    purchaserMemberId: 'member-1',
    grantCredits: true,
    duesCents: 50000,
    enrollments: [],
    ...overrides,
  };
}

describe('buildJoinCheckoutArgs', () => {
  it('a solo join with no class picks builds only the dues line and empty class metadata', () => {
    const args = buildJoinCheckoutArgs(app({ tier: 'individual', duesCents: 25000 }), ORIGIN);
    expect(args.kind).toBe('join');
    expect(args.refId).toBe('membership-1');
    expect(args.amountCents).toBe(25000);
    expect(args.lines).toEqual([{ amountCents: 25000, name: 'Individual Membership dues' }]);
    expect(args.metadata).toEqual({
      enrollment_ids: '',
      covered_enrollment_ids: '',
      grant_credits: '1',
      purchaser_member_id: 'member-1',
      dues_cents: '25000',
      paid_fee_cents: '',
    });
  });

  it('applies credits in pick order: the tier grant covers the leading picks, the rest are paid lines', () => {
    // Family grants two credits: the first two enrollments (in pick order) are covered, the third
    // is the only paid line -- the same split `computeJoinPricing` produces.
    const args = buildJoinCheckoutArgs(
      app({
        enrollments: [
          { enrollmentId: 'enr-1', className: 'Intro Sailing', feeCents: 10000 },
          { enrollmentId: 'enr-2', className: 'Youth Sailing', feeCents: 7500 },
          { enrollmentId: 'enr-3', className: 'Advanced Racing', feeCents: 15000 },
        ],
      }),
      ORIGIN,
    );
    expect(args.amountCents).toBe(50000 + 15000);
    expect(args.lines).toEqual([
      { amountCents: 50000, name: 'Family Membership dues' },
      { amountCents: 15000, name: 'Advanced Racing class fee' },
    ]);
    expect(args.metadata).toEqual({
      enrollment_ids: 'enr-1,enr-2,enr-3',
      covered_enrollment_ids: 'enr-1,enr-2',
      grant_credits: '1',
      purchaser_member_id: 'member-1',
      dues_cents: '50000',
      paid_fee_cents: '15000',
    });
  });

  it('the public-door cancel path is the default, an authenticated caller overrides it (metadata unchanged)', () => {
    const fresh = buildJoinCheckoutArgs(app(), ORIGIN);
    const resumed = buildJoinCheckoutArgs(app(), ORIGIN, '/my-account');
    expect(fresh.cancelPath).toBe('/join/apply/');
    expect(resumed.cancelPath).toBe('/my-account');
    expect(resumed.metadata).toEqual(fresh.metadata);
  });
});

describe('loadJoinApplication', () => {
  it('returns null for a membership that is missing or already paid (nothing to resume)', async () => {
    const missing = fakeD1();
    expect(await loadJoinApplication(missing.db, 'membership-1', PRICES)).toBeNull();

    const paid = fakeD1({ firstResults: { 'FROM memberships WHERE id': { id: 'membership-1', household_id: 'household-1', tier: 'family', paid_at: '2027-06-01 00:00:00' } } });
    expect(await loadJoinApplication(paid.db, 'membership-1', PRICES)).toBeNull();
  });

  it('rebuilds the byte-identical checkout metadata that the fresh-join path built from the same rows', async () => {
    // The persisted application: a family join for household-1, purchaser member-1, three enrolled
    // picks in pick order. This is exactly what `handleJoinApply` holds in memory at submit.
    const fresh = app({
      tier: 'family',
      duesCents: 50000,
      enrollments: [
        { enrollmentId: 'enr-1', className: 'Intro Sailing', feeCents: 10000 },
        { enrollmentId: 'enr-2', className: 'Youth Sailing', feeCents: 7500 },
        { enrollmentId: 'enr-3', className: 'Advanced Racing', feeCents: 15000 },
      ],
    });

    // The SAME rows, as the resume path reads them back at unlock. `classes.fee` is whole dollars
    // (100/75/150), which `loadJoinApplication` converts to the same cents the fresh path snapshotted.
    const { db } = fakeD1({
      firstResults: {
        'FROM memberships WHERE id': { id: 'membership-1', household_id: 'household-1', tier: 'family', paid_at: null },
        'FROM households WHERE id': { primary_member_id: 'member-1' },
      },
      allResults: {
        'FROM class_enrollments ce': [
          { id: 'enr-1', class_name: 'Intro Sailing', fee: 100 },
          { id: 'enr-2', class_name: 'Youth Sailing', fee: 75 },
          { id: 'enr-3', class_name: 'Advanced Racing', fee: 150 },
        ],
      },
    });

    const resumed = await loadJoinApplication(db, 'membership-1', PRICES);
    expect(resumed).not.toBeNull();

    // The proof: `reconcileJoin` reads only the metadata, and it is byte-identical whichever moment
    // built the checkout. The whole args object matches too (same lines, same total).
    expect(buildJoinCheckoutArgs(resumed!, ORIGIN)).toEqual(buildJoinCheckoutArgs(fresh, ORIGIN));
  });
});
