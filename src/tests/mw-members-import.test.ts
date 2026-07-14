import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_CLASS_MAP,
  MEMBERSHIP_TIER_OVERRIDES,
  RowRefusedError,
  buildEnrollmentInsertStatement,
  buildPhase2CreateStatements,
  deriveDirectoryVisibility,
  deriveMembershipSeason,
  deriveMembershipTier,
  formatReport,
  matchAttendeeToMember,
  parseAttendeeFilename,
  parseAttendeeGroups,
  parseMoneyToInt,
  parseMwCsv,
  parseMwDateToIso,
  planEnrollmentsFromAccountingOnly,
  planEnrollmentsFromFile,
  planHistoricalClasses,
  planMemberships,
  planMwImport,
  planPhase6EnrollmentsFromFiles,
  planPrimaryRow,
  planSubMemberRow,
  preprocessAccounting,
  realSlugForIdBase,
  sqlInt,
  validateAttendeeFile,
} from '../../scripts/import/mw-members.mjs';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadCsv(name: string) {
  return parseMwCsv(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

const CTX = { accountId: 'a1', accountName: 'Test', email: 'test@example.com' };

describe('parseMwCsv', () => {
  it('parses the synthetic fixture into 8 header-mapped records', () => {
    const records = loadCsv('mw-export-synthetic.csv');
    expect(records).toHaveLength(8);
    expect(records[0]['Account Name']).toBe('Fam Oneington');
    expect(records[0].Email).toBe('fam.one@example.com');
  });
});

describe('parseMwDateToIso', () => {
  it('parses "Mon D, YYYY" to a civil-date ISO string', () => {
    expect(parseMwDateToIso('Jul 8, 2027', CTX)).toBe('2027-07-08');
    expect(parseMwDateToIso('Apr 16, 2026', CTX)).toBe('2026-04-16');
  });

  it('refuses an unrecognized date format', () => {
    expect(() => parseMwDateToIso('2027-07-08', CTX)).toThrow(RowRefusedError);
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

describe('parseMoneyToInt', () => {
  it('parses a plain integer string', () => {
    expect(parseMoneyToInt('100', CTX, 'x')).toBe(100);
  });

  it('strips a leading currency symbol', () => {
    expect(parseMoneyToInt('$100', CTX, 'x')).toBe(100);
  });

  it('strips thousands commas', () => {
    expect(parseMoneyToInt('1,200', CTX, 'x')).toBe(1200);
  });

  it('strips both a currency symbol and thousands commas', () => {
    expect(parseMoneyToInt('$1,200', CTX, 'x')).toBe(1200);
  });

  it('refuses a genuinely non-numeric cell', () => {
    expect(() => parseMoneyToInt('n/a', CTX, 'x')).toThrow(RowRefusedError);
  });

  it('refuses a non-integer (fractional) value', () => {
    expect(() => parseMoneyToInt('99.5', CTX, 'x')).toThrow(RowRefusedError);
  });
});

describe('sqlInt', () => {
  it('renders a finite integer as its own string', () => {
    expect(sqlInt(100)).toBe('100');
    expect(sqlInt(0)).toBe('0');
  });

  it('refuses NaN, so no code path can emit the bare token NaN into a statement', () => {
    expect(() => sqlInt(Number.NaN)).toThrow();
  });

  it('refuses a non-integer value', () => {
    expect(() => sqlInt(1.5)).toThrow();
  });
});

function acctRow(overrides: Record<string, string>): Record<string, string> {
  return {
    Date: 'Jan 1, 2024',
    Name: 'Test',
    'Membership Sub-Total': '0',
    'Event Sub-Total': '0',
    'Donation Sub-Total': '0',
    'Transaction Total': '0',
    'Transaction Type': 'Membership',
    Reference: '',
    Items: '',
    'Payment ID': '',
    'Account ID': 'acct-x',
    'Renewal Date After Transaction': '',
    ...overrides,
  };
}

describe('preprocessAccounting', () => {
  it('drops Voided rows regardless of type, reporting the count', () => {
    const rows = [acctRow({ Items: 'Voided', 'Transaction Total': '0' }), acctRow({ 'Transaction Total': '100' })];
    const result = preprocessAccounting(rows);
    expect(result.voidedCount).toBe(1);
    expect(result.netRows).toHaveLength(1);
  });

  it('nets a negative row against its matching prior positive (same account/type/reference/amount)', () => {
    const rows = [
      acctRow({ Date: 'Jan 1, 2024', 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '100', 'Account ID': 'acct-x' }),
      acctRow({ Date: 'Jan 5, 2024', 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '-100', 'Account ID': 'acct-x' }),
    ];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(0);
    expect(result.nettedCount).toBe(1);
    expect(result.nettedPairs).toEqual([
      expect.objectContaining({ accountId: 'acct-x', type: 'Event', amount: '100', positiveDate: 'Jan 1, 2024', negativeDate: 'Jan 5, 2024' }),
    ]);
    expect(result.refusals).toHaveLength(0);
  });

  it('refuses an unmatched refund', () => {
    const rows = [acctRow({ 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '-100' })];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ reason: 'unmatched refund' })]);
  });

  it('nets a same-day refund listed BEFORE its purchase in the csv (positives sort first on a tied date)', () => {
    const rows = [
      acctRow({ Date: 'Jan 1, 2024', 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '-100', 'Account ID': 'acct-x' }),
      acctRow({ Date: 'Jan 1, 2024', 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '100', 'Account ID': 'acct-x' }),
    ];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(0);
    expect(result.nettedCount).toBe(1);
    expect(result.refusals).toHaveLength(0);
  });

  it('reports donations, never importing them', () => {
    const rows = [acctRow({ 'Transaction Type': 'Donation', 'Transaction Total': '50' })];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(0);
    expect(result.donationReports).toHaveLength(1);
  });

  it('refuses an Event row with an empty Account ID', () => {
    const rows = [acctRow({ 'Transaction Type': 'Event', Reference: 'Event: X', 'Transaction Total': '100', 'Account ID': '' })];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ reason: 'event row missing account id' })]);
  });

  it('matches a refund to the most recent prior positive when multiple share the same key', () => {
    const rows = [
      acctRow({ Date: 'Jan 1, 2024', 'Transaction Type': 'Membership', 'Transaction Total': '250', 'Account ID': 'acct-x' }),
      acctRow({ Date: 'Feb 1, 2024', 'Transaction Type': 'Membership', 'Transaction Total': '250', 'Account ID': 'acct-x' }),
      acctRow({ Date: 'Mar 1, 2024', 'Transaction Type': 'Membership', 'Transaction Total': '-250', 'Account ID': 'acct-x' }),
    ];
    const result = preprocessAccounting(rows);
    expect(result.netRows).toHaveLength(1);
    expect(result.netRows[0].Date).toBe('Jan 1, 2024');
  });
});

describe('deriveMembershipTier', () => {
  it.each([
    ['Single - One-time', 'individual'],
    ['Single membership - One-time', 'individual'],
    ['Family - One-time', 'family'],
    ['Family membership - One-time, Mooring', 'family'],
    ['Young adult - One-time', 'young-adult'],
    ['Young adult membership - One-time', 'young-adult'],
  ])('maps %s to %s', (items, tier) => {
    expect(deriveMembershipTier(items, CTX).tier).toBe(tier);
  });

  it('maps Youth membership to young-adult with mwTier=Youth provenance', () => {
    const result = deriveMembershipTier('Youth membership - One-time', CTX);
    expect(result.tier).toBe('young-adult');
    expect(result.mwTier).toBe('Youth');
  });

  it('refuses a row naming two tiers', () => {
    expect(() => deriveMembershipTier('Single membership - One-time, Family membership - One-time', CTX)).toThrow(RowRefusedError);
  });

  it('refuses a row with no recognized tier', () => {
    expect(() => deriveMembershipTier('Mooring - One-time', CTX)).toThrow(RowRefusedError);
  });

  it('carries the real 667e724fa1a5ecb053071dc3 -> family override (Geoff, 2026-07-13)', () => {
    expect(MEMBERSHIP_TIER_OVERRIDES['667e724fa1a5ecb053071dc3']).toBe('family');
  });

  it('applies a per-account override for a two-tier row instead of refusing', () => {
    const ctx = { accountId: '667e724fa1a5ecb053071dc3', accountName: 'Test', email: '' };
    const items = 'Single membership - One-time, Family membership - One-time';
    const result = deriveMembershipTier(items, ctx);
    expect(result.tier).toBe('family');
    expect(result.tierOverride).toEqual({ tier: 'family', items });
  });

  it('still refuses a two-tier row for an account with no override', () => {
    const items = 'Single membership - One-time, Family membership - One-time';
    expect(() => deriveMembershipTier(items, { ...CTX, accountId: 'acct-no-override' })).toThrow(RowRefusedError);
  });

  it('leaves tierOverride null for a normal single-tier row', () => {
    expect(deriveMembershipTier('Single membership - One-time', CTX).tierOverride).toBeNull();
  });
});

describe('deriveMembershipSeason', () => {
  it('derives season as year(Renewal Date After Transaction) - 1', () => {
    expect(deriveMembershipSeason({ Date: 'Apr 1, 2024', 'Renewal Date After Transaction': 'Apr 1, 2025' }, CTX)).toBe(2024);
  });

  it('falls back to year(Date) when Renewal Date After Transaction is blank', () => {
    expect(deriveMembershipSeason({ Date: 'Apr 1, 2024', 'Renewal Date After Transaction': '' }, CTX)).toBe(2024);
  });
});

