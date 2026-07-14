import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  approveNewRequest,
  approveRetentionRequest,
  cancelAssetRequest,
  createAssetRequest,
  denyAssetRequest,
  getPayableAssignmentFee,
  getPriorHoldingSummary,
  listHouseholdAssignments,
  listHouseholdRequests,
  listHouseholdWaitlistEntries,
  listPendingAssetRequests,
  payForApprovedRequest,
  releaseHouseholdAssignment,
} from '$member-portal/lib/assets';

describe('listHouseholdAssignments', () => {
  it('derives paymentStanding from the joined payment row, not a stored flag', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_assignments aa': [
          { id: 'aa-1', asset_type: 'mooring', asset_type_name: 'Mooring', description: 'Buoy M-14', payment_id: 'pay-1', paid_at: '2026-01-01 00:00:00', fee_amount: 300 },
          { id: 'aa-2', asset_type: 'rv-parking', asset_type_name: 'RV Parking', description: null, payment_id: 'pay-2', paid_at: null, fee_amount: 150 },
          { id: 'aa-3', asset_type: 'boat-parking', asset_type_name: 'Boat Parking', description: null, payment_id: null, paid_at: null, fee_amount: null },
        ],
      },
    });
    const rows = await listHouseholdAssignments(db, 'hh-1', 2026);
    expect(rows.map((r) => r.paymentStanding)).toEqual(['paid', 'outstanding', 'not-billed']);
  });

  it('carries the outstanding fee in cents only for an outstanding assignment', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_assignments aa': [
          { id: 'aa-1', asset_type: 'mooring', asset_type_name: 'Mooring', description: null, payment_id: 'pay-1', paid_at: '2026-01-01 00:00:00', fee_amount: 300 },
          { id: 'aa-2', asset_type: 'rv-parking', asset_type_name: 'RV Parking', description: null, payment_id: 'pay-2', paid_at: null, fee_amount: 150 },
          { id: 'aa-3', asset_type: 'boat-parking', asset_type_name: 'Boat Parking', description: null, payment_id: null, paid_at: null, fee_amount: null },
        ],
      },
    });
    const rows = await listHouseholdAssignments(db, 'hh-1', 2026);
    expect(rows.map((r) => r.feeCents)).toEqual([null, 15000, null]);
  });
});

describe('listHouseholdWaitlistEntries', () => {
  it('maps position and the queue\'s own total length', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_waitlist aw': [{ id: 'aw-1', asset_type: 'mooring', asset_type_name: 'Mooring', position: 3, queue_length: 7 }],
      },
    });
    await expect(listHouseholdWaitlistEntries(db, 'hh-1')).resolves.toEqual([
      { id: 'aw-1', assetType: 'mooring', assetTypeName: 'Mooring', position: 3, queueLength: 7 },
    ]);
  });
});

describe('listHouseholdRequests', () => {
  it('maps every stage', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_requests r JOIN asset_types at': [
          { id: 'req-1', asset_type: 'mooring', asset_type_name: 'Mooring', kind: 'retention', status: 'approved_awaiting_payment', note: null, deny_reason: null, fee: 300, created_at: '2026-01-01 00:00:00' },
        ],
      },
    });
    await expect(listHouseholdRequests(db, 'hh-1')).resolves.toEqual([
      { id: 'req-1', assetType: 'mooring', assetTypeName: 'Mooring', kind: 'retention', status: 'approved_awaiting_payment', note: null, denyReason: null, fee: 300, createdAt: '2026-01-01 00:00:00' },
    ]);
  });
});

describe('createAssetRequest', () => {
  it('inserts a pending request', async () => {
    const { db, calls } = fakeD1();
    const result = await createAssetRequest(db, { assetType: 'mooring', householdId: 'hh-1', requestedBy: 'mem-1', kind: 'new', note: 'Need a spot' });
    expect(result).toEqual({ id: expect.any(String) });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_requests'));
    expect(insert?.args).toEqual([result.id, 'mooring', 'hh-1', 'mem-1', 'new', 'Need a spot']);
  });
});

