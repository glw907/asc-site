import { describe, expect, it, vi } from 'vitest';
import { getRolloverPreview, runSeasonRollover, SeasonMismatchError } from '../admin-club/lib/rollover';
import { fakeD1 } from './_fake-d1';

describe('getRolloverPreview', () => {
  it('reads the current season and counts what falls out of currency', async () => {
    const { db } = fakeD1({
      firstResults: {
        "key = 'current_season'": { value: '2026' },
        'FROM classes': { n: 3 },
        'FROM class_waitlist': { n: 7 },
      },
    });
    const preview = await getRolloverPreview(db);
    expect(preview).toEqual({
      currentSeason: 2026,
      nextSeason: 2027,
      classesFallingOutOfCurrency: 3,
      waitlistFallingOutOfCurrency: 7,
    });
  });

  it('falls back to the current UTC year when the current_season row is missing', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM classes': { n: 0 }, 'FROM class_waitlist': { n: 0 } } });
    const preview = await getRolloverPreview(db);
    expect(preview.currentSeason).toBe(new Date().getUTCFullYear());
  });
});

describe('runSeasonRollover', () => {
  const currentSeasonFixture = {
    "key = 'current_season'": { value: '2026' },
    'FROM classes': { n: 2 },
    'FROM class_waitlist': { n: 5 },
  };

  it('refuses a typed year that is not exactly currentSeason + 1 (the type-to-confirm gate IS the forward-only check)', async () => {
    const { db, calls } = fakeD1({ firstResults: currentSeasonFixture });
    for (const badYear of ['2026', '2028', '2025', 'not-a-year', '']) {
      await expect(runSeasonRollover(db, { typedYear: badYear, confirmedBy: 'owner@example.com' })).rejects.toThrow(
        SeasonMismatchError,
      );
    }
    // No write of any kind happened for any of the refused attempts.
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') || c.sql.startsWith('INSERT INTO audit_log'))).toBe(
      false,
    );
  });

  it('advances the season and returns the preview counts on a correctly typed year', async () => {
    const { db } = fakeD1({ firstResults: currentSeasonFixture });
    const result = await runSeasonRollover(db, { typedYear: '2027', confirmedBy: 'owner@example.com' });
    expect(result).toEqual({ nextSeason: 2027, classesFallingOutOfCurrency: 2, waitlistFallingOutOfCurrency: 5 });
  });

  it('trims whitespace around the typed year', async () => {
    const { db } = fakeD1({ firstResults: currentSeasonFixture });
    const result = await runSeasonRollover(db, { typedYear: '  2027  ', confirmedBy: 'owner@example.com' });
    expect(result.nextSeason).toBe(2027);
  });

  it('writes the settings row and its audit row in one atomic db.batch, both stamped with the acting owner', async () => {
    const { db, calls } = fakeD1({ firstResults: currentSeasonFixture });
    const batchSpy = vi.spyOn(db, 'batch');
    await runSeasonRollover(db, { typedYear: '2027', confirmedBy: 'owner@example.com' });

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(2);

    const settingsWrite = calls.find((c) => c.sql.startsWith('UPDATE settings'));
    expect(settingsWrite?.args[0]).toBe('2027');
    expect(settingsWrite?.args[1]).toBe('owner@example.com');

    const auditWrite = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(auditWrite?.args[0]).toBe('owner@example.com');
    expect(auditWrite?.args[1]).toBe('season-rollover');
    expect(auditWrite?.args[2]).toBe('season');
    expect(auditWrite?.args[3]).toBe('2027');
    expect(String(auditWrite?.args[4])).toContain('2026 -> 2027');
    expect(String(auditWrite?.args[4])).toContain('2 classes');
    expect(String(auditWrite?.args[4])).toContain('5 waitlist');
  });

  it('never issues a single statement against asset_waitlist or memberships (the two tables a season boundary means nothing to)', async () => {
    const { db, calls } = fakeD1({ firstResults: currentSeasonFixture });
    await runSeasonRollover(db, { typedYear: '2027', confirmedBy: 'owner@example.com' });
    expect(calls.some((c) => c.sql.includes('asset_waitlist'))).toBe(false);
    expect(calls.some((c) => c.sql.includes('memberships'))).toBe(false);
  });

  it('never issues a write against classes or class_waitlist themselves (creation, not a wipe)', async () => {
    const { db, calls } = fakeD1({ firstResults: currentSeasonFixture });
    await runSeasonRollover(db, { typedYear: '2027', confirmedBy: 'owner@example.com' });
    const mutatesClasses = calls.some(
      (c) => /^(UPDATE|DELETE|INSERT)/.test(c.sql) && (c.sql.includes(' classes ') || c.sql.includes(' class_waitlist ')),
    );
    expect(mutatesClasses).toBe(false);
  });
});
