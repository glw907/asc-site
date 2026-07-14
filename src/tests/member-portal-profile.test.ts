import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { updateProfile, validatePhone } from '$member-portal/lib/profile';

describe('validatePhone', () => {
  it('accepts a well-formed E.164 number unchanged', () => {
    expect(validatePhone('+19075551234')).toEqual({ ok: true, value: '+19075551234' });
  });

  it('accepts an empty string as "no phone"', () => {
    expect(validatePhone('  ')).toEqual({ ok: true, value: null });
  });

  it('normalizes a bare 10-digit number missing the country code', () => {
    expect(validatePhone('9075551234')).toEqual({ ok: true, value: '+19075551234' });
  });

  it('normalizes a formatted number to E.164', () => {
    expect(validatePhone('(907) 555-1234')).toEqual({ ok: true, value: '+19075551234' });
  });

  it('refuses an unparseable phone rather than storing it raw', () => {
    expect(validatePhone('call the office')).toEqual({ error: expect.stringContaining('phone number') });
  });
});

describe('updateProfile', () => {
  const VALID = { email: 'member@example.com', phone: '+19075551234', birthdate: '1990-05-01' };

  it('writes all three fields when every one validates', async () => {
    const { db, calls } = fakeD1();
    const result = await updateProfile(db, 'mem-1', VALID);
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect(update?.args).toEqual(['member@example.com', '+19075551234', '1990-05-01', 'mem-1']);
  });

  it('normalizes a messy phone number to E.164 before writing', async () => {
    const { db, calls } = fakeD1();
    const result = await updateProfile(db, 'mem-1', { ...VALID, phone: '(907) 555-1234' });
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect((update?.args as unknown[])[1]).toBe('+19075551234');
  });

  it('refuses (writing nothing) on an unparseable phone number before touching the database', async () => {
    const { db, calls } = fakeD1();
    const result = await updateProfile(db, 'mem-1', { ...VALID, phone: 'call the office' });
    expect(result).toEqual({ error: expect.stringContaining('phone number') });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('lowercases an uppercase email before writing', async () => {
    const { db, calls } = fakeD1();
    const result = await updateProfile(db, 'mem-1', { ...VALID, email: 'MEMBER@EXAMPLE.COM' });
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect((update?.args as unknown[])[0]).toBe('member@example.com');
  });

  it('passes an already-clean email and phone through byte-identical', async () => {
    const { db, calls } = fakeD1();
    const result = await updateProfile(db, 'mem-1', VALID);
    expect(result).toEqual({ ok: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect(update?.args).toEqual(['member@example.com', '+19075551234', '1990-05-01', 'mem-1']);
  });

  it('refuses on a bad email', async () => {
    const { db } = fakeD1();
    const result = await updateProfile(db, 'mem-1', { ...VALID, email: 'not-an-email' });
    expect(result).toEqual({ error: expect.stringContaining('email') });
  });

  it('refuses on a bad birthdate', async () => {
    const { db } = fakeD1();
    const result = await updateProfile(db, 'mem-1', { ...VALID, birthdate: 'not-a-date' });
    expect(result).toEqual({ error: expect.stringContaining('date') });
  });

  it('clears email/phone/birthdate on empty input (all three are optional)', async () => {
    const { db, calls } = fakeD1();
    await updateProfile(db, 'mem-1', { email: '', phone: '', birthdate: '' });
    const update = calls.find((c) => c.sql.startsWith('UPDATE members'));
    expect(update?.args).toEqual([null, null, null, 'mem-1']);
  });

  it('turns a UNIQUE(email) collision into a plain-words refusal, not a 500', async () => {
    const { db } = fakeD1();
    db.prepare = (sql: string) => {
      const stmt = {
        sql,
        bind: () => stmt,
        run: () => Promise.reject(new Error('UNIQUE constraint failed: members.email: SQLITE_CONSTRAINT')),
        first: async () => null,
        all: async () => ({ results: [], success: true, meta: {} }),
      };
      return stmt as unknown as ReturnType<typeof db.prepare>;
    };
    const result = await updateProfile(db, 'mem-1', VALID);
    expect(result).toEqual({ error: expect.stringContaining('already on file') });
  });
});
