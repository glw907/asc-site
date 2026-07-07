import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  addToWaitlist,
  assignAsset,
  getAssignment,
  getWaitlistEntry,
  listActiveAssignments,
  listAssetTypes,
  listAssetWaitlist,
  listMemberOptions,
  listMembershipOptions,
  moveToEndOfWaitlist,
  recordPayment,
  releaseAssignment,
  removeFromWaitlist,
} from '$admin-club/lib/assets-store';

describe('listAssetTypes', () => {
  it('maps each raw row to the camelCased shape', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM asset_types ORDER BY': [{ id: 'mooring', name: 'Mooring', fee: 300, capacity: 12, sort_order: 1 }] },
    });
    await expect(listAssetTypes(db)).resolves.toEqual([{ id: 'mooring', name: 'Mooring', fee: 300, capacity: 12, sortOrder: 1 }]);
  });
});

describe('listActiveAssignments', () => {
  const RAW = {
    id: 'a-1',
    asset_type: 'mooring',
    asset_type_name: 'Mooring',
    membership_id: 'ms-1',
    household_id: 'hh-1',
    household_name: 'The Larsens',
    primary_member_name: 'Kaija Larsen',
    description: 'Buoy M-14',
    status: 'active',
    created_at: '2026-01-01 00:00:00',
    payment_id: null,
    paid_at: null,
  };

  it('derives not-billed when no payment row exists', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM asset_assignments aa': [RAW] } });
    const rows = await listActiveAssignments(db, 2026);
    expect(rows).toEqual([
      {
        id: 'a-1',
        assetType: 'mooring',
        assetTypeName: 'Mooring',
        membershipId: 'ms-1',
        householdId: 'hh-1',
        householdName: 'The Larsens',
        primaryMemberName: 'Kaija Larsen',
        description: 'Buoy M-14',
        status: 'active',
        createdAt: '2026-01-01 00:00:00',
        paymentId: null,
        paymentStanding: 'not-billed',
      },
    ]);
    expect(calls[0].args).toEqual([2026]);
  });

  it('derives outstanding when a payment row exists with no paid_at', async () => {
    const { db } = fakeD1({ allResults: { 'FROM asset_assignments aa': [{ ...RAW, payment_id: 'p-1', paid_at: null }] } });
    const rows = await listActiveAssignments(db, 2026);
    expect(rows[0].paymentStanding).toBe('outstanding');
  });

  it('derives paid when a payment row has paid_at set', async () => {
    const { db } = fakeD1({ allResults: { 'FROM asset_assignments aa': [{ ...RAW, payment_id: 'p-1', paid_at: '2026-03-01 00:00:00' }] } });
    const rows = await listActiveAssignments(db, 2026);
    expect(rows[0].paymentStanding).toBe('paid');
  });
});

describe('getAssignment', () => {
  it('maps a found row, normalizing status', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments WHERE id': { id: 'a-1', status: 'released', asset_type: 'mooring' } } });
    await expect(getAssignment(db, 'a-1')).resolves.toEqual({ id: 'a-1', status: 'released', assetType: 'mooring' });
  });

  it('returns null for no such row', async () => {
    const { db } = fakeD1();
    await expect(getAssignment(db, 'missing')).resolves.toBeNull();
  });
});

describe('listMembershipOptions', () => {
  it('maps each row, filtering to the given season via the bound argument', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM memberships m': [{ membership_id: 'ms-1', household_id: 'hh-1', household_name: 'The Larsens', primary_member_name: 'Kaija Larsen' }],
      },
    });
    await expect(listMembershipOptions(db, 2026)).resolves.toEqual([
      { membershipId: 'ms-1', householdId: 'hh-1', householdName: 'The Larsens', primaryMemberName: 'Kaija Larsen' },
    ]);
    expect(calls[0].args).toEqual([2026]);
  });
});

describe('listMemberOptions', () => {
  it('maps each row, excluding archived members via the WHERE clause', async () => {
    const { db, calls } = fakeD1({
      allResults: { 'FROM members m': [{ member_id: 'mem-1', name: 'Kaija Larsen', email: 'kaija@example.com', household_name: 'The Larsens' }] },
    });
    await expect(listMemberOptions(db)).resolves.toEqual([
      { memberId: 'mem-1', name: 'Kaija Larsen', email: 'kaija@example.com', householdName: 'The Larsens' },
    ]);
    expect(calls[0].sql).toContain('archived_at IS NULL');
  });
});