describe('planPrimaryRow', () => {
  it('creates a new primary when no existing match, normalizing name/email/phone', () => {
    const record = { 'Account ID': 'acct-new', 'Account Name': 'NEW household', 'First Name': 'jerry', 'Last Name': 'edward', Email: 'Jerry@Example.com', Phone: '907-555-0100', 'Address (City)': 'Palmer' };
    const result = planPrimaryRow(record, null, null);
    expect(result.kind).toBe('create');
    if (result.kind === 'create') {
      expect(result.row.memberName).toBe('Jerry Edward');
      expect(result.row.email).toBe('jerry@example.com');
      expect(result.row.phone).toBe('+19075550100');
      expect(result.row.householdName).toBe('New Household');
    }
  });

  it('refuses a new primary with an unparseable phone', () => {
    const record = { 'Account ID': 'acct-bad', 'Account Name': 'Bad', 'First Name': 'A', 'Last Name': 'B', Email: 'a@example.com', Phone: '555-0101' };
    const result = planPrimaryRow(record, null, null);
    expect(result.kind).toBe('refuse');
  });

  it('leaves a blank phone as NULL rather than refusing', () => {
    const record = { 'Account ID': 'acct-new', 'Account Name': 'New household', 'First Name': 'Jerry', 'Last Name': 'Edward', Email: 'jerry@example.com', Phone: '' };
    const result = planPrimaryRow(record, null, null);
    expect(result.kind).toBe('create');
    if (result.kind === 'create') expect(result.row.phone).toBeNull();
  });

  it('refuses a new primary whose email another new primary already claimed earlier in this run', () => {
    const record = { 'Account ID': 'acct-new2', 'Account Name': 'Second household', 'First Name': 'X', 'Last Name': 'Y', Email: 'shared@example.com' };
    const result = planPrimaryRow(record, null, null, true);
    expect(result.kind).toBe('refuse');
    if (result.kind === 'refuse') expect(result.reason).toMatch(/already claimed/);
  });

  it('does not refuse on an unclaimed email even with the emailAlreadyClaimed check present', () => {
    const record = { 'Account ID': 'acct-new3', 'Account Name': 'Third household', 'First Name': 'X', 'Last Name': 'Y', Email: 'unclaimed@example.com' };
    const result = planPrimaryRow(record, null, null, false);
    expect(result.kind).toBe('create');
  });

  it('backfills mw_account_id and recases the name for an existing match', () => {
    const record = { 'Account ID': 'acct-existing', 'Account Name': 'jerry household', 'First Name': 'JERRY', 'Last Name': 'EDWARD' };
    const existingMatch = { id: 'mem-1', householdId: 'hh-1', name: 'JERRY EDWARD', email: 'jerry@example.com', mwAccountId: null };
    const existingHousehold = { id: 'hh-1', name: 'JERRY HOUSEHOLD', city: null, primaryMemberId: 'mem-1' };
    const result = planPrimaryRow(record, existingMatch, existingHousehold);
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') {
      expect(result.memberChanges.name).toEqual({ from: 'JERRY EDWARD', to: 'Jerry Edward' });
      expect(result.memberChanges.mw_account_id).toEqual({ from: null, to: 'acct-existing' });
    }
  });

  it('plans no changes for an already-normalized, already-backfilled match (idempotent)', () => {
    const record = { 'Account ID': 'acct-existing', 'Account Name': 'Jerry household', 'First Name': 'Jerry', 'Last Name': 'Edward' };
    const existingMatch = { id: 'mem-1', householdId: 'hh-1', name: 'Jerry Edward', email: 'jerry@example.com', mwAccountId: 'acct-existing' };
    const existingHousehold = { id: 'hh-1', name: 'Jerry Household', city: null, primaryMemberId: 'mem-1' };
    const result = planPrimaryRow(record, existingMatch, existingHousehold);
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') {
      expect(result.memberChanges).toEqual({});
      expect(result.householdChanges).toEqual({});
    }
  });
});

describe('planSubMemberRow', () => {
  it('refuses a non-person row (Position/relation = Dog)', () => {
    const result = planSubMemberRow({ 'Position/relation': 'Dog', 'First Name': 'Rex', 'Last Name': '', 'Account ID': 'acct-dog', 'Parent Account ID': 'acct-parent' }, 'hh-parent', false);
    expect(result.kind).toBe('refuse');
    if (result.kind === 'refuse') expect(result.reason).toMatch(/Dog/);
  });

  it('refuses when the parent household cannot be resolved', () => {
    const result = planSubMemberRow({ 'First Name': 'Ben', 'Last Name': 'Alpha', 'Account ID': 'acct-ben', 'Parent Account ID': 'acct-unknown' }, undefined, false);
    expect(result.kind).toBe('refuse');
    if (result.kind === 'refuse') expect(result.reason).toMatch(/parent account/);
  });

  it('stores NULL, noted, when the sub-member email is already claimed', () => {
    const result = planSubMemberRow({ 'First Name': 'Ben', 'Last Name': 'Alpha', Email: 'shared@example.com', 'Account ID': 'acct-ben', 'Parent Account ID': 'acct-parent' }, 'hh-parent', true);
    expect(result.kind).toBe('create');
    if (result.kind === 'create') {
      expect(result.row.email).toBeNull();
      expect(result.row.emailNote).toMatch(/claimed/);
    }
  });

  it('creates a sub-member with a normalized name; relation carried only as provenance', () => {
    const result = planSubMemberRow({ 'Position/relation': 'son', 'First Name': 'BEN', 'Last Name': 'alpha', 'Account ID': 'acct-ben', 'Parent Account ID': 'acct-parent' }, 'hh-parent', false);
    expect(result.kind).toBe('create');
    if (result.kind === 'create') {
      expect(result.row.name).toBe('Ben Alpha');
      expect(result.row.relation).toBe('son');
      expect(result.row.householdId).toBe('hh-parent');
    }
  });

  it('refuses an unparseable phone', () => {
    const result = planSubMemberRow({ 'First Name': 'Ben', 'Last Name': 'Alpha', Phone: '555-0101', 'Account ID': 'acct-ben', 'Parent Account ID': 'acct-parent' }, 'hh-parent', false);
    expect(result.kind).toBe('refuse');
  });

  it('leaves a blank phone as NULL rather than refusing', () => {
    const result = planSubMemberRow({ 'First Name': 'Ben', 'Last Name': 'Alpha', Phone: '', 'Account ID': 'acct-ben', 'Parent Account ID': 'acct-parent' }, 'hh-parent', false);
    expect(result.kind).toBe('create');
    if (result.kind === 'create') expect(result.row.phone).toBeNull();
  });
});

describe('HISTORICAL_CLASS_MAP + planHistoricalClasses', () => {
  it('mints a missing historical class instance, using the real slug and a season-suffixed id', () => {
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'acct-a1' }];
    const result = planHistoricalClasses(netEventRows, new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ id: '1st_adult_teen_intro_2024', season: 2024, slug: 'adult-intro-class-1', track: 'adult-teen', fee: 100, capacity: 10 });
  });

  it('skips a class instance already in the database (by season, slug)', () => {
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'acct-a1' }];
    const classByKey = new Map([['2024:adult-intro-class-1', { id: 'existing', season: 2024, slug: 'adult-intro-class-1', fee: 100, track: 'adult-teen' as const }]]);
    const result = planHistoricalClasses(netEventRows, classByKey);
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  it('never re-mints an already-existing 2026 class instance (the F1 regression)', () => {
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jun 18 2026, 1:00pm AKDT)', 'Account ID': 'acct-a1' }];
    const classByKey = new Map([['2026:adult-intro-class-1', { id: '1st_adult_teen_intro', season: 2026, slug: 'adult-intro-class-1', fee: 0, track: 'adult-teen' as const }]]);
    const result = planHistoricalClasses(netEventRows, classByKey);
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  it('refuses (never inserts) a mint whose id already belongs to a different existing row, even when its (season, slug) key is free', () => {
    // A pathological classByKey shape: an existing row's id happens to equal what this run would
    // compute for the 2024 mint, but filed under a DIFFERENT (season, slug) key -- the hard
    // invariant catches this even though the routine (season, slug) check alone would not.
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'acct-a1' }];
    const classByKey = new Map([['2024:some-other-slug', { id: '1st_adult_teen_intro_2024', season: 2024, slug: 'some-other-slug', fee: 100, track: 'adult-teen' as const }]]);
    const result = planHistoricalClasses(netEventRows, classByKey);
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ reason: expect.stringContaining('1st_adult_teen_intro_2024') })]);
  });

  it('folds the 2024 "2st" typo reference into the same real slug as its correctly-spelled sibling', () => {
    const netEventRows = [
      { Reference: 'Event: 2nd Adult/Teen Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)', 'Account ID': 'acct-a1' },
      { Reference: 'Event: 2st Adult/Teen Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)', 'Account ID': 'acct-a2' },
    ];
    const result = planHistoricalClasses(netEventRows, new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].slug).toBe('adult-intro-class-2');
    expect(result.toInsert[0].id).toBe('2nd_adult_teen_intro_2024');
  });

  it('refuses an unmapped event reference, once per distinct reference', () => {
    const netEventRows = [
      { Reference: 'Event: Unknown Class (Foo)', 'Account ID': 'acct-a1' },
      { Reference: 'Event: Unknown Class (Foo)', 'Account ID': 'acct-a2' },
    ];
    const result = planHistoricalClasses(netEventRows, new Map());
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toHaveLength(1);
  });

  it('mints exactly 10 rows for the real 2024/2025 historical seasons (5 class types x 2 seasons), skipping the 4 already-existing 2026 rows', () => {
    const netEventRows = Object.entries(HISTORICAL_CLASS_MAP).map(([reference], i) => ({ Reference: reference, 'Account ID': `acct-${i}` }));
    const classByKey = new Map([
      ['2026:adult-intro-class-1', { id: '1st_adult_teen_intro', season: 2026, slug: 'adult-intro-class-1', fee: 0, track: 'adult-teen' as const }],
      ['2026:youth-intro-class-1', { id: '1st_youth_intro', season: 2026, slug: 'youth-intro-class-1', fee: 0, track: 'youth' as const }],
      ['2026:adult-intro-class-2', { id: '2nd_adult_teen_intro', season: 2026, slug: 'adult-intro-class-2', fee: 0, track: 'adult-teen' as const }],
      ['2026:youth-intro-class-2', { id: '2nd_youth_intro', season: 2026, slug: 'youth-intro-class-2', fee: 0, track: 'youth' as const }],
    ]);
    const result = planHistoricalClasses(netEventRows, classByKey);
    expect(result.toInsert).toHaveLength(10);
    expect(result.refusals).toHaveLength(0);
  });

  it('carries every real 2024/2025/2026 event reference the accounting export names (15 entries)', () => {
    expect(Object.keys(HISTORICAL_CLASS_MAP)).toHaveLength(15);
  });
});

