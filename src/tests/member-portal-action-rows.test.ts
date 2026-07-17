import { describe, expect, it } from 'vitest';
import { buildActionRows } from '$member-portal/lib/action-rows';
import type { HouseholdAssignmentRow, HouseholdRequestRow } from '$member-portal/lib/assets';
import type { MyWaitlistRow } from '$member-portal/lib/classes';

function assignment(overrides: Partial<HouseholdAssignmentRow>): HouseholdAssignmentRow {
  return {
    id: 'aa-1',
    assetType: 'mooring',
    assetTypeName: 'Mooring',
    description: null,
    paymentStanding: 'paid',
    feeCents: null,
    ...overrides,
  };
}

function request(overrides: Partial<HouseholdRequestRow>): HouseholdRequestRow {
  return {
    id: 'req-1',
    assetType: 'rv-parking',
    assetTypeName: 'RV Parking',
    kind: 'new',
    status: 'pending',
    note: null,
    denyReason: null,
    fee: 100,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function waitlistEntry(overrides: Partial<MyWaitlistRow>): MyWaitlistRow {
  return {
    waitlistId: 'wl-1',
    classId: 'class-1',
    className: 'Adult Intro',
    position: 1,
    queueLength: 3,
    offer: null,
    ...overrides,
  };
}

describe('buildActionRows', () => {
  it('returns no rows when there is nothing real to act on', () => {
    expect(buildActionRows({ assignments: [], requests: [], waitlistEntries: [] })).toEqual([]);
    expect(
      buildActionRows({
        assignments: [assignment({ paymentStanding: 'paid' }), assignment({ paymentStanding: 'not-billed' })],
        requests: [request({ status: 'pending' }), request({ status: 'denied' })],
        waitlistEntries: [waitlistEntry({ offer: null })],
      }),
    ).toEqual([]);
  });

  it('turns an outstanding assignment fee into a pay row through the asset-fee door', () => {
    const rows = buildActionRows({
      assignments: [assignment({ id: 'aa-locker', assetTypeName: 'Gear Locker', paymentStanding: 'outstanding', feeCents: 15000 })],
      requests: [],
      waitlistEntries: [],
    });
    expect(rows).toEqual([
      {
        id: 'asset-fee-aa-locker',
        title: 'Gear Locker fee outstanding',
        amountCents: 15000,
        actionLabel: 'Pay now',
        formAction: '?/payAssetFee',
        fieldName: 'assignmentId',
        fieldValue: 'aa-locker',
      },
    ]);
  });

  it('turns an approved-awaiting-payment request into a pay row through the request door, converting dollars to cents', () => {
    const rows = buildActionRows({
      assignments: [],
      requests: [request({ id: 'req-mooring', assetTypeName: 'Mooring', status: 'approved_awaiting_payment', fee: 150 })],
      waitlistEntries: [],
    });
    expect(rows).toEqual([
      {
        id: 'request-fee-req-mooring',
        title: 'Mooring request approved',
        amountCents: 15000,
        actionLabel: 'Pay now',
        formAction: '?/payRequest',
        fieldName: 'requestId',
        fieldValue: 'req-mooring',
      },
    ]);
  });

  it('turns a live class-waitlist offer into a claim row with no dollar amount', () => {
    const rows = buildActionRows({
      assignments: [],
      requests: [],
      waitlistEntries: [waitlistEntry({ waitlistId: 'wl-offer', className: 'Youth Basics', offer: { expiresAt: '2026-07-10 00:00:00' } })],
    });
    expect(rows).toEqual([
      {
        id: 'offer-wl-offer',
        title: 'Youth Basics: a spot opened up',
        amountCents: null,
        actionLabel: 'Claim spot',
        formAction: '/my-account/classes?/claimOffer',
        fieldName: 'waitlistId',
        fieldValue: 'wl-offer',
      },
    ]);
  });

  it('orders a live offer first (the most urgent, since it expires), then asset fees, then request fees', () => {
    const rows = buildActionRows({
      assignments: [assignment({ id: 'aa-1', paymentStanding: 'outstanding', feeCents: 5000 })],
      requests: [request({ id: 'req-1', status: 'approved_awaiting_payment' })],
      waitlistEntries: [waitlistEntry({ waitlistId: 'wl-1', offer: { expiresAt: '2026-07-10 00:00:00' } })],
    });
    expect(rows.map((r) => r.id)).toEqual(['offer-wl-1', 'asset-fee-aa-1', 'request-fee-req-1']);
  });

  it('ignores a request in every non-payable status', () => {
    const rows = buildActionRows({
      assignments: [],
      requests: [
        request({ id: 'r-pending', status: 'pending' }),
        request({ id: 'r-queued', status: 'queued' }),
        request({ id: 'r-assigned', status: 'assigned' }),
        request({ id: 'r-denied', status: 'denied' }),
        request({ id: 'r-cancelled', status: 'cancelled' }),
      ],
      waitlistEntries: [],
    });
    expect(rows).toEqual([]);
  });
});
