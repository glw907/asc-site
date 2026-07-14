import { describe, expect, it } from 'vitest';
import {
  centsToDollars,
  OVERRIDES,
  planImport,
  resolveCurrentMembershipByHousehold,
  resolveMember,
  resolveMemberByEmail,
  STALE_MEMBERSHIP_DAYS,
  toAssetPaymentRow,
  toAssetTypeRow,
  toAssetAssignmentRow,
  toAssetWaitlistRow,
} from '../../scripts/import/ops-assets.mjs';

const memberByEmail = new Map([
  ['matched@example.com', { id: 'mem-1', householdId: 'hh-1' }],
  ['second@example.com', { id: 'mem-2', householdId: 'hh-2' }],
]);
const currentMembershipByHousehold = new Map([
  ['hh-1', 'ms-1'],
  ['hh-2', 'ms-2'],
]);

describe('centsToDollars', () => {
  it('converts whole cents to whole dollars', () => {
    expect(centsToDollars(30000)).toBe(300);
    expect(centsToDollars(5000)).toBe(50);
  });
});

describe('toAssetTypeRow', () => {
  it('maps id/name verbatim and converts the fee from cents to dollars', () => {
    const row = toAssetTypeRow({ id: 'mooring', name: 'Mooring', fee: 30000, capacity: 12, sort_order: 1 });
    expect(row).toEqual({ id: 'mooring', name: 'Mooring', fee: 300, capacity: 12, sortOrder: 1 });
  });
});

describe('resolveMemberByEmail', () => {
  it('matches case-insensitively', () => {
    expect(resolveMemberByEmail('Matched@Example.com', memberByEmail)).toEqual({ id: 'mem-1', householdId: 'hh-1' });
  });

  it('returns null for an unknown or missing email', () => {
    expect(resolveMemberByEmail('nobody@example.com', memberByEmail)).toBeNull();
    expect(resolveMemberByEmail(null, memberByEmail)).toBeNull();
  });
});

describe('OVERRIDES', () => {
  it('carries exactly the two documented ops person id -> MW account id overrides', () => {
    expect(OVERRIDES).toEqual({
      '18': '661f6b677abbb920560b306b',
      '120': '662f056a120ba1f321076c25',
    });
  });
});

describe('resolveMember', () => {
  const memberByMwAccountId = new Map([['661f6b677abbb920560b306b', { id: 'mem-override', householdId: 'hh-override' }]]);

  it('resolves an override person id through members.mw_account_id, ahead of the email match', () => {
    // person 18 is overridden but its (unmatching) email would resolve to a different member.
    const row = resolveMember('18', 'matched@example.com', memberByEmail, memberByMwAccountId);
    expect(row).toEqual({ id: 'mem-override', householdId: 'hh-override' });
  });

  it('accepts a numeric person id the same as a string one', () => {
    const row = resolveMember(18, 'matched@example.com', memberByEmail, memberByMwAccountId);
    expect(row).toEqual({ id: 'mem-override', householdId: 'hh-override' });
  });

  it('falls through to the email match when the override account id has no member row yet', () => {
    const row = resolveMember('18', 'matched@example.com', memberByEmail, new Map());
    expect(row).toEqual({ id: 'mem-1', householdId: 'hh-1' });
  });

  it('falls through to the unmatched result when the override account id is missing and the email also misses', () => {
    const row = resolveMember('18', 'nobody@example.com', memberByEmail, new Map());
    expect(row).toBeNull();
  });

  it('ignores OVERRIDES for a person id with no entry, matching by email as usual', () => {
    const row = resolveMember('999', 'matched@example.com', memberByEmail, memberByMwAccountId);
    expect(row).toEqual({ id: 'mem-1', householdId: 'hh-1' });
  });
});

describe('resolveCurrentMembershipByHousehold', () => {
  const ASOF = new Date('2026-07-14T00:00:00Z');

  it("resolves a household's most-recent PAID row, never by season", () => {
    const memberships = [
      { householdId: 'hh-1', id: 'ms-old', paidAt: '2025-04-01' },
      { householdId: 'hh-1', id: 'ms-new', paidAt: '2026-06-01' },
    ];
    const result = resolveCurrentMembershipByHousehold(memberships, ASOF);
    expect(result.get('hh-1')).toBe('ms-new');
  });

  it('ignores a row with no paid_at (never a "most recent paid" candidate)', () => {
    const memberships = [
      { householdId: 'hh-1', id: 'ms-unpaid', paidAt: null },
      { householdId: 'hh-1', id: 'ms-paid', paidAt: '2026-01-01' },
    ];
    const result = resolveCurrentMembershipByHousehold(memberships, ASOF);
    expect(result.get('hh-1')).toBe('ms-paid');
  });

  it('excludes a household whose most-recent-paid row is stale (well past the ~400-day heuristic)', () => {
    const memberships = [{ householdId: 'hh-1', id: 'ms-stale', paidAt: '2025-01-01' }]; // ~560 days before ASOF
    const result = resolveCurrentMembershipByHousehold(memberships, ASOF);
    expect(result.has('hh-1')).toBe(false);
  });

  it('keeps a household whose most-recent-paid row is recent (well under the threshold)', () => {
    const memberships = [{ householdId: 'hh-1', id: 'ms-recent', paidAt: '2026-06-01' }]; // ~44 days before ASOF
    const result = resolveCurrentMembershipByHousehold(memberships, ASOF);
    expect(result.get('hh-1')).toBe('ms-recent');
  });

  it('carries the documented ~400-day staleness heuristic', () => {
    expect(STALE_MEMBERSHIP_DAYS).toBe(400);
  });
});

