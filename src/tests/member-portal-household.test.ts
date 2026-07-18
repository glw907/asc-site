import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  addHouseholdMember,
  getHouseholdAddress,
  getHouseholdInfo,
  leaveClub,
  listHouseholdMembers,
  removeHouseholdMember,
  setDirectoryVisibility,
  updateHouseholdAddress,
} from '$member-portal/lib/household';

const HOUSEHOLD_ROW = { id: 'hh-1', name: 'The Scratches', primary_member_id: 'mem-primary', left_at: null };

describe('getHouseholdInfo', () => {
  it('reads the household row, camelCased', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM households WHERE id': HOUSEHOLD_ROW } });
    await expect(getHouseholdInfo(db, 'hh-1')).resolves.toEqual({
      id: 'hh-1',
      name: 'The Scratches',
      primaryMemberId: 'mem-primary',
      leftAt: null,
    });
  });
});

describe('listHouseholdMembers', () => {
  it('marks the primary member and sorts primary-first, then alphabetical', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM households WHERE id': HOUSEHOLD_ROW },
      allResults: {
        'FROM members WHERE household_id': [
          { id: 'mem-zed', name: 'Zed Scratch', email: 'zed@example.com', phone: null, birthdate: null, directory_visibility: 'visible', archived_at: null },
          { id: 'mem-primary', name: 'Primary Scratch', email: 'primary@example.com', phone: null, birthdate: null, directory_visibility: 'partial', archived_at: null },
          { id: 'mem-alice', name: 'Alice Scratch', email: null, phone: null, birthdate: '2015-01-01', directory_visibility: 'hidden', archived_at: null },
        ],
      },
    });
    const members = await listHouseholdMembers(db, 'hh-1');
    expect(members.map((m) => m.id)).toEqual(['mem-primary', 'mem-alice', 'mem-zed']);
    expect(members[0].isPrimary).toBe(true);
    expect(members[1].isPrimary).toBe(false);
  });
});

describe('addHouseholdMember', () => {
  it('inserts a fresh member row under the household', async () => {
    const { db, calls } = fakeD1();
    const id = await addHouseholdMember(db, 'hh-1', { name: 'Kid Scratch', email: null, phone: null, birthdate: '2016-03-01' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(insert?.args).toEqual([id, 'hh-1', 'Kid Scratch', null, null, '2016-03-01']);
  });

  it('lowercases the email and normalizes a messy phone to E.164', async () => {
    const { db, calls } = fakeD1();
    const id = await addHouseholdMember(db, 'hh-1', { name: 'Kid Scratch', email: 'Kid@Example.COM', phone: '(907) 555-0100', birthdate: null });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(insert?.args).toEqual([id, 'hh-1', 'Kid Scratch', 'kid@example.com', '+19075550100', null]);
  });

  it('stores an unparseable phone trimmed raw rather than refusing', async () => {
    const { db, calls } = fakeD1();
    const id = await addHouseholdMember(db, 'hh-1', { name: 'Kid Scratch', email: null, phone: '  call the office  ', birthdate: null });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(insert?.args).toEqual([id, 'hh-1', 'Kid Scratch', null, 'call the office', null]);
  });

  it('recases an all-caps name', async () => {
    const { db, calls } = fakeD1();
    const id = await addHouseholdMember(db, 'hh-1', { name: 'JOHN SMITH', email: null, phone: null, birthdate: null });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(insert?.args).toEqual([id, 'hh-1', 'John Smith', null, null, null]);
  });
});

describe('removeHouseholdMember', () => {
  it('refuses to remove the household\'s own primary', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM households WHERE id': HOUSEHOLD_ROW } });
    const result = await removeHouseholdMember(db, 'hh-1', 'mem-primary');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('primary member cannot be removed') });
    expect(calls.some((c) => c.sql.startsWith('DELETE'))).toBe(false);
  });

  it('refuses to remove a household\'s last member', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM households WHERE id': HOUSEHOLD_ROW, 'FROM members WHERE household_id': { n: 1 } },
    });
    const result = await removeHouseholdMember(db, 'hh-1', 'mem-only');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('at least one member') });
    expect(calls.some((c) => c.sql.startsWith('DELETE'))).toBe(false);
  });

  it('removes a non-primary member when the household has more than one', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM households WHERE id': HOUSEHOLD_ROW, 'FROM members WHERE household_id': { n: 2 } },
    });
    const result = await removeHouseholdMember(db, 'hh-1', 'mem-other');
    expect(result).toEqual({ ok: true });
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM members'));
    expect(del?.args).toEqual(['mem-other', 'hh-1']);
  });
});

