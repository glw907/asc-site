import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RowRefusedError,
  deriveDirectoryVisibility,
  deriveTier,
  normalizePhoneE164,
  parseMwCsv,
  parseMwDateToIso,
  planImport,
  transformRecord,
} from '../../scripts/import/mw-members.mjs';

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'mw-export-synthetic.csv',
);

function loadFixture() {
  return parseMwCsv(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('parseMwCsv', () => {
  it('parses the synthetic fixture into 8 header-mapped records', () => {
    const records = loadFixture();
    expect(records).toHaveLength(8);
    expect(records[0]['Account Name']).toBe('Fam Oneington');
    expect(records[0].Email).toBe('fam.one@example.com');
  });
});

describe('deriveTier', () => {
  const context = { accountId: 'a1', accountName: 'Test', email: 'test@example.com' };

  it('maps Family to family', () => {
    expect(deriveTier({ Family: 'Family', Single: '', 'Young adult': '', ...context })).toBe('family');
  });

  it('maps Single to individual', () => {
    expect(deriveTier({ Family: '', Single: 'Single', 'Young adult': '', ...context })).toBe('individual');
  });

  it('maps Young adult to young-adult', () => {
    expect(deriveTier({ Family: '', Single: '', 'Young adult': 'Young adult', ...context })).toBe('young-adult');
  });

  it('refuses a row with two tier flags set', () => {
    expect(() => deriveTier({ Family: 'Family', Single: 'Single', 'Young adult': '', ...context })).toThrow(RowRefusedError);
  });

  it('refuses a row with no tier flag set', () => {
    expect(() => deriveTier({ Family: '', Single: '', 'Young adult': '', ...context })).toThrow(RowRefusedError);
  });
});

describe('deriveDirectoryVisibility', () => {
  it('is visible by default', () => {
    expect(deriveDirectoryVisibility({ 'Do not list in directory': '', 'Do not show street address in profile': '' })).toBe('visible');
  });

  it('is partial when a per-field suppression column is set', () => {
    expect(deriveDirectoryVisibility({ 'Do not list in directory': '', 'Do not show street address in profile': 'Y' })).toBe('partial');
  });

  it('is hidden when Do not list in directory is set, even alongside a suppression flag', () => {
    expect(deriveDirectoryVisibility({ 'Do not list in directory': 'Y', 'Do not show street address in profile': 'Y' })).toBe('hidden');
  });
});

describe('normalizePhoneE164', () => {
  const context = { accountId: 'a1', accountName: 'Test', email: 'test@example.com' };

  it.each([
    ['907-555-0101', '+19075550101'],
    ['9075550102', '+19075550102'],
    ['+1 (907) 555-0103', '+19075550103'],
    ['1 907 555 0106', '+19075550106'],
    ['(907)555-0107', '+19075550107'],
    ['907 555 0108', '+19075550108'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizePhoneE164(raw, context)).toBe(expected);
  });

  it('refuses an unrecognized digit count', () => {
    expect(() => normalizePhoneE164('555-0101', context)).toThrow(RowRefusedError);
  });
});

describe('parseMwDateToIso', () => {
  const context = { accountId: 'a1', accountName: 'Test', email: 'test@example.com' };

  it('parses "Mon D, YYYY" to a civil-date ISO string', () => {
    expect(parseMwDateToIso('Jul 8, 2027', context)).toBe('2027-07-08');
    expect(parseMwDateToIso('Apr 16, 2026', context)).toBe('2026-04-16');
  });

  it('refuses an unrecognized date format', () => {
    expect(() => parseMwDateToIso('2027-07-08', context)).toThrow(RowRefusedError);
  });
});

describe('transformRecord + planImport, against the synthetic fixture', () => {
  it('creates 6 rows, refuses 2 (the two-flag row and the duplicate email), and tallies recurring billing', () => {
    const plan = planImport(loadFixture(), new Set());
    expect(plan.toCreate).toHaveLength(6);
    expect(plan.skippedExisting).toHaveLength(0);
    expect(plan.refusals).toHaveLength(2);
    expect(plan.refusals.map((r) => r.reason)).toEqual([
      expect.stringContaining('multiple tier flags set'),
      'duplicate email within csv (first occurrence imported)',
    ]);
    expect(plan.recurringEmails).toEqual(['sing.two@example.com', 'young.eight@example.com']);
  });

  it('keeps the first occurrence of a duplicate email, not a later one', () => {
    const plan = planImport(loadFixture(), new Set());
    const created = plan.toCreate.find((r) => r.email === 'fam.one@example.com');
    expect(created?.memberName).toBe('Fam Oneington');
  });

  it('tallies the tier and visibility distributions across the 6 created rows', () => {
    const plan = planImport(loadFixture(), new Set());
    const tiers = plan.toCreate.map((r) => r.tier).sort();
    expect(tiers).toEqual(['family', 'family', 'individual', 'individual', 'young-adult', 'young-adult']);
    const visibilities = plan.toCreate.map((r) => r.directoryVisibility).sort();
    expect(visibilities).toEqual(['hidden', 'partial', 'partial', 'visible', 'visible', 'visible']);
  });

  it('skips a row already present (idempotent re-run), still detecting its billing method', () => {
    const plan = planImport(loadFixture(), new Set(['fam.one@example.com']));
    expect(plan.toCreate).toHaveLength(5);
    expect(plan.skippedExisting).toHaveLength(1);
    expect(plan.skippedExisting[0].email).toBe('fam.one@example.com');
  });

  it('snapshots the published tier price onto each created membership row', () => {
    const plan = planImport(loadFixture(), new Set());
    for (const row of plan.toCreate) {
      const expected = { individual: 250, family: 500, 'young-adult': 100 }[row.tier];
      expect(row.pricePaid).toBe(expected);
    }
  });

  it('transforms a single record end to end', () => {
    const records = loadFixture();
    const row = transformRecord(records[0]);
    expect(row).toMatchObject({
      accountId: 'acct-001',
      email: 'fam.one@example.com',
      householdName: 'Fam Oneington',
      city: 'Anchorage',
      memberName: 'Fam Oneington',
      phone: '+19075550101',
      tier: 'family',
      pricePaid: 500,
      paidAt: '2026-04-16',
      directoryVisibility: 'visible',
      billingMethod: 'One-time',
    });
  });
});