describe('toAssetAssignmentRow', () => {
  const base = { id: 15, person_id: 1, asset_type: 'mooring', description: 'Buoy M-14', status: 'active', created_at: '2026-03-02 01:20:26' };

  it('lands a matched assignment on the household current membership, mapping active -> active', () => {
    const row = toAssetAssignmentRow(base, 'matched@example.com', memberByEmail, currentMembershipByHousehold);
    expect(row).toEqual({
      id: 'ops-assignment-15',
      assetType: 'mooring',
      membershipId: 'ms-1',
      description: 'Buoy M-14',
      status: 'active',
      createdAt: '2026-03-02 01:20:26',
      sourceId: 15,
    });
  });

  it('maps cancelled -> released', () => {
    const row = toAssetAssignmentRow({ ...base, status: 'cancelled' }, 'matched@example.com', memberByEmail, currentMembershipByHousehold);
    expect(row).toMatchObject({ status: 'released' });
  });

  it('refuses an unmatched holder without inventing a member', () => {
    const row = toAssetAssignmentRow(base, 'nobody@example.com', memberByEmail, currentMembershipByHousehold);
    expect(row).toEqual({ skipped: 'unmatched', sourceId: 15, email: 'nobody@example.com' });
  });

  it('refuses a matched member whose household has no current-season membership', () => {
    const row = toAssetAssignmentRow(base, 'matched@example.com', memberByEmail, new Map());
    expect(row).toEqual({ skipped: 'no-current-membership', sourceId: 15, email: 'matched@example.com' });
  });

  it('resolves an OVERRIDES person id through mw_account_id even when the email would not match', () => {
    const overridden = { ...base, person_id: 18 };
    const memberByMwAccountId = new Map([['661f6b677abbb920560b306b', { id: 'mem-override', householdId: 'hh-override' }]]);
    const currentMembershipByHouseholdWithOverride = new Map([...currentMembershipByHousehold, ['hh-override', 'ms-override']]);
    const row = toAssetAssignmentRow(overridden, 'stale@example.com', memberByEmail, currentMembershipByHouseholdWithOverride, memberByMwAccountId);
    expect(row).toMatchObject({ membershipId: 'ms-override' });
  });

  describe('rolling-renewal membership resolution (2026-07-14 fix)', () => {
    const ASOF = new Date('2026-07-14T00:00:00Z');

    it('matches a household whose latest membership is prior-season-labeled but recently paid', () => {
      // The household's most-recent membership row is labeled a prior season (the mw-members
      // season-rewrite correction landed it there, per migration 0009's rolling-renewal
      // doctrine), but it was paid only ~44 days ago -- still current, even though the OLD
      // season-lookup rule would have missed it entirely.
      const memberships = [{ householdId: 'hh-1', id: 'ms-prior-season', paidAt: '2026-06-01' }];
      const resolved = resolveCurrentMembershipByHousehold(memberships, ASOF);
      const row = toAssetAssignmentRow(base, 'matched@example.com', memberByEmail, resolved);
      expect(row).toMatchObject({ membershipId: 'ms-prior-season' });
    });

    it('warns and skips a household whose latest paid membership is over the staleness threshold', () => {
      const memberships = [{ householdId: 'hh-1', id: 'ms-lapsed', paidAt: '2025-01-01' }]; // ~560 days before ASOF
      const resolved = resolveCurrentMembershipByHousehold(memberships, ASOF);
      const row = toAssetAssignmentRow(base, 'matched@example.com', memberByEmail, resolved);
      expect(row).toEqual({ skipped: 'no-current-membership', sourceId: 15, email: 'matched@example.com' });
    });
  });
});

