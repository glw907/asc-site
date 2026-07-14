import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { ensureMember } from '$admin-club/lib/people';

describe('ensureMember', () => {
  it('returns an existing member/household id by email, writing nothing', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM members WHERE email': { id: 'mem-1', household_id: 'hh-1' } },
    });
    const result = await ensureMember(db, { name: 'Jamie Rivera', email: 'jamie@example.com' });
    expect(result).toEqual({ memberId: 'mem-1', householdId: 'hh-1', created: false });
    expect(calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('matches an existing row against the normalized (lowercased) email', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM members WHERE email': { id: 'mem-1', household_id: 'hh-1' } },
    });
    const result = await ensureMember(db, { name: 'Jamie Rivera', email: 'Jamie@Example.COM' });
    expect(result).toEqual({ memberId: 'mem-1', householdId: 'hh-1', created: false });
    const select = calls.find((c) => c.sql.startsWith('SELECT id, household_id'));
    expect(select?.args).toEqual(['jamie@example.com']);
  });

  it('never overwrites an existing member\'s name/phone, even when the call args differ', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM members WHERE email': { id: 'mem-1', household_id: 'hh-1' } },
    });
    await ensureMember(db, { name: 'A Different Name', email: 'jamie@example.com', phone: '+19075550000' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('creates a household then a member then sets the primary, all in one batch, for an unknown email', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    const result = await ensureMember(db, { name: 'Jamie Rivera', email: 'jamie@example.com', phone: '+19075551234' });
    expect(result.created).toBe(true);
    expect(result.memberId).toBeTruthy();
    expect(result.householdId).toBeTruthy();

    expect(calls).toHaveLength(4); // the pre-check SELECT, plus the 3-statement batch
    const householdInsert = calls.find((c) => c.sql.startsWith('INSERT INTO households'));
    expect(householdInsert?.args).toEqual([result.householdId, 'Jamie Rivera']);

    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(memberInsert?.args).toEqual([result.memberId, result.householdId, 'Jamie Rivera', 'jamie@example.com', '+19075551234']);

    const primaryUpdate = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect(primaryUpdate?.sql).toContain('primary_member_id');
    expect(primaryUpdate?.args).toEqual([result.memberId, result.householdId]);
  });

  it('stores a null phone when none is given', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    await ensureMember(db, { name: 'No Phone', email: 'nophone@example.com' });
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect((memberInsert?.args as unknown[])[4]).toBeNull();
  });

  it('lowercases the email for both the lookup and a fresh insert', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    const result = await ensureMember(db, { name: 'Jamie Rivera', email: 'Jamie@Example.COM' });
    const select = calls.find((c) => c.sql.startsWith('SELECT id, household_id'));
    expect(select?.args).toEqual(['jamie@example.com']);
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(memberInsert?.args).toEqual([result.memberId, result.householdId, 'Jamie Rivera', 'jamie@example.com', null]);
  });

  it('normalizes a messy phone number to E.164 on a fresh insert', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    await ensureMember(db, { name: 'Jamie Rivera', email: 'jamie@example.com', phone: '(907) 555-0100' });
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect((memberInsert?.args as unknown[])[4]).toBe('+19075550100');
  });

  it('stores an unparseable phone trimmed raw rather than refusing', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    await ensureMember(db, { name: 'Jamie Rivera', email: 'jamie@example.com', phone: '  call the office  ' });
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect((memberInsert?.args as unknown[])[4]).toBe('call the office');
  });

  it('recases an all-caps name on a fresh insert, for both the member and the household', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    const result = await ensureMember(db, { name: 'JOHN SMITH', email: 'john@example.com' });
    const householdInsert = calls.find((c) => c.sql.startsWith('INSERT INTO households'));
    expect(householdInsert?.args).toEqual([result.householdId, 'John Smith']);
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect((memberInsert?.args as unknown[])[2]).toBe('John Smith');
  });

  it('passes an already-clean name, email, and phone through byte-identical', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': null } });
    const result = await ensureMember(db, { name: 'Jamie Rivera', email: 'jamie@example.com', phone: '+19075551234' });
    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members'));
    expect(memberInsert?.args).toEqual([result.memberId, result.householdId, 'Jamie Rivera', 'jamie@example.com', '+19075551234']);
  });
});