describe('cancelAssetRequest', () => {
  it('cancels only a pending request belonging to the household', async () => {
    const { db, calls } = fakeD1({ runResults: { "SET status = 'cancelled'": { changes: 1 } } });
    const result = await cancelAssetRequest(db, 'req-1', 'hh-1', 'mem-1');
    expect(result).toEqual({ ok: true });
    expect(calls[0].args).toEqual(['mem-1', 'req-1', 'hh-1']);
  });

  it('refuses when nothing matched (wrong household, or past pending)', async () => {
    const { db } = fakeD1({ runResults: { "SET status = 'cancelled'": { changes: 0 } } });
    const result = await cancelAssetRequest(db, 'req-1', 'hh-1', 'mem-1');
    expect(result).toEqual({ error: expect.stringContaining('can no longer be cancelled') });
  });
});

describe('releaseHouseholdAssignment', () => {
  it('refuses an assignment that is not the household\'s own', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_assignments aa JOIN memberships m': null } });
    const result = await releaseHouseholdAssignment(db, 'aa-1', 'hh-1');
    expect(result).toEqual({ error: 'No such assignment.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('releases an owned, active assignment', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_assignments aa JOIN memberships m': { id: 'aa-1' } } });
    const result = await releaseHouseholdAssignment(db, 'aa-1', 'hh-1');
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.includes("SET status = 'released'"))).toBe(true);
  });
});

describe('getPriorHoldingSummary', () => {
  it('answers null for a household that has never held this type', async () => {
    const { db } = fakeD1({ allResults: { 'FROM asset_assignments aa JOIN memberships m': [] } });
    await expect(getPriorHoldingSummary(db, 'hh-1', 'mooring')).resolves.toBeNull();
  });

  it('reports a clean paid-every-season history', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_assignments aa JOIN memberships m': [
          { created_at: '2023-04-01 00:00:00', unpaid_seasons: 0, billed_seasons: 1 },
          { created_at: '2024-04-01 00:00:00', unpaid_seasons: 0, billed_seasons: 1 },
          { created_at: '2026-04-01 00:00:00', unpaid_seasons: 0, billed_seasons: 1 },
        ],
      },
    });
    await expect(getPriorHoldingSummary(db, 'hh-1', 'mooring')).resolves.toBe('Held this type 2023 through 2026, paid each season.');
  });

  it('reports mixed history honestly, never asserting "paid each season" when it is not true', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_assignments aa JOIN memberships m': [{ created_at: '2026-04-01 00:00:00', unpaid_seasons: 1, billed_seasons: 1 }],
      },
    });
    await expect(getPriorHoldingSummary(db, 'hh-1', 'mooring')).resolves.toBe('Held this type 2026; payment history is mixed.');
  });
});

describe('approveNewRequest', () => {
  const REQUEST_ROW = { asset_type: 'mooring', household_id: 'hh-1', requested_by: 'mem-1', kind: 'new' as const };

  it('refuses a non-pending or unknown request', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_requests WHERE id': null } });
    await expect(approveNewRequest(db, 'req-1', 'admin@example.com')).resolves.toEqual({ error: expect.stringContaining('No such pending') });
  });

  it('refuses a retention-kind request (needs the retention approval action)', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_requests WHERE id': { ...REQUEST_ROW, kind: 'retention' } } });
    await expect(approveNewRequest(db, 'req-1', 'admin@example.com')).resolves.toEqual({ error: expect.stringContaining('retention approval') });
  });

  it('assigns directly when the type has a free slot', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM asset_requests WHERE id': REQUEST_ROW,
        'FROM asset_types WHERE id': { capacity: 10 },
        'FROM asset_assignments WHERE asset_type': { n: 3 },
        'FROM memberships WHERE household_id': { id: 'ms-1' },
      },
    });
    const result = await approveNewRequest(db, 'req-1', 'admin@example.com');
    expect(result).toEqual({ ok: true, outcome: 'assigned' });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_assignments'))).toBe(true);
    expect(calls.some((c) => c.sql.includes("SET status = 'assigned'"))).toBe(true);
  });

  it('queues when the type has no free slot', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM asset_requests WHERE id': REQUEST_ROW,
        'FROM asset_types WHERE id': { capacity: 3 },
        'FROM asset_assignments WHERE asset_type': { n: 3 },
      },
    });
    const result = await approveNewRequest(db, 'req-1', 'admin@example.com');
    expect(result).toEqual({ ok: true, outcome: 'queued' });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_waitlist'))).toBe(true);
    expect(calls.some((c) => c.sql.includes("SET status = 'queued'"))).toBe(true);
  });

  it('treats a null capacity (uncapped type) as always having a free slot', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM asset_requests WHERE id': REQUEST_ROW,
        'FROM asset_types WHERE id': { capacity: null },
        'FROM asset_assignments WHERE asset_type': { n: 999 },
        'FROM memberships WHERE household_id': { id: 'ms-1' },
      },
    });
    await expect(approveNewRequest(db, 'req-1', 'admin@example.com')).resolves.toEqual({ ok: true, outcome: 'assigned' });
  });
});

