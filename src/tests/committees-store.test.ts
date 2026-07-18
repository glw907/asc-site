import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  addCommitteeMember,
  approveCommitteeMember,
  createCommittee,
  createMemberPosition,
  listCommitteeMembers,
  listCommittees,
  listMemberPositions,
  moveMemberPosition,
  removeCommitteeMember,
  removeMemberPosition,
  setCommitteeArchived,
  setCommitteeMemberRole,
  updateCommittee,
  updateMemberPosition,
} from '$admin-club/lib/committees-store';

describe('listCommittees', () => {
  it('excludes archived committees by default', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM committees': [
          { id: 'c-1', slug: 'fleet', name: 'Fleet', description: 'Boats and moorings', kind: 'established', sort_order: 1, archived_at: null },
        ],
      },
    });
    await expect(listCommittees(db)).resolves.toEqual([
      { id: 'c-1', slug: 'fleet', name: 'Fleet', description: 'Boats and moorings', kind: 'established', sortOrder: 1, archived: false },
    ]);
    expect(calls[0].sql).toContain('WHERE archived_at IS NULL');
  });

  it('includes archived committees when asked, deriving archived from archived_at', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM committees': [
          { id: 'c-2', slug: 'harbor', name: 'Harbor', description: null, kind: 'established', sort_order: 2, archived_at: '2026-01-01 00:00:00' },
        ],
      },
    });
    const rows = await listCommittees(db, { includeArchived: true });
    expect(rows).toEqual([
      { id: 'c-2', slug: 'harbor', name: 'Harbor', description: null, kind: 'established', sortOrder: 2, archived: true },
    ]);
    expect(calls[0].sql).not.toContain('WHERE archived_at IS NULL');
  });
});

describe('createCommittee', () => {
  it('inserts a row, deriving the slug from the name', async () => {
    const { db, calls } = fakeD1();
    const id = await createCommittee(db, { name: 'Board Development', description: 'Recruits future leaders', kind: 'standing', sortOrder: 6 });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO committees'));
    expect(insert?.args).toEqual([id, 'board-development', 'Board Development', 'Recruits future leaders', 'standing', 6]);
  });
});

describe('updateCommittee', () => {
  it('updates name, description, kind, and sort order', async () => {
    const { db, calls } = fakeD1();
    await updateCommittee(db, 'c-1', { name: 'Fleet', description: null, kind: 'established', sortOrder: 3 });
    expect(calls).toEqual([
      { sql: expect.stringContaining('UPDATE committees SET name'), args: ['Fleet', null, 'established', 3, 'c-1'] },
    ]);
  });
});

describe('setCommitteeArchived', () => {
  it('stamps archived_at when archiving', async () => {
    const { db, calls } = fakeD1();
    await setCommitteeArchived(db, 'c-1', true);
    expect(calls).toEqual([{ sql: expect.stringContaining("SET archived_at = datetime('now')"), args: ['c-1'] }]);
  });

  it('clears archived_at when restoring', async () => {
    const { db, calls } = fakeD1();
    await setCommitteeArchived(db, 'c-1', false);
    expect(calls).toEqual([{ sql: expect.stringContaining('SET archived_at = NULL'), args: ['c-1'] }]);
  });
});

describe('listCommitteeMembers', () => {
  it('maps each joined row, both statuses included', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM committee_members cm': [
          { id: 'cm-1', committee_id: 'c-1', committee_name: 'Fleet', member_id: 'm-1', member_name: 'Kaija Larsen', role: 'chair', status: 'active' },
          { id: 'cm-2', committee_id: 'c-1', committee_name: 'Fleet', member_id: 'm-2', member_name: 'Bart Hawkins', role: 'member', status: 'pending' },
        ],
      },
    });
    await expect(listCommitteeMembers(db)).resolves.toEqual([
      { id: 'cm-1', committeeId: 'c-1', committeeName: 'Fleet', memberId: 'm-1', memberName: 'Kaija Larsen', role: 'chair', status: 'active' },
      { id: 'cm-2', committeeId: 'c-1', committeeName: 'Fleet', memberId: 'm-2', memberName: 'Bart Hawkins', role: 'member', status: 'pending' },
    ]);
  });
});