describe('assignAsset', () => {
  it('inserts one active assignment row', async () => {
    const { db, calls } = fakeD1();
    const id = await assignAsset(db, { assetType: 'mooring', membershipId: 'ms-1', description: 'Buoy M-14' });
    expect(typeof id).toBe('string');
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_assignments'));
    expect(insert?.args).toEqual([id, 'mooring', 'ms-1', 'Buoy M-14', 'active']);
  });
});

describe('releaseAssignment', () => {
  it('updates status to released', async () => {
    const { db, calls } = fakeD1();
    await releaseAssignment(db, 'a-1');
    expect(calls).toEqual([{ sql: "UPDATE asset_assignments SET status = 'released' WHERE id = ?1", args: ['a-1'] }]);
  });
});

describe('recordPayment', () => {
  it('upserts a payment row with paid_at stamped now', async () => {
    const { db, calls } = fakeD1();
    await recordPayment(db, { assignmentId: 'a-1', season: 2026, amount: 300, method: 'check', reference: 'Check #1234' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_payments'));
    expect(insert?.sql).toContain('ON CONFLICT (assignment_id, season) DO UPDATE');
    expect(insert?.args.slice(1)).toEqual(['a-1', 2026, 300, 'check', 'Check #1234']);
  });
});

describe('listAssetWaitlist', () => {
  it('maps each raw row', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM asset_waitlist aw': [
          {
            id: 'w-1',
            asset_type: 'mooring',
            asset_type_name: 'Mooring',
            member_id: 'mem-1',
            member_name: 'Kaija Larsen',
            member_email: 'kaija@example.com',
            position: 1,
            requested_at: '2026-01-01 00:00:00',
            notes: null,
          },
        ],
      },
    });
    await expect(listAssetWaitlist(db)).resolves.toEqual([
      {
        id: 'w-1',
        assetType: 'mooring',
        assetTypeName: 'Mooring',
        memberId: 'mem-1',
        memberName: 'Kaija Larsen',
        memberEmail: 'kaija@example.com',
        position: 1,
        requestedAt: '2026-01-01 00:00:00',
        notes: null,
      },
    ]);
  });
});

describe('addToWaitlist', () => {
  it('appends to the end of the type-specific queue', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE asset_type': { max_position: 2 } } });
    const id = await addToWaitlist(db, { assetType: 'mooring', memberId: 'mem-1', notes: null });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_waitlist'));
    expect(insert?.args).toEqual([id, 'mooring', 'mem-1', 3, null]);
  });

  it('starts at position 1 when the queue is empty', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE asset_type': null } });
    await addToWaitlist(db, { assetType: 'mooring', memberId: 'mem-1', notes: null });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_waitlist'));
    expect(insert?.args[3]).toBe(1);
  });
});

describe('removeFromWaitlist', () => {
  it('deletes the one row', async () => {
    const { db, calls } = fakeD1();
    await removeFromWaitlist(db, 'w-1');
    expect(calls).toEqual([{ sql: 'DELETE FROM asset_waitlist WHERE id = ?1', args: ['w-1'] }]);
  });
});

describe('getWaitlistEntry', () => {
  it('maps a found row', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE id': { id: 'w-1', asset_type: 'mooring' } } });
    await expect(getWaitlistEntry(db, 'w-1')).resolves.toEqual({ id: 'w-1', assetType: 'mooring' });
  });

  it('returns null for no such row', async () => {
    const { db } = fakeD1();
    await expect(getWaitlistEntry(db, 'missing')).resolves.toBeNull();
  });
});

describe('moveToEndOfWaitlist', () => {
  it('sets position past every other entry in the same type', async () => {
    const { db, calls } = fakeD1();
    await moveToEndOfWaitlist(db, 'w-1', 'mooring');
    expect(calls).toEqual([{ sql: expect.stringContaining('UPDATE asset_waitlist SET position'), args: ['w-1', 'mooring'] }]);
  });
});