describe('toAssetPaymentRow', () => {
  const base = { id: 15, payment_status: 'paid', payment_sent_at: '2026-03-02 01:20:26', stripe_payment_id: 'cs_live_abc' };

  it('imports a paid assignment with paidAt set', () => {
    const row = toAssetPaymentRow(base, 2026, 300);
    expect(row).toEqual({
      id: 'ops-payment-15',
      assignmentId: 'ops-assignment-15',
      season: 2026,
      amount: 300,
      stripeRef: 'cs_live_abc',
      paidAt: '2026-03-02 01:20:26',
    });
  });

  it('imports a sent (invoiced, unpaid) assignment with paidAt null', () => {
    const row = toAssetPaymentRow({ ...base, payment_status: 'sent' }, 2026, 300);
    expect(row?.paidAt).toBeNull();
  });

  it('returns null for a never-billed assignment', () => {
    expect(toAssetPaymentRow({ ...base, payment_status: 'not_requested' }, 2026, 300)).toBeNull();
  });
});

describe('toAssetWaitlistRow', () => {
  const base = { id: 7, person_id: 2, item: 'mooring', position: 3, requested_at: '2026-01-01 00:00:00', notes: null };

  it('resolves the member id and preserves position', () => {
    const row = toAssetWaitlistRow(base, 'second@example.com', memberByEmail);
    expect(row).toEqual({
      id: 'ops-waitlist-7',
      assetType: 'mooring',
      memberId: 'mem-2',
      position: 3,
      requestedAt: '2026-01-01 00:00:00',
      notes: null,
      sourceId: 7,
    });
  });

  it('refuses an unmatched holder', () => {
    const row = toAssetWaitlistRow(base, 'nobody@example.com', memberByEmail);
    expect(row).toEqual({ skipped: 'unmatched', sourceId: 7, email: 'nobody@example.com' });
  });

  it('refuses a null position rather than writing an invalid NOT NULL column', () => {
    const row = toAssetWaitlistRow({ ...base, position: null }, 'second@example.com', memberByEmail);
    expect(row).toEqual({ skipped: 'no-position', sourceId: 7, email: 'second@example.com' });
  });

  it('resolves an OVERRIDES person id through mw_account_id even when the email would not match', () => {
    const overridden = { ...base, person_id: 120 };
    const memberByMwAccountId = new Map([['662f056a120ba1f321076c25', { id: 'mem-override', householdId: 'hh-override' }]]);
    const row = toAssetWaitlistRow(overridden, 'stale@example.com', memberByEmail, memberByMwAccountId);
    expect(row).toMatchObject({ memberId: 'mem-override' });
  });

  it('falls through to the email match when an override id has no member row yet', () => {
    const overridden = { ...base, person_id: 120 };
    const row = toAssetWaitlistRow(overridden, 'second@example.com', memberByEmail, new Map());
    expect(row).toMatchObject({ memberId: 'mem-2' });
  });
});

describe('planImport (synthetic fixture)', () => {
  const ops = {
    assetTypes: [
      { id: 'mooring', name: 'Mooring', fee: 30000, capacity: 12, sort_order: 1 },
      { id: 'small_boat', name: 'Small Boat Rack', fee: 5000, capacity: null, sort_order: 4 },
    ],
    assignments: [
      // matched, active, paid
      { id: 1, person_id: 1, asset_type: 'mooring', description: 'Boat A', status: 'active', created_at: '2026-01-01 00:00:00', payment_status: 'paid', payment_sent_at: '2026-01-02 00:00:00', stripe_payment_id: 'cs_1' },
      // matched, released, sent (outstanding)
      { id: 2, person_id: 2, asset_type: 'small_boat', description: 'Boat B', status: 'cancelled', created_at: '2026-01-03 00:00:00', payment_status: 'sent', payment_sent_at: '2026-01-04 00:00:00', stripe_payment_id: 'cs_2' },
      // matched, never billed
      { id: 3, person_id: 1, asset_type: 'small_boat', description: 'Boat C', status: 'active', created_at: '2026-01-05 00:00:00', payment_status: 'not_requested', payment_sent_at: null, stripe_payment_id: null },
      // unmatched holder
      { id: 4, person_id: 3, asset_type: 'mooring', description: 'Boat D', status: 'active', created_at: '2026-01-06 00:00:00', payment_status: 'paid', payment_sent_at: '2026-01-07 00:00:00', stripe_payment_id: 'cs_4' },
    ],
    waitlist: [
      { id: 10, person_id: 2, item: 'mooring', position: 1, requested_at: '2026-01-01 00:00:00', notes: null },
      { id: 11, person_id: 3, item: 'mooring', position: 2, requested_at: '2026-01-02 00:00:00', notes: null },
    ],
    emailByPersonId: new Map([
      [1, 'matched@example.com'],
      [2, 'second@example.com'],
      [3, 'unmatched@example.com'],
    ]),
  };
  const club = { memberByEmail, currentMembershipByHousehold, currentSeason: 2026 };

  it('imports asset types with dollar fees', () => {
    const { assetTypeRows } = planImport(ops, club);
    expect(assetTypeRows).toEqual([
      { id: 'mooring', name: 'Mooring', fee: 300, capacity: 12, sortOrder: 1 },
      { id: 'small_boat', name: 'Small Boat Rack', fee: 50, capacity: null, sortOrder: 4 },
    ]);
  });

  it('imports every matched assignment (active and released alike), skipping the unmatched one', () => {
    const { assignmentRows, assignmentSkips } = planImport(ops, club);
    expect(assignmentRows.map((r) => r.id)).toEqual(['ops-assignment-1', 'ops-assignment-2', 'ops-assignment-3']);
    expect(assignmentRows[1]).toMatchObject({ status: 'released' });
    expect(assignmentSkips).toEqual([{ skipped: 'unmatched', sourceId: 4, email: 'unmatched@example.com' }]);
  });

  it('creates a payment row only for billed assignments among the matched ones', () => {
    const { paymentRows } = planImport(ops, club);
    expect(paymentRows).toEqual([
      { id: 'ops-payment-1', assignmentId: 'ops-assignment-1', season: 2026, amount: 300, stripeRef: 'cs_1', paidAt: '2026-01-02 00:00:00' },
      { id: 'ops-payment-2', assignmentId: 'ops-assignment-2', season: 2026, amount: 50, stripeRef: 'cs_2', paidAt: null },
    ]);
  });

  it('imports the matched waitlist entry, preserving position, and skips the unmatched one', () => {
    const { waitlistRows, waitlistSkips } = planImport(ops, club);
    expect(waitlistRows).toEqual([
      { id: 'ops-waitlist-10', assetType: 'mooring', memberId: 'mem-2', position: 1, requestedAt: '2026-01-01 00:00:00', notes: null, sourceId: 10 },
    ]);
    expect(waitlistSkips).toEqual([{ skipped: 'unmatched', sourceId: 11, email: 'unmatched@example.com' }]);
  });
});