describe('addCommitteeMember', () => {
  it('inserts an active row directly (admin-add stands in for chair-add/board appointment)', async () => {
    const { db, calls } = fakeD1();
    const id = await addCommitteeMember(db, { committeeId: 'c-1', memberId: 'm-1', role: 'member' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO committee_members ('));
    expect(insert?.sql).toContain("'active'");
    expect(insert?.args).toEqual([id, 'c-1', 'm-1', 'member']);
  });
});

describe('approveCommitteeMember', () => {
  it('sets status to active', async () => {
    const { db, calls } = fakeD1();
    await approveCommitteeMember(db, 'cm-2');
    expect(calls[0].sql).toContain("SET status = 'active'");
    expect(calls[0].args).toEqual(['cm-2']);
  });
});

describe('setCommitteeMemberRole', () => {
  it('updates the role column', async () => {
    const { db, calls } = fakeD1();
    await setCommitteeMemberRole(db, 'cm-1', 'co-chair');
    expect(calls).toEqual([{ sql: expect.stringContaining('SET role = ?1'), args: ['co-chair', 'cm-1'] }]);
  });
});

describe('removeCommitteeMember', () => {
  it('deletes the row outright -- the same function a decline and a remove both call', async () => {
    const { db, calls } = fakeD1();
    await removeCommitteeMember(db, 'cm-2');
    expect(calls).toEqual([{ sql: 'DELETE FROM committee_members WHERE id = ?1', args: ['cm-2'] }]);
  });
});

describe('listMemberPositions', () => {
  it('maps each joined row', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM member_positions mp': [
          { id: 'p-1', member_id: 'm-1', member_name: 'Kaija Larsen', kind: 'officer', title: 'Commodore', sort_order: 0 },
        ],
      },
    });
    await expect(listMemberPositions(db)).resolves.toEqual([
      { id: 'p-1', memberId: 'm-1', memberName: 'Kaija Larsen', kind: 'officer', title: 'Commodore', sortOrder: 0 },
    ]);
  });
});

describe('createMemberPosition', () => {
  it('appends to the end of the whole list', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM member_positions': { max_order: 2 } } });
    const id = await createMemberPosition(db, { memberId: 'm-1', kind: 'director', title: 'Director' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO member_positions'));
    expect(insert?.args).toEqual([id, 'm-1', 'director', 'Director', 3]);
  });

  it('starts at 0 when the list is empty', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM member_positions': null } });
    await createMemberPosition(db, { memberId: 'm-1', kind: 'officer', title: 'Commodore' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO member_positions'));
    expect(insert?.args[4]).toBe(0);
  });
});

describe('updateMemberPosition', () => {
  it('updates kind and title only, never sort order', async () => {
    const { db, calls } = fakeD1();
    await updateMemberPosition(db, 'p-1', { kind: 'appointed', title: 'Instructor' });
    expect(calls).toEqual([{ sql: expect.stringContaining('SET kind = ?1, title = ?2'), args: ['appointed', 'Instructor', 'p-1'] }]);
  });
});

describe('removeMemberPosition', () => {
  it('deletes the one row', async () => {
    const { db, calls } = fakeD1();
    await removeMemberPosition(db, 'p-1');
    expect(calls).toEqual([{ sql: 'DELETE FROM member_positions WHERE id = ?1', args: ['p-1'] }]);
  });
});

describe('moveMemberPosition', () => {
  const ORDERED = [
    { id: 'p-1', sort_order: 0 },
    { id: 'p-2', sort_order: 1 },
    { id: 'p-3', sort_order: 2 },
  ];

  it('swaps sort_order with the previous neighbor when moving up', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM member_positions ORDER BY': ORDERED } });
    await moveMemberPosition(db, 'p-2', 'up');
    const updates = calls.filter((c) => c.sql.startsWith('UPDATE member_positions SET sort_order'));
    expect(updates).toEqual([
      { sql: expect.any(String), args: [0, 'p-2'] },
      { sql: expect.any(String), args: [1, 'p-1'] },
    ]);
  });

  it('swaps sort_order with the next neighbor when moving down', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM member_positions ORDER BY': ORDERED } });
    await moveMemberPosition(db, 'p-2', 'down');
    const updates = calls.filter((c) => c.sql.startsWith('UPDATE member_positions SET sort_order'));
    expect(updates).toEqual([
      { sql: expect.any(String), args: [2, 'p-2'] },
      { sql: expect.any(String), args: [1, 'p-3'] },
    ]);
  });

  it('is a no-op moving the first position up', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM member_positions ORDER BY': ORDERED } });
    await moveMemberPosition(db, 'p-1', 'up');
    expect(calls.filter((c) => c.sql.startsWith('UPDATE'))).toEqual([]);
  });

  it('is a no-op moving the last position down', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM member_positions ORDER BY': ORDERED } });
    await moveMemberPosition(db, 'p-3', 'down');
    expect(calls.filter((c) => c.sql.startsWith('UPDATE'))).toEqual([]);
  });

  it('is a no-op for an id not in the list', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM member_positions ORDER BY': ORDERED } });
    await moveMemberPosition(db, 'missing', 'up');
    expect(calls.filter((c) => c.sql.startsWith('UPDATE'))).toEqual([]);
  });
});
