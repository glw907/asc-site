import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { editorWithRole } from './_editor';
import { loadAttentionCounts } from '$theme/admin-attention';
import { load as loadOverview } from '../routes/admin/club/+page.server';

// Pass B sidebar-build T7: `loadAttentionCounts` is the one function both the Overview
// needs-attention strip and `cairn.server.ts`'s `attention` dependency call, so this suite proves
// the count rules directly, plus a "never disagree" test showing the Overview load answers with
// exactly what this module returns.

const PENDING_ASSET_REQUEST_ROW = {
  id: 'req-1',
  asset_type_name: 'Mooring',
  asset_type: 'mooring',
  household_name: 'Larsen',
  household_id: 'hh-1',
  requester_name: 'Kaija Larsen',
  kind: 'new',
  note: null,
  created_at: '2026-07-01 00:00:00',
  fee: 100,
};

const CURRENT_SEASON = { value: '2026' };

const OPEN_CLASS_WITH_WAITLIST = {
  id: 'fleet-tune-up-weekend',
  season: 2026,
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  custom_note: null,
  hero_image: null,
  hero_image_alt: null,
  visible: 1 as const,
  drop_in: 0 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  enrolled_count: 5, // under capacity(10): a freed seat
  waitlist_count: 1,
};

const FULL_CLASS_WITH_WAITLIST = {
  ...OPEN_CLASS_WITH_WAITLIST,
  id: 'youth-racing-clinic',
  capacity: 8,
  enrolled_count: 8, // at capacity: never a freed seat, regardless of its waitlist
};

const LAST_SEASON_OPEN_CLASS = {
  ...OPEN_CLASS_WITH_WAITLIST,
  id: 'old-clinic',
  season: 2025,
};

const ACTIVE_OFFER = {
  token: 'hash-a',
  waitlist_id: 'wait-1',
  class_id: OPEN_CLASS_WITH_WAITLIST.id,
  offered_by: 'admin@example.com',
  offered_at: '2026-07-01 00:00:00',
  expires_at: '2999-01-01 00:00:00', // far future: unexpired
  resolved: null,
  resolved_at: null,
};

const STALE_UNSWEPT_OFFER = { ...ACTIVE_OFFER, token: 'hash-b', expires_at: '2000-01-01 00:00:00' }; // past-expiry, never swept

describe('loadAttentionCounts', () => {
  it('reads zeros across the board against empty tables', async () => {
    const { db } = fakeD1({ firstResults: { "'current_season'": CURRENT_SEASON } });
    await expect(loadAttentionCounts(db)).resolves.toEqual({
      pendingAssetRequests: 0,
      pendingCommitteeRequests: 0,
      classWaitlistAttention: 0,
    });
  });

  it('counts pending asset requests from the same query the Overview strip used pre-T7', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": CURRENT_SEASON },
      allResults: { 'FROM asset_requests r': [PENDING_ASSET_REQUEST_ROW] },
    });
    const counts = await loadAttentionCounts(db);
    expect(counts.pendingAssetRequests).toBe(1);
  });

  it('counts pending committee join requests club-wide', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": CURRENT_SEASON, "FROM committee_members WHERE status = 'pending'": { n: 4 } },
    });
    const counts = await loadAttentionCounts(db);
    expect(counts.pendingCommitteeRequests).toBe(4);
  });

  it('sums offers nearing expiry with classes that have a freed seat and no active offer', async () => {
    const { db } = fakeD1({
      firstResults: {
        "'current_season'": CURRENT_SEASON,
        'SELECT COUNT(*) AS n FROM class_offers WHERE resolved IS NULL AND expires_at >': { n: 2 },
      },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_WITH_WAITLIST, FULL_CLASS_WITH_WAITLIST, LAST_SEASON_OPEN_CLASS],
        'FROM class_offers WHERE resolved IS NULL ORDER BY': [], // listOutstandingOffers: no active offer anywhere
      },
    });
    const counts = await loadAttentionCounts(db);
    // 2 offers nearing expiry + 1 freed-seat class (OPEN_CLASS_WITH_WAITLIST only: FULL is never
    // a freed seat, LAST_SEASON_OPEN_CLASS is out of season).
    expect(counts.classWaitlistAttention).toBe(3);
  });

  it('does not double-count a class whose queued entry already has an active offer', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": CURRENT_SEASON },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_WITH_WAITLIST],
        'FROM class_offers WHERE resolved IS NULL ORDER BY': [ACTIVE_OFFER],
      },
    });
    const counts = await loadAttentionCounts(db);
    expect(counts.classWaitlistAttention).toBe(0);
  });

  it('treats a not-yet-swept stale offer as still active (never sweeps; only under-counts), the ' +
    'same conservative trade offers.ts documents for hasActiveOfferForClass', async () => {
    const { db, calls } = fakeD1({
      firstResults: { "'current_season'": CURRENT_SEASON },
      allResults: {
        'FROM classes ORDER BY': [OPEN_CLASS_WITH_WAITLIST],
        'FROM class_offers WHERE resolved IS NULL ORDER BY': [STALE_UNSWEPT_OFFER],
      },
    });
    const counts = await loadAttentionCounts(db);
    expect(counts.classWaitlistAttention).toBe(1); // the freed seat still shows: the stale offer is excluded
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'expired'"))).toBe(false);
  });
});

describe('the Overview strip and the attention badges never disagree', () => {
  it("the Overview load's own data equals loadAttentionCounts's own result for the same db", async () => {
    const { db } = fakeD1({
      firstResults: {
        "'current_season'": CURRENT_SEASON,
        "FROM committee_members WHERE status = 'pending'": { n: 2 },
      },
      allResults: {
        'FROM asset_requests r': [PENDING_ASSET_REQUEST_ROW],
        'FROM classes ORDER BY': [OPEN_CLASS_WITH_WAITLIST],
        'FROM class_offers WHERE resolved IS NULL ORDER BY': [],
      },
    });
    const event = {
      locals: { editor: editorWithRole('Club manager') },
      platform: { env: { CLUB_DB: db } },
    } as unknown as Parameters<typeof loadOverview>[0];
    const [stripData, badgeCounts] = await Promise.all([loadOverview(event), loadAttentionCounts(db)]);
    expect(stripData).toEqual(badgeCounts);
  });
});