describe('parseAttendeeFilename', () => {
  it('derives season and idBase', () => {
    expect(parseAttendeeFilename('2024-1st_adult_teen_intro.csv')).toEqual({ season: 2024, idBase: '1st_adult_teen_intro' });
  });

  it('returns null for a non-matching filename', () => {
    expect(parseAttendeeFilename('not-a-match.csv')).toBeNull();
  });
});

describe('parseAttendeeGroups', () => {
  it('groups a Primary=Y buyer row with its following attendee rows', () => {
    const records = [
      { Primary: 'Y', 'Account ID': 'a1', 'First Name': 'Buyer' },
      { Primary: '', 'Account ID': 'a1', 'First Name': 'Kid1' },
      { Primary: '', 'Account ID': 'a1', 'First Name': 'Kid2' },
      { Primary: 'Y', 'Account ID': 'a2', 'First Name': 'Solo' },
      { Primary: '', 'Account ID': 'a2', 'First Name': 'Solo' },
    ];
    const groups = parseAttendeeGroups(records);
    expect(groups).toHaveLength(2);
    expect(groups[0].attendeeRows).toHaveLength(2);
    expect(groups[0].accountId).toBe('a1');
    expect(groups[1].attendeeRows).toHaveLength(1);
  });
});

describe('validateAttendeeFile', () => {
  it('validates a file whose buyer accounts match the filename-derived class, resolving to the real slug', () => {
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1' }];
    const records = [{ Primary: 'Y', 'Account ID': 'a1' }];
    const result = validateAttendeeFile('2024-1st_adult_teen_intro.csv', records, netEventRows);
    expect(result).toEqual({ valid: true, season: 2024, slug: 'adult-intro-class-1' });
  });

  it('refuses a file whose buyer accounts overlap a different class more than the filename-derived one', () => {
    const netEventRows = [
      { Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1' },
      { Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1' },
      { Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a2' },
    ];
    const records = [{ Primary: 'Y', 'Account ID': 'a1' }, { Primary: 'Y', 'Account ID': 'a2' }];
    const result = validateAttendeeFile('2024-1st_adult_teen_intro.csv', records, netEventRows);
    expect(result.valid).toBe(false);
  });

  it('refuses a filename that does not match <season>-<idBase>.csv', () => {
    const result = validateAttendeeFile('not-a-match.csv', [], []);
    expect(result.valid).toBe(false);
  });

  it('refuses a filename whose idBase names no known class instance for that season', () => {
    const result = validateAttendeeFile('2024-not_a_real_class.csv', [{ Primary: 'Y', 'Account ID': 'a1' }], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toMatch(/no class instance known/);
  });

  // ---- F3: (account, total) PAIR overlap breaks a bare-account tie between sibling classes ----

  it("resolves a bare-account TIE between sibling classes using each purchase's own amount", () => {
    // Account a1 bought BOTH the 1st and 2nd youth intro classes in 2024 (same buyer, different
    // amounts) -- bare-account overlap would tie 1v1 for both classes; the roster's own Total
    // (150, matching the 2nd class's purchase) breaks the tie correctly.
    const netEventRows = [
      { Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100' },
      { Reference: 'Event: 2st Youth Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '150' },
    ];
    const records = [{ Primary: 'Y', 'Account ID': 'a1', Total: '150' }];
    const result = validateAttendeeFile('2024-2nd_youth_intro.csv', records, netEventRows);
    expect(result).toEqual({ valid: true, season: 2024, slug: 'youth-intro-class-2' });
  });

  it('still refuses when even the (account, total) pairs tie', () => {
    const netEventRows = [
      { Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100' },
      { Reference: 'Event: 2st Youth Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100' },
    ];
    const records = [{ Primary: 'Y', 'Account ID': 'a1', Total: '100' }];
    const result = validateAttendeeFile('2024-2nd_youth_intro.csv', records, netEventRows);
    expect(result.valid).toBe(false);
  });

  it('excludes a non-numeric Total/Event Sub-Total from the pair set rather than crashing', () => {
    const netEventRows = [{ Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': 'n/a' }];
    const records = [{ Primary: 'Y', 'Account ID': 'a1', Total: 'n/a' }];
    expect(() => validateAttendeeFile('2024-1st_adult_teen_intro.csv', records, netEventRows)).not.toThrow();
    const result = validateAttendeeFile('2024-1st_adult_teen_intro.csv', records, netEventRows);
    expect(result.valid).toBe(false);
  });
});

describe('realSlugForIdBase', () => {
  it('translates a filename idBase + season to the real classes.slug', () => {
    expect(realSlugForIdBase(2024, '1st_adult_teen_intro')).toBe('adult-intro-class-1');
    expect(realSlugForIdBase(2026, '2nd_youth_intro')).toBe('youth-intro-class-2');
  });

  it('returns null for an unrecognized season/idBase pair', () => {
    expect(realSlugForIdBase(2024, 'not_a_real_class')).toBeNull();
  });
});

describe('matchAttendeeToMember', () => {
  const household = [
    { id: 'm1', householdId: 'hh1', name: 'Anna Alpha' },
    { id: 'm2', householdId: 'hh1', name: 'Ben Alpha' },
  ];
  const allMembers = [...household, { id: 'm3', householdId: 'hh2', name: 'Unique Person' }];

  it('matches by normalized full name within the household', () => {
    const result = matchAttendeeToMember({ 'First Name': 'anna', 'Last Name': 'ALPHA' }, household, allMembers, household[0]);
    expect(result?.member.id).toBe('m1');
    expect(result?.level).toBe('household-full-name');
  });

  it('matches by first-name + last-initial within the household when full name differs', () => {
    const result = matchAttendeeToMember({ 'First Name': 'Ben', 'Last Name': 'A' }, household, allMembers, household[0]);
    expect(result?.member.id).toBe('m2');
    expect(result?.level).toBe('household-first-last-initial');
  });

  it('falls back to a club-wide unique full-name match outside the household', () => {
    const result = matchAttendeeToMember({ 'First Name': 'Unique', 'Last Name': 'Person' }, household, allMembers, household[0]);
    expect(result?.member.id).toBe('m3');
    expect(result?.level).toBe('club-wide-unique-name');
  });

  it('falls back to the household primary, flagged approximate, when nothing matches', () => {
    const result = matchAttendeeToMember({ 'First Name': 'Nobody', 'Last Name': 'Known' }, household, allMembers, household[0]);
    expect(result?.member.id).toBe('m1');
    expect(result?.level).toBe('approximate');
  });

  it('returns null when there is no household primary to fall back to', () => {
    const result = matchAttendeeToMember({ 'First Name': 'Nobody', 'Last Name': 'Known' }, household, allMembers, null);
    expect(result).toBeNull();
  });
});

describe('planMemberships', () => {
  it('inserts a new membership row when none exists at (household, season)', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Apr 1, 2024', 'Payment ID': 'PAY-1', 'Renewal Date After Transaction': 'Apr 1, 2025' }];
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), new Map(), new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ householdId: 'hh-1', season: 2024, tier: 'individual', pricePaid: 250, stripeRef: 'PAY-1' });
  });

  it('strips a currency-formatted Membership Sub-Total before parsing (\'$1,200\' -> 1200)', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '$1,200', Date: 'Apr 1, 2024', 'Renewal Date After Transaction': 'Apr 1, 2025' }];
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), new Map(), new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].pricePaid).toBe(1200);
  });

  it('refuses a row whose Membership Sub-Total is not numeric, rather than emitting NaN', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': 'n/a', Date: 'Apr 1, 2024', 'Renewal Date After Transaction': 'Apr 1, 2025' }];
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), new Map(), new Map());
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
  });

  it('updates the existing row in place when the guard passes (stripe_ref null, paid_at = the members renewal date), rewriting its season', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Apr 5, 2026', 'Payment ID': 'PAY-2', 'Renewal Date After Transaction': 'Apr 5, 2027' }];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2026-04-16', stripeRef: null }]]]);
    const renewalDateByAccountId = new Map([['a1', '2026-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ membershipId: 'ms-1', season: 2026, tier: 'family', pricePaid: 500 });
    expect(result.toUpdate[0].before).toEqual({ season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2026-04-16', stripeRef: null });
  });

  it('is idempotent: a re-run whose existing row already matches the candidate (including season) plans nothing', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Apr 1, 2024', 'Payment ID': 'PAY-1', 'Renewal Date After Transaction': 'Apr 1, 2025' }];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2024, tier: 'individual', pricePaid: 250, paidAt: '2024-04-01', stripeRef: 'PAY-1' }]]]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, new Map());
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  it('refuses to overwrite when the guard fails (stripe_ref already set to something else)', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Apr 5, 2026', 'Renewal Date After Transaction': 'Apr 5, 2027' }];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2026-04-16', stripeRef: 'already-paid' }]]]);
    const renewalDateByAccountId = new Map([['a1', '2026-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
  });

  it('refuses to overwrite when paid_at no longer matches the members renewal date', () => {
    const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Apr 5, 2026', 'Renewal Date After Transaction': 'Apr 5, 2027' }];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2026-05-01', stripeRef: null }]]]);
    const renewalDateByAccountId = new Map([['a1', '2026-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);
    expect(result.refusals).toHaveLength(1);
  });

  it('keeps the later transaction on a same-household/season collision, reporting the earlier', () => {
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Feb 1, 2024', 'Renewal Date After Transaction': 'Feb 1, 2025' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Renewal Date After Transaction': 'Mar 1, 2025' },
    ];
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), new Map(), new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].tier).toBe('family');
    expect(result.collisions).toHaveLength(1);
  });

  it('refuses a row whose account has no known household', () => {
    const rows = [{ 'Account ID': 'unknown', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Apr 1, 2024', 'Renewal Date After Transaction': 'Apr 1, 2025' }];
    const result = planMemberships(rows, new Map(), new Map(), new Map());
    expect(result.refusals).toEqual([expect.objectContaining({ reason: 'no household found for membership account' })]);
  });

  it('plans a ruled two-tier row normally as family, keeping price_paid as the real Membership Sub-Total', () => {
    const rows = [{
      'Account ID': '667e724fa1a5ecb053071dc3', Name: 'A', Items: 'Single membership - One-time, Family membership - One-time',
      'Membership Sub-Total': '500', Date: 'Apr 1, 2024', 'Payment ID': 'PAY-1', 'Renewal Date After Transaction': 'Apr 1, 2025',
    }];
    const result = planMemberships(rows, new Map([['667e724fa1a5ecb053071dc3', 'hh-1']]), new Map(), new Map());
    expect(result.refusals).toHaveLength(0);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ tier: 'family', pricePaid: 500 });
    expect(result.toInsert[0].tierOverride).toEqual({ tier: 'family', items: 'Single membership - One-time, Family membership - One-time' });
  });

  it('still refuses a two-tier row for an account with no override', () => {
    const rows = [{
      'Account ID': 'acct-no-override', Name: 'A', Items: 'Single membership - One-time, Family membership - One-time',
      'Membership Sub-Total': '500', Date: 'Apr 1, 2024', 'Renewal Date After Transaction': 'Apr 1, 2025',
    }];
    const result = planMemberships(rows, new Map([['acct-no-override', 'hh-1']]), new Map(), new Map());
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'acct-no-override' })]);
  });

  // ---- F2: a household's single most-recent transaction updates in place (rewriting season);
  // every other transaction for that household inserts its own history row -------------------

  it("updates in place only the household's MOST RECENT transaction (by chronological order, not by computed season); an earlier transaction for a different season inserts", () => {
    // The existing row is the July-7 approximation: season 2026, stripe_ref null, paid_at = the
    // renewal date. The household's real transactions are an EARLIER one (Jan 2024, computes
    // season 2023) and a LATER one (Mar 2024, computes season 2025) -- the later one, despite
    // computing an "earlier-looking" season number than 2026, is the one that gets the update.
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jan 1, 2024', 'Payment ID': 'PAY-OLD', 'Renewal Date After Transaction': 'Jan 1, 2024' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Mar 1, 2026' },
    ];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-04-16', stripeRef: null }]]]);
    const renewalDateByAccountId = new Map([['a1', '2027-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ membershipId: 'ms-1', season: 2025, tier: 'family', pricePaid: 500, accountId: 'a1' });
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ season: 2023, tier: 'individual', pricePaid: 250 });
    expect(result.refusals).toHaveLength(0);
  });

  it("still inserts a household's other transactions when the guard fails for its most-recent one", () => {
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jan 1, 2024', 'Payment ID': 'PAY-OLD', 'Renewal Date After Transaction': 'Jan 1, 2024' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Mar 1, 2026' },
    ];
    // stripe_ref is already set on the existing row -- the guard fails, so the household's
    // latest transaction is refused, never inserted as a substitute; its OTHER (earlier)
    // transaction still inserts normally, unaffected.
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-04-16', stripeRef: 'already-paid' }]]]);
    const renewalDateByAccountId = new Map([['a1', '2027-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);

    expect(result.toUpdate).toHaveLength(0);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ season: 2023, tier: 'individual' });
    expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
  });

  it("does not vacate the existing row's season when the guard fails: a second transaction targeting that same (untouched) season conflicts, refused", () => {
    // The latest transaction computes a DIFFERENT season (2024) and its guard fails (stripe_ref
    // already set), so the existing row NEVER moves off season 2026 -- an earlier, non-latest
    // transaction that computes season 2026 (matching the still-occupied existing row) must
    // still see that season as occupied and refuse, not insert as if the slot were free (the
    // exact bug a naive "always vacate the old key whenever a different candidate is latest"
    // implementation would reintroduce).
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jan 1, 2024', 'Payment ID': 'PAY-OLD', 'Renewal Date After Transaction': 'Jan 1, 2027' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Mar 1, 2025' },
    ];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 999, paidAt: '2020-01-01', stripeRef: 'already-paid' }]]]);
    const renewalDateByAccountId = new Map([['a1', '2027-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);

    expect(result.toUpdate).toHaveLength(0);
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toHaveLength(2);
  });

  it('inserts a household transaction into its own (now-vacated) season slot after the update moves the existing row away from it', () => {
    // A household's LATEST transaction computes season 2024 (moving the existing row there);
    // an EARLIER transaction for the SAME household computes season 2026 -- exactly the season
    // the pre-existing row is CURRENTLY (mis)labeled. Since that row is moving to 2024, season
    // 2026 is free for the earlier transaction's own history row.
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jan 1, 2026', 'Payment ID': 'PAY-2026', 'Renewal Date After Transaction': 'Jan 1, 2027' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Mar 1, 2025' },
    ];
    const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-04-16', stripeRef: null }]]]);
    const renewalDateByAccountId = new Map([['a1', '2027-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ membershipId: 'ms-1', season: 2024, tier: 'family' });
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ season: 2026, tier: 'individual', pricePaid: 250, accountId: 'a1' });
    expect(result.refusals).toHaveLength(0);
  });

  it("leaves no stale approximation row: a re-run against the applied state (update moved, insert applied) plans nothing further", () => {
    const rows = [
      { 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jan 1, 2024', 'Payment ID': 'PAY-OLD', 'Renewal Date After Transaction': 'Jan 1, 2024' },
      { 'Account ID': 'a1', Name: 'A', Items: 'Family membership - One-time', 'Membership Sub-Total': '500', Date: 'Mar 1, 2024', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Mar 1, 2026' },
    ];
    // The state AFTER applying the first run's own plan: ms-1 now carries the LATEST
    // transaction's fields (season 2025), and a second row (ms-2) now carries the earlier
    // transaction's fields (season 2023) -- reconstructed exactly as the applied SQL would leave
    // asc-club.
    const existingByHousehold = new Map([
      ['hh-1', [
        { id: 'ms-1', householdId: 'hh-1', season: 2025, tier: 'family', pricePaid: 500, paidAt: '2024-03-01', stripeRef: 'PAY-NEW' },
        { id: 'ms-2', householdId: 'hh-1', season: 2023, tier: 'individual', pricePaid: 250, paidAt: '2024-01-01', stripeRef: 'PAY-OLD' },
      ]],
    ]);
    const renewalDateByAccountId = new Map([['a1', '2027-04-16']]);
    const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId);

    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  // ---- Phase-4 delete: a household whose net membership transactions all refund-netted to zero
  // (Geoff's ruling 2026-07-14, real account 69feba0db6d34e4a540dda1d) ------------------------

  describe('delete: zero net membership transactions after refund-netting', () => {
    const nettedPair = { accountId: 'a1', type: 'Membership', amount: '250', positiveDate: 'May 8, 2026', negativeDate: 'May 17, 2026' };

    it('plans exactly one delete for an import-shaped existing row', () => {
      const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-05-08', stripeRef: null }]]]);
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships([], new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId, [nettedPair]);
      expect(result.toDelete).toEqual([expect.objectContaining({ membershipId: 'ms-1', householdId: 'hh-1', accountId: 'a1' })]);
      expect(result.toDelete[0].reason).toMatch(/refund-netted to zero/);
      expect(result.toInsert).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.refusals).toHaveLength(0);
    });

    it('never deletes a non-import-shaped row (stripe_ref already set); reports it instead', () => {
      const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-05-08', stripeRef: 'PAY-REAL' }]]]);
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships([], new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId, [nettedPair]);
      expect(result.toDelete).toHaveLength(0);
      expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
      expect(result.refusals[0].reason).toMatch(/does not match the import-shaped guard; not deleted/);
    });

    it('never deletes a non-import-shaped row (paid_at no longer matches the renewal date); reports it instead', () => {
      const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2020-01-01', stripeRef: null }]]]);
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships([], new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId, [nettedPair]);
      expect(result.toDelete).toHaveLength(0);
      expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
    });

    it('leaves a household with no netted pair alone (no positive evidence, no delete)', () => {
      const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-05-08', stripeRef: null }]]]);
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships([], new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId, []);
      expect(result.toDelete).toHaveLength(0);
      expect(result.refusals).toHaveLength(0);
    });

    it('is idempotent: a re-run against the post-delete snapshot (the row no longer exists) plans nothing', () => {
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships([], new Map([['a1', 'hh-1']]), new Map(), renewalDateByAccountId, [nettedPair]);
      expect(result.toDelete).toHaveLength(0);
      expect(result.toInsert).toHaveLength(0);
      expect(result.toUpdate).toHaveLength(0);
      expect(result.refusals).toHaveLength(0);
    });

    it("a household with a real winning transaction is never delete-eligible, even carrying an unrelated netted pair", () => {
      const rows = [{ 'Account ID': 'a1', Name: 'A', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', Date: 'Jun 1, 2026', 'Payment ID': 'PAY-NEW', 'Renewal Date After Transaction': 'Jun 1, 2027' }];
      const existingByHousehold = new Map([['hh-1', [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-05-08', stripeRef: null }]]]);
      const renewalDateByAccountId = new Map([['a1', '2027-05-08']]);
      const result = planMemberships(rows, new Map([['a1', 'hh-1']]), existingByHousehold, renewalDateByAccountId, [nettedPair]);
      expect(result.toDelete).toHaveLength(0);
      expect(result.toUpdate.length + result.toInsert.length).toBeGreaterThan(0);
    });
  });
});

describe('planEnrollmentsFromFile', () => {
  const classIndex = new Map([['2024:adult-intro-class-1', { id: 'cls-1', fee: 100 }]]);
  const netEventRows = [
    { Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', 'Payment ID': 'PAY-1', Date: 'Apr 17, 2024' },
  ];
  const households = new Map([['hh-1', { id: 'hh-1', name: 'Alpha', city: null, primaryMemberId: 'm1' }]]);
  const allMembers = new Map([['m1', { id: 'm1', householdId: 'hh-1', name: 'Anna Alpha' }]]);
  const mwAccountIdToHouseholdId = new Map([['a1', 'hh-1']]);

  function file(records: Record<string, string>[]) {
    return { filename: '2024-1st_adult_teen_intro.csv', records };
  }

  it("enrolls the matched attendee, dividing the accounting subtotal over the group's seats", () => {
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), []);
    expect(result.fileRefused).toBe(false);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]).toMatchObject({ classId: 'cls-1', memberId: 'm1', accountId: 'a1', feePaid: 100, identity: 'household-full-name' });
  });

  it("uses the roster group's own Total, noted, when no accounting row matches (comped/manual add)", () => {
    // The file also carries Anna's normally-matched group (real data is a superset of
    // accounting), which is what lets the file validate at all -- a purely comped file would
    // have zero accounting overlap and be refused by name, same as any other mismatch.
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
      { Primary: 'Y', Date: 'May 1, 2024', 'Account ID': 'a2', 'First Name': 'Extra', 'Last Name': 'Buyer', Total: '0' },
      { Primary: '', Date: 'May 1, 2024', 'Account ID': 'a2', 'First Name': 'Extra', 'Last Name': 'Buyer' },
    ];
    const householdsBoth = new Map([
      ['hh-1', { id: 'hh-1', name: 'Alpha', city: null, primaryMemberId: 'm1' }],
      ['hh-2', { id: 'hh-2', name: 'Extra', city: null, primaryMemberId: 'm2' }],
    ]);
    const allMembersBoth = new Map([
      ['m1', { id: 'm1', householdId: 'hh-1', name: 'Anna Alpha' }],
      ['m2', { id: 'm2', householdId: 'hh-2', name: 'Extra Buyer' }],
    ]);
    const mwMap = new Map([
      ['a1', 'hh-1'],
      ['a2', 'hh-2'],
    ]);
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwMap, householdsBoth, allMembersBoth, new Map(), []);
    expect(result.fileRefused).toBe(false);
    const compedRow = result.toInsert.find((r) => r.memberId === 'm2');
    expect(compedRow?.feePaid).toBe(0);
    expect(result.notes).toEqual([expect.objectContaining({ accountId: 'a2' })]);
  });

  it('is idempotent: an already-imported exact pair plans nothing', () => {
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const enrollmentByPair = new Map([['cls-1:m1', { id: 'enr-1', classId: 'cls-1', memberId: 'm1', approximate: false }]]);
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, households, allMembers, enrollmentByPair, []);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
  });

  it('collapses a duplicate (class, member) pair within the same run to a skip', () => {
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), []);
    expect(result.toInsert).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('upgrades a previously-approximate enrollment in place once the true attendee resolves', () => {
    // A two-member household: Anna is the primary (the approximate placeholder from a prior
    // run); Ben is the true attendee this run's roster names.
    const twoMemberHouseholds = new Map([['hh-1', { id: 'hh-1', name: 'Alpha', city: null, primaryMemberId: 'm1' }]]);
    const twoMembers = new Map([
      ['m1', { id: 'm1', householdId: 'hh-1', name: 'Anna Alpha' }],
      ['m2', { id: 'm2', householdId: 'hh-1', name: 'Ben Alpha' }],
    ]);
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Ben', 'Last Name': 'Alpha' },
    ];
    const approxEnrollments = [{ id: 'enr-approx', classId: 'cls-1', memberId: 'm1', approximate: true }];
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, twoMemberHouseholds, twoMembers, new Map(), approxEnrollments);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ enrollmentId: 'enr-approx', fromMemberId: 'm1', toMemberId: 'm2' });
  });

  it('upgrades only the FIRST matching real attendee when an approximate enrollment could match either of two, and a re-run plans nothing', () => {
    const twoMemberHouseholds = new Map([['hh-1', { id: 'hh-1', name: 'Alpha', city: null, primaryMemberId: 'm1' }]]);
    const twoMembers = new Map([
      ['m1', { id: 'm1', householdId: 'hh-1', name: 'Anna Alpha' }],
      ['m2', { id: 'm2', householdId: 'hh-1', name: 'Ben Alpha' }],
    ]);
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Ben', 'Last Name': 'Alpha' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const approxEnrollments = [{ id: 'enr-approx', classId: 'cls-1', memberId: 'm1', approximate: true }];
    const result = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, twoMemberHouseholds, twoMembers, new Map(), approxEnrollments);

    // Exactly one update (the first real attendee, Ben, consumes the approximate placeholder)
    // and exactly one insert (the second real attendee, Anna, gets a fresh row) -- never two
    // updates racing to overwrite the same enrollment id.
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({ enrollmentId: 'enr-approx', toMemberId: 'm2' });
    expect(result.toInsert[0]).toMatchObject({ memberId: 'm1' });

    // A re-run against the state both writes would produce plans nothing further.
    const enrollmentByPair = new Map([
      ['cls-1:m2', { id: 'enr-approx', classId: 'cls-1', memberId: 'm2', approximate: false }],
      ['cls-1:m1', { id: 'enr-new', classId: 'cls-1', memberId: 'm1', approximate: false }],
    ]);
    const rerun = planEnrollmentsFromFile(file(records), classIndex, netEventRows, mwAccountIdToHouseholdId, twoMemberHouseholds, twoMembers, enrollmentByPair, approxEnrollments);
    expect(rerun.toInsert).toHaveLength(0);
    expect(rerun.toUpdate).toHaveLength(0);
  });

  it('leaves enrolledAt null when no attendee, buyer, or accounting row carries a usable date', () => {
    const noDateAccountingRows = [
      { Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', 'Payment ID': 'PAY-1' },
    ];
    const records: Record<string, string>[] = [
      { Primary: 'Y', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const result = planEnrollmentsFromFile(file(records), classIndex, noDateAccountingRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), []);
    expect(result.fileRefused).toBe(false);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].enrolledAt).toBeNull();
  });

  it("refuses a group whose Event Sub-Total is non-numeric rather than emitting NaN into feePaid", () => {
    // Two accounting rows for the same account+class: a GOOD one (whose amount matches the
    // file's own Total, so the file validates on its own pair) and a BAD one (non-numeric,
    // exercising the per-group money guard once matchingAccountingRows sums both rows).
    const badAccountingRows = [
      { Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', 'Payment ID': 'PAY-1', Date: 'Apr 17, 2024' },
      { Reference: 'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': 'n/a', 'Payment ID': 'PAY-2', Date: 'Apr 17, 2024' },
    ];
    const records: Record<string, string>[] = [
      { Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha', Total: '100', 'Payment ID': 'PAY-1' },
      { Primary: '', Date: 'Apr 17, 2024', 'Account ID': 'a1', 'First Name': 'Anna', 'Last Name': 'Alpha' },
    ];
    const result = planEnrollmentsFromFile(file(records), classIndex, badAccountingRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), []);
    expect(result.fileRefused).toBe(false);
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toEqual([expect.objectContaining({ accountId: 'a1' })]);
  });

  it('refuses the whole file when overlap validation fails, planning no enrollments from it', () => {
    const records = [{ Primary: 'Y', Date: 'Apr 17, 2024', 'Account ID': 'unrelated-account' }];
    const result = planEnrollmentsFromFile({ filename: '2024-1st_adult_teen_intro.csv', records }, classIndex, [], mwAccountIdToHouseholdId, households, allMembers, new Map(), []);
    expect(result.fileRefused).toBe(true);
    expect(result.toInsert).toHaveLength(0);
  });
});