describe('planImport, OVERRIDES reconciliation (synthetic fixture)', () => {
  // Ops person 18's stale ops email would not match any club member on its own; the real
  // OVERRIDES entry for '18' resolves it through members.mw_account_id instead.
  const ops = {
    assetTypes: [{ id: 'mooring', name: 'Mooring', fee: 30000, capacity: 12, sort_order: 1 }],
    assignments: [
      { id: 20, person_id: 18, asset_type: 'mooring', description: 'Boat E', status: 'active', created_at: '2026-01-08 00:00:00', payment_status: 'not_requested', payment_sent_at: null, stripe_payment_id: null },
    ],
    waitlist: [{ id: 21, person_id: 18, item: 'mooring', position: 1, requested_at: '2026-01-08 00:00:00', notes: null }],
    emailByPersonId: new Map([[18, 'stale-ops-email@example.com']]),
  };
  const memberByMwAccountId = new Map([['661f6b677abbb920560b306b', { id: 'mem-override', householdId: 'hh-override' }]]);
  const currentMembershipByHouseholdWithOverride = new Map([...currentMembershipByHousehold, ['hh-override', 'ms-override']]);

  it('lands the assignment and waitlist entry on the overridden member, never the unmatched report', () => {
    const club = { memberByEmail, memberByMwAccountId, currentMembershipByHousehold: currentMembershipByHouseholdWithOverride, currentSeason: 2026 };
    const { assignmentRows, assignmentSkips, waitlistRows, waitlistSkips } = planImport(ops, club);
    expect(assignmentRows).toEqual([
      { id: 'ops-assignment-20', assetType: 'mooring', membershipId: 'ms-override', description: 'Boat E', status: 'active', createdAt: '2026-01-08 00:00:00', sourceId: 20 },
    ]);
    expect(assignmentSkips).toEqual([]);
    expect(waitlistRows).toEqual([
      { id: 'ops-waitlist-21', assetType: 'mooring', memberId: 'mem-override', position: 1, requestedAt: '2026-01-08 00:00:00', notes: null, sourceId: 21 },
    ]);
    expect(waitlistSkips).toEqual([]);
  });

  it('falls through to the unmatched report when the override account id has no member row yet', () => {
    const club = { memberByEmail, memberByMwAccountId: new Map(), currentMembershipByHousehold, currentSeason: 2026 };
    const { assignmentSkips, waitlistSkips } = planImport(ops, club);
    expect(assignmentSkips).toEqual([{ skipped: 'unmatched', sourceId: 20, email: 'stale-ops-email@example.com' }]);
    expect(waitlistSkips).toEqual([{ skipped: 'unmatched', sourceId: 21, email: 'stale-ops-email@example.com' }]);
  });
});