describe('setDirectoryVisibility', () => {
  it('updates the member\'s own visibility column', async () => {
    const { db, calls } = fakeD1();
    await setDirectoryVisibility(db, 'mem-1', 'hidden');
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect(update?.args).toEqual(['hidden', 'mem-1']);
  });
});

describe('leaveClub', () => {
  it('stamps households.left_at, only when not already set (idempotent)', async () => {
    const { db, calls } = fakeD1();
    await leaveClub(db, 'hh-1');
    const update = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect(update?.sql).toContain('left_at IS NULL');
    expect(update?.args).toEqual(['hh-1']);
  });
});

describe('getHouseholdAddress', () => {
  it('reads the household\'s own address columns, camelCased', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM households WHERE id': { city: 'Anchorage', address_line1: '123 Main St', address_line2: null, state: 'AK', postal_code: '99501' },
      },
    });
    await expect(getHouseholdAddress(db, 'hh-1')).resolves.toEqual({
      addressLine1: '123 Main St',
      addressLine2: null,
      city: 'Anchorage',
      state: 'AK',
      postalCode: '99501',
    });
  });

  it('answers null for an unknown household', async () => {
    const { db } = fakeD1();
    await expect(getHouseholdAddress(db, 'hh-missing')).resolves.toBeNull();
  });
});

describe('updateHouseholdAddress', () => {
  const VALID_ADDRESS = { addressLine1: '123 Main St', addressLine2: 'Apt 2', state: 'AK', postalCode: '99501' };

  it('writes all four fields when every one validates', async () => {
    const { db, calls } = fakeD1();
    const result = await updateHouseholdAddress(db, 'hh-1', VALID_ADDRESS);
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect(update?.args).toEqual(['123 Main St', 'Apt 2', 'AK', '99501', 'hh-1']);
  });

  it('clears every field on empty input (all four are optional)', async () => {
    const { db, calls } = fakeD1();
    const result = await updateHouseholdAddress(db, 'hh-1', { addressLine1: '', addressLine2: '', state: '', postalCode: '' });
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect(update?.args).toEqual([null, null, null, null, 'hh-1']);
  });

  it('trims whitespace before writing', async () => {
    const { db, calls } = fakeD1();
    await updateHouseholdAddress(db, 'hh-1', { ...VALID_ADDRESS, addressLine1: '  123 Main St  ' });
    const update = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect((update?.args as unknown[])[0]).toBe('123 Main St');
  });

  it('refuses (writing nothing) on an over-length address line', async () => {
    const { db, calls } = fakeD1();
    const result = await updateHouseholdAddress(db, 'hh-1', { ...VALID_ADDRESS, addressLine1: 'x'.repeat(121) });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('120 characters') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('refuses an over-length state', async () => {
    const { db } = fakeD1();
    const result = await updateHouseholdAddress(db, 'hh-1', { ...VALID_ADDRESS, state: 'x'.repeat(41) });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('40 characters') });
  });

  it('refuses an over-length postal code', async () => {
    const { db } = fakeD1();
    const result = await updateHouseholdAddress(db, 'hh-1', { ...VALID_ADDRESS, postalCode: 'x'.repeat(13) });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('12 characters') });
  });
});
