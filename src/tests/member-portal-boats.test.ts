import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { addBoat, listHouseholdBoatsGroupedByOwner, listMemberBoats, removeBoat, updateBoat } from '$member-portal/lib/boats';

describe('listMemberBoats', () => {
  it('reads a member\'s own boats, camelCased', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM boats WHERE member_id': [
          { id: 'boat-1', member_id: 'mem-1', name: 'Dionysus', model: 'Buccaneer 18', sail_number: '123', kept_on: 'mooring' },
        ],
      },
    });
    await expect(listMemberBoats(db, 'mem-1')).resolves.toEqual([
      { id: 'boat-1', memberId: 'mem-1', name: 'Dionysus', model: 'Buccaneer 18', sailNumber: '123', keptOn: 'mooring' },
    ]);
  });
});

describe('listHouseholdBoatsGroupedByOwner', () => {
  it('groups boats by owning member, preserving each owner\'s own order', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM boats b JOIN members m': [
          { id: 'boat-1', member_id: 'mem-1', name: 'Dionysus', model: 'Laser', sail_number: null, kept_on: 'trailer', owner_name: 'Alice Scratch' },
          { id: 'boat-2', member_id: 'mem-2', name: null, model: 'Buccaneer 18', sail_number: null, kept_on: 'mooring', owner_name: 'Zed Scratch' },
          { id: 'boat-3', member_id: 'mem-1', name: 'Spirit', model: 'Other model', sail_number: null, kept_on: 'trailer', owner_name: 'Alice Scratch' },
        ],
      },
    });
    const groups = await listHouseholdBoatsGroupedByOwner(db, 'hh-1');
    expect(groups.map((g) => g.ownerId)).toEqual(['mem-1', 'mem-2']);
    expect(groups[0].ownerName).toBe('Alice Scratch');
    expect(groups[0].boats.map((b) => b.id)).toEqual(['boat-1', 'boat-3']);
    expect(groups[1].boats).toEqual([
      { id: 'boat-2', memberId: 'mem-2', name: null, model: 'Buccaneer 18', sailNumber: null, keptOn: 'mooring' },
    ]);
  });

  it('answers an empty array for a household with no boats', async () => {
    const { db } = fakeD1();
    await expect(listHouseholdBoatsGroupedByOwner(db, 'hh-1')).resolves.toEqual([]);
  });
});

const VALID_INPUT = { name: 'Dionysus', modelPicker: 'Laser', otherModel: '', sailNumber: '123', keptOn: 'trailer' };

describe('addBoat', () => {
  it('inserts a boat with a picker model resolved verbatim', async () => {
    const { db, calls } = fakeD1();
    const result = await addBoat(db, 'mem-1', VALID_INPUT);
    expect(result).toEqual({ id: expect.any(String) });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO boats'));
    expect(insert?.args).toEqual([(result as { id: string }).id, 'mem-1', 'Dionysus', 'Laser', '123', 'trailer']);
  });

  it('resolves "Other" to the typed model', async () => {
    const { db, calls } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, modelPicker: 'Other', otherModel: 'Hobie 16' });
    expect(result).toEqual({ id: expect.any(String) });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO boats'));
    expect((insert?.args as unknown[])[3]).toBe('Hobie 16');
  });

  it('stores a blank sail number as null', async () => {
    const { db, calls } = fakeD1();
    await addBoat(db, 'mem-1', { ...VALID_INPUT, sailNumber: '  ' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO boats'));
    expect((insert?.args as unknown[])[4]).toBeNull();
  });

  it('refuses (writing nothing) on a blank name', async () => {
    const { db, calls } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, name: '   ' });
    expect(result).toEqual({ error: expect.stringContaining('boat name') });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('refuses "Other" with no typed model', async () => {
    const { db, calls } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, modelPicker: 'Other', otherModel: '   ' });
    expect(result).toEqual({ error: expect.stringContaining('model') });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('refuses an unrecognized model picker value', async () => {
    const { db } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, modelPicker: 'Catamaran' });
    expect(result).toEqual({ error: expect.stringContaining('model') });
  });

  it('refuses an invalid kept_on value', async () => {
    const { db } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, keptOn: 'in-the-yard' });
    expect(result).toEqual({ error: expect.stringContaining('kept') });
  });

  it('refuses a name over the length limit', async () => {
    const { db } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, name: 'x'.repeat(81) });
    expect(result).toEqual({ error: expect.stringContaining('80 characters') });
  });

  it('refuses an over-length typed "Other" model', async () => {
    const { db } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, modelPicker: 'Other', otherModel: 'x'.repeat(81) });
    expect(result).toEqual({ error: expect.stringContaining('80 characters') });
  });

  it('refuses an over-length sail number', async () => {
    const { db } = fakeD1();
    const result = await addBoat(db, 'mem-1', { ...VALID_INPUT, sailNumber: 'x'.repeat(21) });
    expect(result).toEqual({ error: expect.stringContaining('20 characters') });
  });
});

describe('updateBoat', () => {
  it('updates a boat scoped to its owning member', async () => {
    const { db, calls } = fakeD1({ runResults: { 'UPDATE boats': { changes: 1 } } });
    const result = await updateBoat(db, 'mem-1', 'boat-1', VALID_INPUT);
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE boats'));
    expect(update?.args).toEqual(['Dionysus', 'Laser', '123', 'trailer', 'boat-1', 'mem-1']);
  });

  it('refuses a boat that is not the member\'s own (zero rows changed)', async () => {
    const { db } = fakeD1({ runResults: { 'UPDATE boats': { changes: 0 } } });
    const result = await updateBoat(db, 'mem-1', 'boat-owned-by-someone-else', VALID_INPUT);
    expect(result).toEqual({ error: expect.stringContaining('No such boat') });
  });

  it('validates before writing, the same as addBoat', async () => {
    const { db, calls } = fakeD1();
    const result = await updateBoat(db, 'mem-1', 'boat-1', { ...VALID_INPUT, name: '' });
    expect(result).toEqual({ error: expect.stringContaining('boat name') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });
});

describe('removeBoat', () => {
  it('deletes a boat scoped to its owning member', async () => {
    const { db, calls } = fakeD1({ runResults: { 'DELETE FROM boats': { changes: 1 } } });
    const result = await removeBoat(db, 'mem-1', 'boat-1');
    expect(result).toEqual({ ok: true });
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM boats'));
    expect(del?.args).toEqual(['boat-1', 'mem-1']);
  });

  it('refuses a boat that is not the member\'s own', async () => {
    const { db } = fakeD1({ runResults: { 'DELETE FROM boats': { changes: 0 } } });
    const result = await removeBoat(db, 'mem-1', 'boat-owned-by-someone-else');
    expect(result).toEqual({ error: expect.stringContaining('No such boat') });
  });
});
