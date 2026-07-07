import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { listDirectory } from '$member-portal/lib/directory';
import { setDirectoryVisibility } from '$member-portal/lib/household';

describe('listDirectory', () => {
  it('excludes hidden and archived members at the query level (WHERE clause asserted)', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM members m': [] } });
    await listDirectory(db);
    const select = calls.find((c) => c.sql.includes('FROM members m'));
    expect(select?.sql).toContain("directory_visibility != 'hidden'");
    expect(select?.sql).toContain('archived_at IS NULL');
  });

  it('shows a visible member with their email and phone', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM members m': [
          {
            household_id: 'hh-1',
            household_name: 'The Scratches',
            household_city: 'Anchorage',
            member_id: 'mem-1',
            member_name: 'Vera Visible',
            email: 'vera@example.com',
            phone: '+19075550100',
            directory_visibility: 'visible',
          },
        ],
      },
    });
    const households = await listDirectory(db);
    expect(households[0].members[0]).toEqual({
      id: 'mem-1',
      name: 'Vera Visible',
      email: 'vera@example.com',
      phone: '+19075550100',
    });
  });

  it('shows a partial member by name only, suppressing email and phone', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM members m': [
          {
            household_id: 'hh-1',
            household_name: 'The Scratches',
            household_city: 'Anchorage',
            member_id: 'mem-2',
            member_name: 'Pat Partial',
            email: 'pat@example.com',
            phone: '+19075550101',
            directory_visibility: 'partial',
          },
        ],
      },
    });
    const households = await listDirectory(db);
    expect(households[0].members[0]).toEqual({
      id: 'mem-2',
      name: 'Pat Partial',
      email: null,
      phone: null,
    });
  });

  it('groups members sharing a household, primary and non-primary alike', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM members m': [
          {
            household_id: 'hh-larsen',
            household_name: 'The Larsens',
            household_city: 'Anchorage',
            member_id: 'mem-erik',
            member_name: 'Erik Larsen',
            email: 'erik@example.com',
            phone: '+19075550102',
            directory_visibility: 'visible',
          },
          {
            household_id: 'hh-larsen',
            household_name: 'The Larsens',
            household_city: 'Anchorage',
            member_id: 'mem-kaija',
            member_name: 'Kaija Larsen',
            email: 'kaija@example.com',
            phone: '+19075550103',
            directory_visibility: 'visible',
          },
        ],
      },
    });
    const households = await listDirectory(db);
    expect(households).toHaveLength(1);
    expect(households[0].id).toBe('hh-larsen');
    expect(households[0].members.map((m) => m.id)).toEqual(['mem-erik', 'mem-kaija']);
  });

  it('drops a household with no listed members', async () => {
    const { db } = fakeD1({ allResults: { 'FROM members m': [] } });
    const households = await listDirectory(db);
    expect(households).toEqual([]);
  });

  it('reflects a listing the household primary set on another member (the read never re-checks who wrote it)', async () => {
    // household.ts's setDirectoryVisibility is the one write path both the member themself and
    // their household's primary call (portal-action.ts's own isPrimary gate decides who may call
    // it, not this module); the directory read never re-checks who wrote the row, so this test
    // proves the write and the read agree on the column both touch.
    const { db, calls } = fakeD1({
      allResults: {
        'FROM members m': [
          {
            household_id: 'hh-larsen',
            household_name: 'The Larsens',
            household_city: 'Anchorage',
            member_id: 'mem-kaija',
            member_name: 'Kaija Larsen',
            email: 'kaija@example.com',
            phone: '+19075550103',
            directory_visibility: 'visible',
          },
        ],
      },
    });
    await setDirectoryVisibility(db, 'mem-kaija', 'visible');
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect(update?.args).toEqual(['visible', 'mem-kaija']);

    const households = await listDirectory(db);
    expect(households[0].members[0]).toMatchObject({ id: 'mem-kaija', email: 'kaija@example.com' });
  });
});
