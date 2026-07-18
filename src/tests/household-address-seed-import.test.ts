import { describe, expect, it } from 'vitest';
import { normalizeAddressCell, planAddressSeed } from '../../scripts/import/household-address-seed.mjs';

describe('normalizeAddressCell', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeAddressCell('  123 Main St  ')).toBe('123 Main St');
  });

  it('treats an empty or whitespace-only cell as absent', () => {
    expect(normalizeAddressCell('')).toBeNull();
    expect(normalizeAddressCell('   ')).toBeNull();
  });

  it('treats a missing cell as absent', () => {
    expect(normalizeAddressCell(null)).toBeNull();
    expect(normalizeAddressCell(undefined)).toBeNull();
  });

  it('stores the text verbatim otherwise, never re-casing', () => {
    expect(normalizeAddressCell('123 MAIN ST')).toBe('123 MAIN ST');
    expect(normalizeAddressCell('123 main st')).toBe('123 main st');
  });
});

describe('planAddressSeed', () => {
  const exportByAccountId = new Map([
    [
      'acc-1',
      {
        'Account ID': 'acc-1',
        'Address (Street)': '123 Main St',
        'Address (State/Province)': 'AK',
        'Address (Postal Code)': '99801',
      },
    ],
    [
      'acc-2',
      {
        'Account ID': 'acc-2',
        'Address (Street)': '456 Elm Ave',
        'Address (State/Province)': 'AK',
        'Address (Postal Code)': '99801',
      },
    ],
    [
      'acc-no-street',
      {
        'Account ID': 'acc-no-street',
        'Address (Street)': '   ',
        'Address (State/Province)': 'AK',
        'Address (Postal Code)': '99801',
      },
    ],
    [
      'acc-street-only',
      {
        'Account ID': 'acc-street-only',
        'Address (Street)': '789 Oak Dr',
        'Address (State/Province)': '',
        'Address (Postal Code)': '',
      },
    ],
  ]);

  it('plans a full-address update for a household with all three columns null', () => {
    const households = [
      {
        id: 'h-1',
        name: 'The Larsens',
        primary_member_id: 'm-1',
        address_line1: null,
        state: null,
        postal_code: null,
        mw_account_id: 'acc-1',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([
      {
        householdId: 'h-1',
        householdName: 'The Larsens',
        address_line1: '123 Main St',
        state: 'AK',
        postal_code: '99801',
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('plans a partial update touching only the one column that is still null', () => {
    const households = [
      {
        id: 'h-2',
        name: 'The Blacks',
        primary_member_id: 'm-2',
        address_line1: '456 Elm Ave',
        state: 'AK',
        postal_code: null,
        mw_account_id: 'acc-2',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([
      {
        householdId: 'h-2',
        householdName: 'The Blacks',
        postal_code: '99801',
      },
    ]);
  });

  it('skips a household whose columns are all already filled, reason already-filled', () => {
    const households = [
      {
        id: 'h-3',
        name: 'The Greens',
        primary_member_id: 'm-3',
        address_line1: '456 Elm Ave',
        state: 'AK',
        postal_code: '99801',
        mw_account_id: 'acc-2',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ householdId: 'h-3', householdName: 'The Greens', reason: 'already-filled' }]);
  });

  it('skips a household whose matched export row has no street, even if columns are null', () => {
    const households = [
      {
        id: 'h-4',
        name: 'The Whites',
        primary_member_id: 'm-4',
        address_line1: null,
        state: null,
        postal_code: null,
        mw_account_id: 'acc-no-street',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ householdId: 'h-4', householdName: 'The Whites', reason: 'no-street' }]);
  });

  it("skips a household whose primary has no mw_account_id, reason no-mw-account", () => {
    const households = [
      {
        id: 'h-5',
        name: 'The Grays',
        primary_member_id: 'm-5',
        address_line1: null,
        state: null,
        postal_code: null,
        mw_account_id: null,
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ householdId: 'h-5', householdName: 'The Grays', reason: 'no-mw-account' }]);
  });

  it('skips a household whose mw_account_id has no matching export row, reason no-export-match', () => {
    const households = [
      {
        id: 'h-6',
        name: 'The Browns',
        primary_member_id: 'm-6',
        address_line1: null,
        state: null,
        postal_code: null,
        mw_account_id: 'acc-unknown',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ householdId: 'h-6', householdName: 'The Browns', reason: 'no-export-match' }]);
  });

  it('never emits an update setting a column to empty or null: state/postal_code are omitted when the export cell is blank', () => {
    const households = [
      {
        id: 'h-7',
        name: 'The Reeds',
        primary_member_id: 'm-7',
        address_line1: null,
        state: null,
        postal_code: null,
        mw_account_id: 'acc-street-only',
      },
    ];
    const plan = planAddressSeed(households, exportByAccountId);
    expect(plan.updates).toEqual([{ householdId: 'h-7', householdName: 'The Reeds', address_line1: '789 Oak Dr' }]);
    const update = plan.updates[0] as Record<string, unknown>;
    expect('state' in update).toBe(false);
    expect('postal_code' in update).toBe(false);
  });
});