describe('approveRetentionRequest', () => {
  it('opens the pay task without assigning outright (the merit gate)', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_requests WHERE id': { kind: 'retention' } } });
    const result = await approveRetentionRequest(db, 'req-1', 'admin@example.com');
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.includes("SET status = 'approved_awaiting_payment'"))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_assignments'))).toBe(false);
  });

  it('refuses a new-kind request', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_requests WHERE id': { kind: 'new' } } });
    await expect(approveRetentionRequest(db, 'req-1', 'admin@example.com')).resolves.toEqual({ error: expect.stringContaining('new-request approval') });
  });
});

describe('denyAssetRequest', () => {
  it('requires the request to still be pending', async () => {
    const { db } = fakeD1({ runResults: { "SET status = 'denied'": { changes: 0 } } });
    await expect(denyAssetRequest(db, 'req-1', 'Not eligible', 'admin@example.com')).resolves.toEqual({ error: 'No such pending request.' });
  });

  it('denies with the reason recorded', async () => {
    const { db, calls } = fakeD1({ runResults: { "SET status = 'denied'": { changes: 1 } } });
    const result = await denyAssetRequest(db, 'req-1', 'Not eligible', 'admin@example.com');
    expect(result).toEqual({ ok: true });
    expect(calls[0].args).toEqual(['Not eligible', 'admin@example.com', 'req-1']);
  });
});

describe('payForApprovedRequest (the honest payment stub)', () => {
  it('refuses a request not in approved_awaiting_payment for this household', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_requests WHERE id': null } });
    await expect(payForApprovedRequest(db, 'req-1', 'hh-1')).resolves.toEqual({ error: expect.stringContaining('No such request') });
  });

  it('creates the real assignment and an OUTSTANDING payment row (never claims money moved)', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM asset_requests WHERE id': { asset_type: 'mooring', household_id: 'hh-1' },
        'FROM memberships WHERE household_id': { id: 'ms-1' },
        'FROM asset_types WHERE id': { fee: 300 },
      },
    });
    const result = await payForApprovedRequest(db, 'req-1', 'hh-1');
    expect(result).toEqual({ ok: true, assignmentId: expect.any(String) });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_assignments'))).toBe(true);
    const paymentInsert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_payments'));
    expect(paymentInsert?.args).toEqual([expect.any(String), expect.any(String), expect.any(Number), 300]);
    expect(paymentInsert?.sql).not.toContain('paid_at');
    expect(calls.some((c) => c.sql.includes("SET status = 'assigned'"))).toBe(true);
  });
});

describe('getPayableAssignmentFee', () => {
  it('refuses when the assignment carries no outstanding row for the season (already paid, not the household\'s own, or never billed)', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments aa': null } });
    await expect(getPayableAssignmentFee(db, 'aa-1', 'hh-1', 2026)).resolves.toEqual({ error: expect.stringContaining('No outstanding fee') });
  });

  it('answers the outstanding fee in cents, converted from the stored dollar amount', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM asset_assignments aa': { asset_type_name: 'Mooring', amount: 150 } },
    });
    await expect(getPayableAssignmentFee(db, 'aa-1', 'hh-1', 2026)).resolves.toEqual({ amountCents: 15000, assetTypeName: 'Mooring' });
    expect(calls[0].args).toEqual(['aa-1', 'hh-1', 2026]);
  });
});

describe('listPendingAssetRequests (the admin review inbox)', () => {
  it('joins each row to its prior-holding summary', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_requests r': [
          { id: 'req-1', asset_type_name: 'Mooring', asset_type: 'mooring', household_name: 'The Scratches', household_id: 'hh-1', requester_name: 'Primary Scratch', kind: 'retention', note: null, created_at: '2026-01-01 00:00:00', fee: 300 },
        ],
        'FROM asset_assignments aa JOIN memberships m': [{ created_at: '2025-04-01 00:00:00', unpaid_seasons: 0, billed_seasons: 1 }],
      },
    });
    const rows = await listPendingAssetRequests(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].priorHolding).toBe('Held this type 2025, paid each season.');
  });
});