describe('planPhase6EnrollmentsFromFiles (P1: two-round validation with claimed-class exclusion)', () => {
  // Mirrors the real 2025 youth-intro tie: 1st youth has FIVE $100 buyers (a1-a5), 2nd youth has
  // FOUR of the same buyers at the identical $100 -- 2nd youth's own file ties 4v4 against 1st
  // youth on (account,total) pairs alone, but 1st youth's own file validates decisively (5 > 4)
  // because of the fifth buyer 2nd youth never had. Round 2 excludes 1st youth (already
  // decisively claimed) from 2nd youth's comparison, resolving the tie.
  const classIndex = new Map([
    ['2025:youth-intro-class-1', { id: 'cls-1st-youth-2025', fee: 100 }],
    ['2025:youth-intro-class-2', { id: 'cls-2nd-youth-2025', fee: 100 }],
  ]);
  const allAccounts = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const netEventRows = [
    ...allAccounts.map((acct) => ({ Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)', 'Account ID': acct, 'Event Sub-Total': '100', Date: 'Jun 19, 2025' })),
    ...allAccounts.slice(0, 4).map((acct) => ({ Reference: 'Event: 2nd Youth Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)', 'Account ID': acct, 'Event Sub-Total': '100', Date: 'Jun 26, 2025' })),
  ];
  const households = new Map(allAccounts.map((acct, i) => [`hh-${i}`, { id: `hh-${i}`, name: `Household ${i}`, city: null, primaryMemberId: `m-${i}` }]));
  const allMembers = new Map(allAccounts.map((acct, i) => [`m-${i}`, { id: `m-${i}`, householdId: `hh-${i}`, name: `Person ${i}` }]));
  const mwAccountIdToHouseholdId = new Map(allAccounts.map((acct, i) => [acct, `hh-${i}`]));

  /** @param {string[]} accounts @param {string} filename @param {string} date */
  function attendeeFile(accounts: string[], filename: string, date: string) {
    return {
      filename,
      records: accounts.map((acct, i) => ({ Primary: 'Y', Date: date, 'Account ID': acct, 'First Name': 'Person', 'Last Name': `${allAccounts.indexOf(acct)}`, Total: '100' })),
    };
  }

  it('resolves the round-1 tie via round-2 claimed-class exclusion; both files validate', () => {
    const file1st = attendeeFile(allAccounts, '2025-1st_youth_intro.csv', 'Jun 19, 2025');
    const file2nd = attendeeFile(allAccounts.slice(0, 4), '2025-2nd_youth_intro.csv', 'Jun 26, 2025');

    // Sanity: round 1 alone (single-file validateAttendeeFile, no exclusions) really does tie.
    const bareRound1 = validateAttendeeFile(file2nd.filename, file2nd.records, netEventRows);
    expect(bareRound1.valid).toBe(false);

    const results = planPhase6EnrollmentsFromFiles(
      [file1st, file2nd], classIndex, netEventRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), [],
    );
    const first = results.find((r) => r.filename === file1st.filename);
    const second = results.find((r) => r.filename === file2nd.filename);
    expect(first?.fileRefused).toBe(false);
    expect(second?.fileRefused).toBe(false);
    expect(second?.toInsert.length).toBeGreaterThan(0);
  });

  it('a genuine tie that survives even round 2 (no third file to decisively claim either class) still refuses both', () => {
    const symmetricAccounts = ['a1', 'a2'];
    const symmetricNetEventRows = [
      ...symmetricAccounts.map((acct) => ({ Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)', 'Account ID': acct, 'Event Sub-Total': '100', Date: 'Jun 19, 2025' })),
      ...symmetricAccounts.map((acct) => ({ Reference: 'Event: 2nd Youth Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)', 'Account ID': acct, 'Event Sub-Total': '100', Date: 'Jun 26, 2025' })),
    ];
    const file1st = attendeeFile(symmetricAccounts, '2025-1st_youth_intro.csv', 'Jun 19, 2025');
    const file2nd = attendeeFile(symmetricAccounts, '2025-2nd_youth_intro.csv', 'Jun 26, 2025');
    const results = planPhase6EnrollmentsFromFiles(
      [file1st, file2nd], classIndex, symmetricNetEventRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), [],
    );
    expect(results.every((r) => r.fileRefused)).toBe(true);
  });

  it('refuses BOTH files when they end up claiming the identical class (a hard invariant, never keeps the first silently)', () => {
    // A pathological naming collision (the identical filename listed twice) -- both instances
    // should refuse rather than one winning arbitrarily.
    const file = attendeeFile(allAccounts, '2025-1st_youth_intro.csv', 'Jun 19, 2025');
    const results = planPhase6EnrollmentsFromFiles(
      [file, { ...file }], classIndex, netEventRows, mwAccountIdToHouseholdId, households, allMembers, new Map(), [],
    );
    expect(results.every((r) => r.fileRefused)).toBe(true);
    expect(results.every((r) => r.reason?.includes('claimed by more than one attendee file'))).toBe(true);
  });
});

describe('planEnrollmentsFromAccountingOnly', () => {
  const households = new Map([['hh-1', { id: 'hh-1', name: 'Alpha', city: null, primaryMemberId: 'm1' }]]);
  const mwAccountIdToHouseholdId = new Map([['a1', 'hh-1']]);

  it('enrolls the household primary for a single-seat adult-teen purchase, not flagged approximate', () => {
    const netEventRows = [{ Reference: 'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', Date: 'Apr 1, 2024', 'Payment ID': 'PAY-1' }];
    const cls = { id: 'cls-intermediate', fee: 100, track: 'adult-teen' as const };
    const result = planEnrollmentsFromAccountingOnly('2024:intermediate', cls, netEventRows, mwAccountIdToHouseholdId, households, new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].identity).not.toBe('approximate');
    expect(result.toInsert[0].feePaid).toBe(100);
    expect(result.toInsert[0].accountId).toBe('a1');
  });

  it('flags a multi-seat purchase approximate', () => {
    const netEventRows = [{ Reference: 'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '200', Date: 'Apr 1, 2024' }];
    const cls = { id: 'cls-intermediate', fee: 100, track: 'adult-teen' as const };
    const result = planEnrollmentsFromAccountingOnly('2024:intermediate', cls, netEventRows, mwAccountIdToHouseholdId, households, new Map());
    expect(result.toInsert[0].identity).toBe('approximate');
    expect(result.notes).toHaveLength(1);
  });

  it('flags a youth-track purchase approximate even for a single seat', () => {
    const netEventRows = [{ Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', Date: 'Apr 1, 2024' }];
    const cls = { id: 'cls-youth', fee: 100, track: 'youth' as const };
    const result = planEnrollmentsFromAccountingOnly('2024:youth-intro-class-1', cls, netEventRows, mwAccountIdToHouseholdId, households, new Map());
    expect(result.toInsert[0].identity).toBe('approximate');
  });

  it('is idempotent against an existing enrollment pair', () => {
    const netEventRows = [{ Reference: 'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '100', Date: 'Apr 1, 2024' }];
    const cls = { id: 'cls-intermediate', fee: 100, track: 'adult-teen' as const };
    const enrollmentByPair = new Map([['cls-intermediate:m1', { id: 'enr-1', classId: 'cls-intermediate', memberId: 'm1', approximate: false }]]);
    const result = planEnrollmentsFromAccountingOnly('2024:intermediate', cls, netEventRows, mwAccountIdToHouseholdId, households, enrollmentByPair);
    expect(result.toInsert).toHaveLength(0);
  });

  it('refuses a row whose Event Sub-Total is not numeric, rather than emitting NaN', () => {
    const netEventRows = [{ Reference: 'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)', 'Account ID': 'a1', 'Event Sub-Total': 'n/a', Date: 'Apr 1, 2024' }];
    const cls = { id: 'cls-intermediate', fee: 100, track: 'adult-teen' as const };
    const result = planEnrollmentsFromAccountingOnly('2024:intermediate', cls, netEventRows, mwAccountIdToHouseholdId, households, new Map());
    expect(result.toInsert).toHaveLength(0);
    expect(result.refusals).toHaveLength(1);
  });

  it("strips a currency-formatted Event Sub-Total before parsing ('$1,200' -> 1200)", () => {
    const netEventRows = [{ Reference: 'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)', 'Account ID': 'a1', 'Event Sub-Total': '$1,200', Date: 'Apr 1, 2024' }];
    const cls = { id: 'cls-intermediate', fee: 100, track: 'adult-teen' as const };
    const result = planEnrollmentsFromAccountingOnly('2024:intermediate', cls, netEventRows, mwAccountIdToHouseholdId, households, new Map());
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].feePaid).toBe(1200);
  });
});

describe('buildEnrollmentInsertStatement', () => {
  it('omits the enrolled_at column when enrolledAt is null, letting the schema default apply', () => {
    const sql = buildEnrollmentInsertStatement('enr-1', { classId: 'cls-1', memberId: 'm1', feePaid: 100, enrolledAt: null, stripeRef: null });
    expect(sql).toContain('INSERT INTO class_enrollments (id, class_id, member_id, fee_paid, stripe_ref)');
    expect(sql).not.toMatch(/enrolled_at/);
  });

  it('includes the enrolled_at column, with its value, when a date is present', () => {
    const sql = buildEnrollmentInsertStatement('enr-1', { classId: 'cls-1', memberId: 'm1', feePaid: 100, enrolledAt: '2024-07-11', stripeRef: null });
    expect(sql).toContain('INSERT INTO class_enrollments (id, class_id, member_id, enrolled_at, fee_paid, stripe_ref)');
    expect(sql).toContain("'2024-07-11'");
  });

  it('refuses to embed a non-finite fee_paid, so no code path can emit NaN into a statement', () => {
    expect(() => buildEnrollmentInsertStatement('enr-1', { classId: 'cls-1', memberId: 'm1', feePaid: Number.NaN, enrolledAt: null, stripeRef: null })).toThrow();
  });
});

describe('buildPhase2CreateStatements', () => {
  it('inlines mw_account_id into the members INSERT rather than a trailing UPDATE', () => {
    const c = {
      accountId: 'acct-x',
      householdId: 'hh-1',
      memberId: 'mem-1',
      row: { accountId: 'acct-x', householdName: 'X Household', city: null, memberName: 'X Y', email: null, phone: null, directoryVisibility: 'visible' as const },
    };
    const statements = buildPhase2CreateStatements(c);
    const memberInsert = statements.find((s: string) => s.startsWith('INSERT INTO members'));
    expect(memberInsert).toContain('mw_account_id');
    expect(memberInsert).toContain("'acct-x'");
    expect(statements.some((s: string) => s.startsWith('UPDATE members'))).toBe(false);
    expect(statements.some((s: string) => s.startsWith('UPDATE households'))).toBe(true);
  });
});

describe('formatReport', () => {
  // A hand-built plan exercising every requirement the F4 dry-run/applied-run report promises.
  const plan = {
    accounting: {
      voidedCount: 2,
      nettedCount: 1,
      nettedPairs: [{ accountId: 'acct-x', type: 'Event', amount: '100', positiveDate: 'Jan 1, 2024', negativeDate: 'Jan 5, 2024' }],
      donationReports: [{ date: 'Jan 2, 2024', accountId: 'acct-d', amount: '50' }],
      refusals: [{ reason: 'unmatched refund', accountId: 'acct-y', date: 'Feb 1, 2024', amount: '-75' }],
    },
    phase1Updates: [{ entity: 'member' as const, id: 'mem-1', accountId: 'acct-1', changes: { name: { from: 'JERRY EDWARD', to: 'Jerry Edward' } } }],
    phase2Creates: [],
    phase2Refusals: [{ accountId: 'acct-2', reason: 'email sha***@example.com already claimed by another new primary earlier in this run' }],
    phase3Creates: [],
    phase3Refusals: [{ accountId: 'acct-3', reason: 'non-person row (Position/relation = Dog)' }],
    phase4: {
      toInsert: [],
      toUpdate: [
        {
          householdId: 'hh-1', season: 2025, tier: 'family' as const, mwTier: null, tierOverride: null, pricePaid: 500, paidAt: '2024-03-01', stripeRef: 'PAY-NEW', accountId: 'acct-1',
          membershipId: 'ms-1', before: { season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-04-16', stripeRef: null },
        },
      ],
      toDelete: [
        { membershipId: 'ms-2', householdId: 'hh-9', accountId: 'acct-9', reason: "household's only net membership transaction(s) refund-netted to zero (Membership account=acct-9 amount=250, purchased May 8, 2026, refunded May 17, 2026)" },
      ],
      refusals: [{ reason: 'existing membership row for household hh-2 does not match the import-shaped guard; not overwritten', accountId: 'acct-4' }],
      collisions: [{ reason: 'superseded by a later transaction for the same household/season', accountId: 'acct-5', season: 2024, supersededBy: 'acct-6' }],
    },
    phase5: {
      toInsert: [{ id: '1st_adult_teen_intro_2024', season: 2024, slug: 'adult-intro-class-1', name: '1st Adult/Teen Intro to Sailing Class', track: 'adult-teen' as const, startDate: '2024-07-11', fee: 100, capacity: 10 }],
      refusals: [],
    },
    phase6FileResults: [
      {
        fileRefused: false,
        filename: '2024-1st_adult_teen_intro.csv',
        toInsert: [
          { classId: 'cls-1', memberId: 'm1', accountId: 'acct-1', feePaid: 100, enrolledAt: '2024-07-11', stripeRef: null, identity: 'household-full-name' as const, detail: '' },
          { classId: 'cls-1', memberId: 'm2', accountId: 'acct-1', feePaid: 0, enrolledAt: '2024-07-11', stripeRef: null, identity: 'approximate' as const, detail: '' },
        ],
        toUpdate: [],
        skipped: [],
        refusals: [
          { reason: 'buyer account not found in any household', filename: '2024-1st_adult_teen_intro.csv', accountId: 'acct-7' },
          { reason: 'no member could be matched (household has no primary either)', filename: '2024-1st_adult_teen_intro.csv', accountId: 'acct-8' },
        ],
        notes: [{ reason: 'comped', filename: '2024-1st_adult_teen_intro.csv', accountId: 'acct-1' }],
      },
    ],
    phase6FallbackResults: [{ classKey: '2024:intermediate', toInsert: [], skipped: [], refusals: [], notes: [] }],
  };

  const report = formatReport(plan, 'mw-members-20260101T000000Z');

  it('lists every phase-1 field change (entity, id/account, field, before -> after)', () => {
    expect(report).toContain('[member] mem-1 (account acct-1): name: "JERRY EDWARD" -> "Jerry Edward"');
  });

  it("lists phase 4's refusal and collision lines and each update's before -> after", () => {
    expect(report).toContain('season 2026 -> 2025');
    expect(report).toContain('tier individual -> family');
    expect(report).toContain('price_paid 250 -> 500');
    expect(report).toContain('paid_at 2027-04-16 -> 2024-03-01');
    expect(report).toContain('stripe_ref null -> PAY-NEW');
    expect(report).toContain('existing membership row for household hh-2 does not match the import-shaped guard');
    expect(report).toContain('collision season=2024 account=acct-5 superseded_by=acct-6');
  });

  it('lists phase 4 deletes in their own report line', () => {
    expect(report).toContain('1 delete(s)');
    expect(report).toContain("delete household=hh-9 account=acct-9: household's only net membership transaction(s) refund-netted to zero");
  });

  it('lists each minted phase-5 class (id, season, slug, name, start_date)', () => {
    expect(report).toContain('mint id=1st_adult_teen_intro_2024 season=2024 slug=adult-intro-class-1 name="1st Adult/Teen Intro to Sailing Class" start_date=2024-07-11');
  });

  it('prints per-file phase-6 stats (match-level counts, comped-group count) and every identity=approximate enrollment', () => {
    expect(report).toContain('file 2024-1st_adult_teen_intro.csv: 2 insert(s) [household-full-name=1, household-first-last-initial=0, club-wide-unique-name=0, approximate=1], 0 update(s), 1 comped group(s), 2 refusal(s)');
    expect(report).toContain('identity=approximate enrollment(s) (1):');
    expect(report).toContain('class=cls-1 account=acct-1');
  });

  it("P3: prints each per-file enrollment refusal's reason (account + reason string)", () => {
    expect(report).toContain('refused: buyer account not found in any household account=acct-7');
    expect(report).toContain('refused: no member could be matched (household has no primary either) account=acct-8');
  });

  it("lists accounting pre-processing's netted pairs, donation rows, and its refusal", () => {
    expect(report).toContain('netted: Event account=acct-x amount=100 (purchased Jan 1, 2024, refunded Jan 5, 2024)');
    expect(report).toContain('donation (not imported): account=acct-d date=Jan 2, 2024 amount=50');
    expect(report).toContain('refused: unmatched refund (account=acct-y, date=Feb 1, 2024, amount=-75)');
  });

  it('never prints a raw email: an upstream-redacted refusal reason passes through unchanged', () => {
    expect(report).toContain('sha***@example.com');
    expect(report).not.toContain('shared@example.com');
  });

  it('includes the batch id and phase-2/phase-3 refusal reasons', () => {
    expect(report).toContain('mw-members-20260101T000000Z');
    expect(report).toContain('refused account=acct-2: email sha***@example.com already claimed');
    expect(report).toContain('refused account=acct-3: non-person row (Position/relation = Dog)');
  });
});

describe('planMwImport (integration)', () => {
  function baselineExisting() {
    return {
      members: [{ id: 'mem-carla-existing', householdId: 'hh-carla-existing', name: 'CARLA CHARLIE', email: 'carla@example.com', mwAccountId: null }],
      households: [{ id: 'hh-carla-existing', name: 'CHARLIE HOUSEHOLD', city: 'Wasilla', primaryMemberId: 'mem-carla-existing' }],
      memberships: [],
      classes: [],
      enrollments: [],
    };
  }

  function loadInput() {
    const memberRecords = loadCsv('mw-members-v2-synthetic.csv');
    const accountingRecords = loadCsv('mw-accounting-v2-synthetic.csv');
    const attendeeDir = path.join(FIXTURES_DIR, 'mw-attendees-v2');
    const attendeeFiles = readdirSync(attendeeDir).map((filename) => ({
      filename,
      records: parseMwCsv(readFileSync(path.join(attendeeDir, filename), 'utf8')),
    }));
    return { memberRecords, accountingRecords, attendeeFiles };
  }

  it('plans updates, creates, memberships, classes, and enrollments end to end', () => {
    const plan = planMwImport(loadInput(), baselineExisting());

    // Phase 1: Carla's name recases and her mw_account_id backfills.
    expect(plan.phase1Updates).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity: 'member', id: 'mem-carla-existing' })]),
    );

    // Phase 2: Anna is a brand-new primary.
    expect(plan.phase2Creates).toHaveLength(1);
    expect(plan.phase2Creates[0].row.memberName).toBe('Anna Alpha');

    // Phase 3: Ben (son) is created; Rex (Dog) is refused.
    expect(plan.phase3Creates).toHaveLength(1);
    expect(plan.phase3Creates[0].row.name).toBe('Ben Alpha');
    expect(plan.phase3Refusals).toEqual([expect.objectContaining({ reason: expect.stringContaining('Dog') })]);

    // Phase 4: Carla's membership was fully refunded (nets to nothing); Anna's nets to one row.
    expect(plan.phase4.toInsert).toHaveLength(1);
    expect(plan.phase4.toInsert[0]).toMatchObject({ tier: 'individual', pricePaid: 250, season: 2024 });

    // Phase 5: the one referenced 2024 class is minted, using the real slug.
    expect(plan.phase5.toInsert).toEqual([expect.objectContaining({ id: '1st_adult_teen_intro_2024', season: 2024, slug: 'adult-intro-class-1' })]);

    // Phase 6: Anna's roster file enrolls her.
    const inserts = plan.phase6FileResults.flatMap((r) => r.toInsert);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].feePaid).toBe(100);
  });

  it("is idempotent: re-running against the first plan's own resulting state creates and updates nothing", () => {
    const firstPlan = planMwImport(loadInput(), baselineExisting());

    const nextExisting = {
      members: [
        { id: 'mem-carla-existing', householdId: 'hh-carla-existing', name: 'Carla Charlie', email: 'carla@example.com', mwAccountId: 'acct-c1' },
        ...firstPlan.phase2Creates.map((c) => ({ id: c.memberId, householdId: c.householdId, name: c.row.memberName, email: c.row.email, mwAccountId: c.accountId })),
        ...firstPlan.phase3Creates.map((c) => ({ id: c.memberId, householdId: c.row.householdId, name: c.row.name, email: c.row.email, mwAccountId: c.accountId })),
      ],
      households: [
        { id: 'hh-carla-existing', name: 'Charlie Household', city: 'Wasilla', primaryMemberId: 'mem-carla-existing' },
        ...firstPlan.phase2Creates.map((c) => ({ id: c.householdId, name: c.row.householdName, city: c.row.city, primaryMemberId: c.memberId })),
      ],
      memberships: firstPlan.phase4.toInsert.map((m, i) => ({ id: `ms-${i}`, householdId: m.householdId, season: m.season, tier: m.tier, pricePaid: m.pricePaid, paidAt: m.paidAt, stripeRef: m.stripeRef })),
      classes: firstPlan.phase5.toInsert.map((c) => ({ id: c.id, season: c.season, slug: c.slug, fee: c.fee, track: c.track })),
      enrollments: firstPlan.phase6FileResults.flatMap((r) => r.toInsert).map((e, i) => ({ id: `enr-${i}`, classId: e.classId, memberId: e.memberId, approximate: e.identity === 'approximate' })),
    };

    const secondPlan = planMwImport(loadInput(), nextExisting);
    expect(secondPlan.phase1Updates).toHaveLength(0);
    expect(secondPlan.phase2Creates).toHaveLength(0);
    expect(secondPlan.phase3Creates).toHaveLength(0);
    expect(secondPlan.phase4.toInsert).toHaveLength(0);
    expect(secondPlan.phase4.toUpdate).toHaveLength(0);
    expect(secondPlan.phase5.toInsert).toHaveLength(0);
    const secondInserts = secondPlan.phase6FileResults.flatMap((r) => r.toInsert);
    const secondUpdates = secondPlan.phase6FileResults.flatMap((r) => r.toUpdate);
    expect(secondInserts).toHaveLength(0);
    expect(secondUpdates).toHaveLength(0);
  });

  it('dedupes two brand-new primaries sharing the same email within one run: one create, one refusal', () => {
    const memberRecords = [
      { 'Account ID': 'acct-first', 'Account Name': 'First Household', 'First Name': 'First', 'Last Name': 'Person', Email: 'shared@example.com' },
      { 'Account ID': 'acct-second', 'Account Name': 'Second Household', 'First Name': 'Second', 'Last Name': 'Person', Email: 'shared@example.com' },
    ];
    const plan = planMwImport({ memberRecords, accountingRecords: [], attendeeFiles: [] }, {
      members: [],
      households: [],
      memberships: [],
      classes: [],
      enrollments: [],
    });
    expect(plan.phase2Creates).toHaveLength(1);
    expect(plan.phase2Refusals).toEqual([expect.objectContaining({ accountId: 'acct-second' })]);
    expect(plan.phase2Refusals[0].reason).toMatch(/already claimed/);
  });

  it('P2: a refused file class still yields accounting-only enrollments (attemptedKeys never suppresses an unvalidated class)', () => {
    // Both accounts buy BOTH 2025 youth classes at the identical $100, and no third file exists
    // to decisively claim either one -- a genuine, unresolvable tie for both files (mirrors the
    // planPhase6EnrollmentsFromFiles "still refuses" case above). The accounting-only fallback
    // must still enroll both classes' household primaries even though every attendee file for
    // them stays refused.
    const existing = {
      members: [
        { id: 'm-a1', householdId: 'hh-a1', name: 'Anna A', email: null, mwAccountId: 'acct-a1' },
        { id: 'm-a2', householdId: 'hh-a2', name: 'Ben B', email: null, mwAccountId: 'acct-a2' },
      ],
      households: [
        { id: 'hh-a1', name: 'A Household', city: null, primaryMemberId: 'm-a1' },
        { id: 'hh-a2', name: 'B Household', city: null, primaryMemberId: 'm-a2' },
      ],
      memberships: [],
      classes: [],
      enrollments: [],
    };
    const accountingRecords = [
      acctRow({ Date: 'Jun 19, 2025', 'Transaction Type': 'Event', Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)', 'Event Sub-Total': '100', 'Transaction Total': '100', 'Account ID': 'acct-a1' }),
      acctRow({ Date: 'Jun 19, 2025', 'Transaction Type': 'Event', Reference: 'Event: 1st Youth Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)', 'Event Sub-Total': '100', 'Transaction Total': '100', 'Account ID': 'acct-a2' }),
      acctRow({ Date: 'Jun 26, 2025', 'Transaction Type': 'Event', Reference: 'Event: 2nd Youth Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)', 'Event Sub-Total': '100', 'Transaction Total': '100', 'Account ID': 'acct-a1' }),
      acctRow({ Date: 'Jun 26, 2025', 'Transaction Type': 'Event', Reference: 'Event: 2nd Youth Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)', 'Event Sub-Total': '100', 'Transaction Total': '100', 'Account ID': 'acct-a2' }),
    ];
    const attendeeFiles = [
      {
        filename: '2025-1st_youth_intro.csv',
        records: [
          { Primary: 'Y', Date: 'Jun 19, 2025', 'Account ID': 'acct-a1', 'First Name': 'Anna', 'Last Name': 'A', Total: '100' },
          { Primary: 'Y', Date: 'Jun 19, 2025', 'Account ID': 'acct-a2', 'First Name': 'Ben', 'Last Name': 'B', Total: '100' },
        ],
      },
      {
        filename: '2025-2nd_youth_intro.csv',
        records: [
          { Primary: 'Y', Date: 'Jun 26, 2025', 'Account ID': 'acct-a1', 'First Name': 'Anna', 'Last Name': 'A', Total: '100' },
          { Primary: 'Y', Date: 'Jun 26, 2025', 'Account ID': 'acct-a2', 'First Name': 'Ben', 'Last Name': 'B', Total: '100' },
        ],
      },
    ];

    const plan = planMwImport({ memberRecords: [], accountingRecords, attendeeFiles }, existing);

    expect(plan.phase6FileResults.every((r) => r.fileRefused)).toBe(true);
    expect(plan.phase6FallbackResults).toHaveLength(2);
    const fallbackInserts = plan.phase6FallbackResults.flatMap((r) => r.toInsert);
    expect(fallbackInserts.length).toBeGreaterThan(0);
    expect(fallbackInserts.every((row) => row.identity === 'approximate')).toBe(true);
  });

  it('plans a phase-4 delete end to end for a fully-refunded membership (mirrors the real 69feba0db6d34e4a540dda1d account)', () => {
    const existing = {
      members: [{ id: 'mem-1', householdId: 'hh-1', name: 'Refunded Household', email: null, mwAccountId: '69feba0db6d34e4a540dda1d' }],
      households: [{ id: 'hh-1', name: 'Refunded Household', city: null, primaryMemberId: 'mem-1' }],
      memberships: [{ id: 'ms-1', householdId: 'hh-1', season: 2026, tier: 'individual', pricePaid: 250, paidAt: '2027-05-08', stripeRef: null }],
      classes: [],
      enrollments: [],
    };
    const memberRecords = [{ 'Account ID': '69feba0db6d34e4a540dda1d', 'Account Name': 'Refunded Household', 'First Name': 'Ref', 'Last Name': 'Unded', 'Renewal Date': 'May 8, 2027' }];
    const accountingRecords = [
      acctRow({ Date: 'May 8, 2026', 'Transaction Type': 'Membership', Items: 'Single membership - One-time', 'Membership Sub-Total': '250', 'Transaction Total': '250', 'Account ID': '69feba0db6d34e4a540dda1d', 'Renewal Date After Transaction': 'May 8, 2027' }),
      acctRow({ Date: 'May 17, 2026', 'Transaction Type': 'Membership', Items: 'Single membership - One-time', 'Membership Sub-Total': '-250', 'Transaction Total': '-250', 'Account ID': '69feba0db6d34e4a540dda1d' }),
    ];

    const plan = planMwImport({ memberRecords, accountingRecords, attendeeFiles: [] }, existing);

    expect(plan.phase4.toDelete).toEqual([expect.objectContaining({ membershipId: 'ms-1', householdId: 'hh-1', accountId: '69feba0db6d34e4a540dda1d' })]);
    expect(plan.phase4.toInsert).toHaveLength(0);
    expect(plan.phase4.toUpdate).toHaveLength(0);
    expect(plan.phase4.refusals).toHaveLength(0);

    // Re-run against the post-delete snapshot (the row is gone): plans nothing further.
    const postDelete = { ...existing, memberships: [] };
    const secondPlan = planMwImport({ memberRecords, accountingRecords, attendeeFiles: [] }, postDelete);
    expect(secondPlan.phase4.toDelete).toHaveLength(0);
    expect(secondPlan.phase4.toInsert).toHaveLength(0);
    expect(secondPlan.phase4.toUpdate).toHaveLength(0);
  });
});
