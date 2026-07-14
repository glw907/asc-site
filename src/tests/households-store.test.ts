import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { getHouseholdDesk, listHouseholds, resolveMemberHousehold } from '$admin-club/lib/households-store';

const TIER_PRICE_ROWS = [
  { key: 'tier_price_individual', value: '250' },
  { key: 'tier_price_family', value: '500' },
  { key: 'tier_price_young_adult', value: '100' },
];

function settingsFixture(graceDays = '30') {
  return {
    firstResults: { "key = 'renewal_grace_days'": { value: graceDays } },
    allResults: { 'tier_price_individual': TIER_PRICE_ROWS },
  };
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('listHouseholds', () => {
  it('maps a multi-member household, marking the primary member', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-larsen',
            name: 'The Larsens',
            city: 'Anchorage',
            primary_member_id: 'mem-erik',
            season: 2026,
            tier: 'family',
            price_paid: 500,
            paid_at: daysAgo(30),
            active_assets: 0,
          },
        ],
        'FROM members': [
          { id: 'mem-erik', household_id: 'hh-larsen', name: 'Erik Larsen', email: 'erik@example.com', archived_at: null },
          { id: 'mem-kaija', household_id: 'hh-larsen', name: 'Kaija Larsen', email: 'kaija@example.com', archived_at: null },
        ],
      },
    });

    const rows = await listHouseholds(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'hh-larsen', standing: 'current', tier: 'family', amount: 500 });
    expect(rows[0].members).toEqual([
      { id: 'mem-erik', name: 'Erik Larsen', archived: false, isPrimary: true, matchedSearch: false },
      { id: 'mem-kaija', name: 'Kaija Larsen', archived: false, isPrimary: false, matchedSearch: false },
    ]);
  });

  it('flags a $0 comp as comped, never discounted', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-wright',
            name: 'Geoff Wright',
            city: 'Homer',
            primary_member_id: 'mem-wright',
            season: 2026,
            tier: 'individual',
            price_paid: 0,
            paid_at: daysAgo(10),
            active_assets: 0,
          },
        ],
        'FROM members': [{ id: 'mem-wright', household_id: 'hh-wright', name: 'Geoff Wright', email: null, archived_at: null }],
      },
    });

    const [row] = await listHouseholds(db);
    expect(row.comped).toBe(true);
    expect(row.discounted).toBe(false);
  });

  it('flags a nonzero amount off the settings price as discounted', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-black',
            name: 'Nancy Black',
            city: 'Sitka',
            primary_member_id: 'mem-black',
            season: 2026,
            tier: 'family',
            price_paid: 324,
            paid_at: daysAgo(10),
            active_assets: 4,
          },
        ],
        'FROM members': [{ id: 'mem-black', household_id: 'hh-black', name: 'Nancy Black', email: null, archived_at: null }],
      },
    });

    const [row] = await listHouseholds(db);
    expect(row.comped).toBe(false);
    expect(row.discounted).toBe(true);
    expect(row.amount).toBe(324);
  });

  it('flags a stale membership with an active asset assignment', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-hunter',
            name: 'Elayne C Hunter',
            city: 'Kodiak',
            primary_member_id: 'mem-hunter',
            season: 2024,
            tier: 'individual',
            price_paid: 250,
            paid_at: daysAgo(500),
            active_assets: 1,
          },
        ],
        'FROM members': [{ id: 'mem-hunter', household_id: 'hh-hunter', name: 'Elayne C Hunter', email: null, archived_at: null }],
      },
    });

    const [row] = await listHouseholds(db);
    expect(row.standing).toBe('lapsed');
    expect(row.activeAssets).toBe(1);
    expect(row.staleAssets).toBe(true);
  });

  it('never flags stale assets for a current household even with assets attached', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-current',
            name: 'The Currents',
            city: 'Juneau',
            primary_member_id: 'mem-cur',
            season: 2026,
            tier: 'individual',
            price_paid: 250,
            paid_at: daysAgo(10),
            active_assets: 2,
          },
        ],
        'FROM members': [{ id: 'mem-cur', household_id: 'hh-current', name: 'Cur Rent', email: null, archived_at: null }],
      },
    });

    const [row] = await listHouseholds(db);
    expect(row.staleAssets).toBe(false);
  });

  it('reads none for a household with no grounding row at all', async () => {
    const { db } = fakeD1({
      ...settingsFixture(),
      allResults: {
        ...settingsFixture().allResults,
        'FROM households h': [
          {
            id: 'hh-fresh',
            name: 'Fresh Household',
            city: null,
            primary_member_id: null,
            season: null,
            tier: null,
            price_paid: null,
            paid_at: null,
            active_assets: 0,
          },
        ],
        'FROM members': [],
      },
    });

    const [row] = await listHouseholds(db);
    expect(row.standing).toBe('none');
    expect(row.tier).toBeNull();
    expect(row.amount).toBeNull();
  });

  it('reads grace then lapsed as the paid boundary and grace window pass', async () => {
    const { db } = fakeD1({
      ...settingsFixture('30'),
      allResults: {
        ...settingsFixture('30').allResults,
        'FROM households h': [
          {
            id: 'hh-grace',
            name: 'Grace Household',
            city: null,
            primary_member_id: null,
            season: 2025,
            tier: 'individual',
            price_paid: 250,
            paid_at: daysAgo(380), // expiry = paid + 365 = 15 days ago; grace ends = +30 = 15 days from now
            active_assets: 0,
          },
          {
            id: 'hh-lapsed',
            name: 'Lapsed Household',
            city: null,
            primary_member_id: null,
            season: 2024,
            tier: 'individual',
            price_paid: 250,
            paid_at: daysAgo(400), // expiry = 35 days ago; grace ends = 5 days ago
            active_assets: 0,
          },
        ],
        'FROM members': [],
      },
    });

    const rows = await listHouseholds(db);
    expect(rows.find((r) => r.id === 'hh-grace')?.standing).toBe('grace');
    expect(rows.find((r) => r.id === 'hh-lapsed')?.standing).toBe('lapsed');
  });

  it('ignores a refunded row via the grounding query itself (asserted on the SQL text)', async () => {
    const { db, calls } = fakeD1({ ...settingsFixture(), allResults: { ...settingsFixture().allResults, 'FROM households h': [], 'FROM members': [] } });
    await listHouseholds(db);
    const groundingCall = calls.find((c) => c.sql.includes('FROM households h'));
    expect(groundingCall?.sql).toContain('mm.refunded_at IS NULL');
  });

  describe('search matcher', () => {
    const HOUSEHOLD_FIXTURE = {
      id: 'hh-mixed',
      name: 'The Mixed Household',
      city: null,
      primary_member_id: 'mem-oliver',
      season: 2026,
      tier: 'family',
      price_paid: 500,
      paid_at: daysAgo(10),
      active_assets: 0,
    };
    const MEMBERS_FIXTURE = [
      { id: 'mem-oliver', household_id: 'hh-mixed', name: 'Oliver Wright', email: 'oliver@example.com', archived_at: null },
      { id: 'mem-jane', household_id: 'hh-mixed', name: 'Jane Wright', email: 'jane@example.com', archived_at: null },
    ];

    it('marks the matching member, not every household member', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: { ...settingsFixture().allResults, 'FROM households h': [HOUSEHOLD_FIXTURE], 'FROM members': MEMBERS_FIXTURE },
      });
      const rows = await listHouseholds(db, { search: 'Oliver' });
      expect(rows).toHaveLength(1);
      expect(rows[0].members.find((m) => m.id === 'mem-oliver')?.matchedSearch).toBe(true);
      expect(rows[0].members.find((m) => m.id === 'mem-jane')?.matchedSearch).toBe(false);
    });

    it('matches on member email case-insensitively', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: { ...settingsFixture().allResults, 'FROM households h': [HOUSEHOLD_FIXTURE], 'FROM members': MEMBERS_FIXTURE },
      });
      const rows = await listHouseholds(db, { search: 'JANE@EXAMPLE.COM' });
      expect(rows).toHaveLength(1);
      expect(rows[0].members.find((m) => m.id === 'mem-jane')?.matchedSearch).toBe(true);
    });

    it('matches on the household name with no member flagged', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: { ...settingsFixture().allResults, 'FROM households h': [HOUSEHOLD_FIXTURE], 'FROM members': MEMBERS_FIXTURE },
      });
      const rows = await listHouseholds(db, { search: 'mixed household' });
      expect(rows).toHaveLength(1);
      expect(rows[0].members.every((m) => !m.matchedSearch)).toBe(true);
    });

    it('drops a household with no name or member match', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: { ...settingsFixture().allResults, 'FROM households h': [HOUSEHOLD_FIXTURE], 'FROM members': MEMBERS_FIXTURE },
      });
      const rows = await listHouseholds(db, { search: 'nonexistent' });
      expect(rows).toHaveLength(0);
    });
  });

  describe('segment filter', () => {
    const ROWS = [
      { id: 'hh-current', name: 'Current House', city: null, primary_member_id: null, season: 2026, tier: 'individual', price_paid: 250, paid_at: daysAgo(10), active_assets: 0 },
      { id: 'hh-lapsed', name: 'Lapsed House', city: null, primary_member_id: null, season: 2023, tier: 'individual', price_paid: 250, paid_at: daysAgo(1000), active_assets: 0 },
    ];

    it("'current' keeps only current standing", async () => {
      const { db } = fakeD1({ ...settingsFixture(), allResults: { ...settingsFixture().allResults, 'FROM households h': ROWS, 'FROM members': [] } });
      const rows = await listHouseholds(db, { segment: 'current' });
      expect(rows.map((r) => r.id)).toEqual(['hh-current']);
    });

    it("'lapsed' keeps everything not current (grace, lapsed, and none alike)", async () => {
      const { db } = fakeD1({ ...settingsFixture(), allResults: { ...settingsFixture().allResults, 'FROM households h': ROWS, 'FROM members': [] } });
      const rows = await listHouseholds(db, { segment: 'lapsed' });
      expect(rows.map((r) => r.id)).toEqual(['hh-lapsed']);
    });

    it("'all' (the default) applies no standing filter", async () => {
      const { db } = fakeD1({ ...settingsFixture(), allResults: { ...settingsFixture().allResults, 'FROM households h': ROWS, 'FROM members': [] } });
      const rows = await listHouseholds(db);
      expect(rows).toHaveLength(2);
    });
  });

  describe('includeArchived', () => {
    it('hides a household whose every member is archived by default', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: {
          ...settingsFixture().allResults,
          'FROM households h': [
            { id: 'hh-gone', name: 'Gone Household', city: null, primary_member_id: null, season: null, tier: null, price_paid: null, paid_at: null, active_assets: 0 },
          ],
          'FROM members': [{ id: 'mem-gone', household_id: 'hh-gone', name: 'Gone Member', email: null, archived_at: '2025-01-01' }],
        },
      });
      await expect(listHouseholds(db)).resolves.toEqual([]);
      await expect(listHouseholds(db, { includeArchived: true })).resolves.toHaveLength(1);
    });

    it('never hides a household with zero members, regardless of the flag', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: {
          ...settingsFixture().allResults,
          'FROM households h': [
            { id: 'hh-empty', name: 'Empty Household', city: null, primary_member_id: null, season: null, tier: null, price_paid: null, paid_at: null, active_assets: 0 },
          ],
          'FROM members': [],
        },
      });
      await expect(listHouseholds(db)).resolves.toHaveLength(1);
    });

    it('keeps a household with a mix of archived and active members', async () => {
      const { db } = fakeD1({
        ...settingsFixture(),
        allResults: {
          ...settingsFixture().allResults,
          'FROM households h': [
            { id: 'hh-mix', name: 'Mixed Archive', city: null, primary_member_id: null, season: null, tier: null, price_paid: null, paid_at: null, active_assets: 0 },
          ],
          'FROM members': [
            { id: 'mem-a', household_id: 'hh-mix', name: 'Active One', email: null, archived_at: null },
            { id: 'mem-b', household_id: 'hh-mix', name: 'Archived One', email: null, archived_at: '2025-01-01' },
          ],
        },
      });
      await expect(listHouseholds(db)).resolves.toHaveLength(1);
    });
  });
});

describe('getHouseholdDesk', () => {
  it('returns null for a missing household', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM households WHERE id': null } });
    await expect(getHouseholdDesk(db, 'no-such-household')).resolves.toBeNull();
  });

  it('maps roster, memberships, and assets, marking the primary member', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM households WHERE id': { id: 'hh-1', name: 'The Ones', city: 'Nome', primary_member_id: 'mem-1' },
      },
      allResults: {
        'FROM members WHERE household_id': [
          { id: 'mem-1', name: 'Primary One', email: 'p@example.com', phone: '+19075550100', birthdate: '1980-01-01', directory_visibility: 'visible', archived_at: null },
          { id: 'mem-2', name: 'Second One', email: null, phone: null, birthdate: null, directory_visibility: 'hidden', archived_at: '2025-06-01' },
        ],
        'FROM memberships WHERE household_id': [
          { id: 'ms-1', season: 2026, tier: 'family', price_paid: 500, paid_at: '2026-01-01', stripe_ref: 'cs_test_1', refunded_at: null },
        ],
        'FROM asset_assignments aa': [
          { id: 'aa-1', asset_type: 'mooring', asset_type_name: 'Mooring', membership_id: 'ms-1', season: 2026, description: 'Buoy M-14', status: 'active' },
        ],
      },
    });

    const desk = await getHouseholdDesk(db, 'hh-1');
    expect(desk).toMatchObject({ id: 'hh-1', name: 'The Ones', city: 'Nome', primaryMemberId: 'mem-1' });
    expect(desk?.roster).toEqual([
      { id: 'mem-1', name: 'Primary One', email: 'p@example.com', phone: '+19075550100', birthdate: '1980-01-01', directoryVisibility: 'visible', archived: false, isPrimary: true },
      { id: 'mem-2', name: 'Second One', email: null, phone: null, birthdate: null, directoryVisibility: 'hidden', archived: true, isPrimary: false },
    ]);
    expect(desk?.memberships).toEqual([
      { id: 'ms-1', season: 2026, tier: 'family', pricePaid: 500, paidAt: '2026-01-01', stripeRef: 'cs_test_1', refundedAt: null },
    ]);
    expect(desk?.assets).toEqual([
      { id: 'aa-1', assetType: 'mooring', assetTypeName: 'Mooring', membershipId: 'ms-1', season: 2026, description: 'Buoy M-14', status: 'active' },
    ]);
  });
});

describe('resolveMemberHousehold', () => {
  it('resolves an existing member to its household id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE id': { household_id: 'hh-1' } } });
    await expect(resolveMemberHousehold(db, 'mem-1')).resolves.toBe('hh-1');
  });

  it('returns null for a member id that does not exist', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM members WHERE id': null } });
    await expect(resolveMemberHousehold(db, 'no-such-member')).resolves.toBeNull();
  });
});
