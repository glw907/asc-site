// Proves the waivers board-demo fix (finding from the T1 real-document publish, docs/plans/
// 2026-07-19-waivers-board-demo.md): `e2e/portal-seed.sql` mints member sessions with no
// `waiver_acceptances` rows, and T1 published real, season-2026 `all-members` documents into the
// site's own content corpus. Without the fixture rows this test guards, both fixture households
// would derive outstanding requirements the instant the real corpus carries published content,
// growing a "documents need your signature" row on `/my-account` and drifting the visual
// baselines with no fixture change of their own (`e2e/portal-visual.spec.ts`'s own "Nothing needs
// you" assertion for the Sterling household).
//
// This mirrors `portal-seed.sql`'s own household/member/asset/signature rows by hand (fakeD1 has
// no real SQL engine to load the fixture file into, `src/tests/_fake-d1.ts`'s own header), against
// the REAL published season-2026 document corpus (`$chassis/content`'s `documents` index, the same
// parse path `document-freeze-guard.test.ts` already uses), and asserts zero outstanding
// requirements for both households -- proving, not assuming, the fixture's own comment that neither
// household's asset holdings ever derive a household-scope document requirement (their asset_types
// ids are fixture placeholders, not real `AssetKind` values).
import { describe, expect, it } from 'vitest';
import { documents } from '$chassis/content';
import { loadPublishedDocuments } from '$theme/documents';
import { loadHouseholdRequirements, type HouseholdRequirements } from '$member-portal/lib/waiver-requirements';
import { fakeD1 } from './_fake-d1';

const SEASON = 2026;

/** Every unsigned document across a household's adults and minors -- zero means the household
 *  reads fully signed for `deriveHouseholdRequirements`'s own purposes. */
function outstanding(requirements: HouseholdRequirements): string[] {
  const adultGaps = requirements.adults.flatMap((adult) =>
    adult.requirements.filter((r) => !r.signed).map((r) => `${adult.memberName}: ${r.document.frontmatter.document} (${r.scope})`),
  );
  const minorGaps = requirements.minors.filter((m) => !m.signed).map((m) => `${m.minorName} (Part Two): ${m.document.frontmatter.document}`);
  return [...adultGaps, ...minorGaps];
}

describe('portal-seed.sql fixture households against the real season-2026 corpus', () => {
  const publishedDocuments = loadPublishedDocuments(documents, SEASON);

  it('publishes the two all-members documents this fixture signs (general-release, rules-acknowledgement)', () => {
    // A guard against the fixture and the real corpus silently drifting apart: if T1's own
    // documents ever stop resolving for season 2026, the households below would read as having
    // NOTHING to sign (an empty `publishedDocuments` map) and this test would pass for the wrong
    // reason -- vacuously, not because the fixture rows actually satisfy anything.
    expect([...publishedDocuments.keys()].sort()).toEqual(
      ['boat-parking-acknowledgement', 'general-release', 'mooring-agreement', 'rack-acknowledgement', 'rules-acknowledgement', 'rv-acknowledgement', 'storage-agreement', 'youth-medical-form'].sort(),
    );
  });

  it('derives zero outstanding requirements for the Wright household (two adults, no minors)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM households WHERE id': { id: 'portal-hh-wright', name: 'Wright household', primary_member_id: 'portal-mem-primary', left_at: null },
      },
      allResults: {
        'FROM members WHERE household_id = ?1 ORDER BY name': [
          { id: 'portal-mem-primary', name: 'Geoff Wright', email: 'e2e-member@aksailingclub.org', phone: null, birthdate: null, directory_visibility: 'visible', archived_at: null },
          { id: 'portal-mem-second', name: 'Sam Wright', email: null, phone: null, birthdate: null, directory_visibility: 'partial', archived_at: null },
        ],
        'FROM asset_assignments aa': [
          { id: 'portal-aa-mooring', asset_type: 'portal-at-mooring', asset_type_name: 'Mooring', description: 'Sailboat', payment_id: 'portal-ap-mooring', paid_at: '2026-06-20 00:00:00', fee_amount: 150 },
          { id: 'portal-aa-trailer', asset_type: 'portal-at-trailer', asset_type_name: 'Trailered Boat Parking', description: 'BUCC', payment_id: 'portal-ap-trailer', paid_at: null, fee_amount: 150 },
        ],
        'FROM waiver_acceptances': [
          { id: 'portal-wa-primary-release', document_id: 'general-release', season: SEASON, member_id: 'portal-mem-primary', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
          { id: 'portal-wa-primary-rules', document_id: 'rules-acknowledgement', season: SEASON, member_id: 'portal-mem-primary', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
          { id: 'portal-wa-second-release', document_id: 'general-release', season: SEASON, member_id: 'portal-mem-second', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
          { id: 'portal-wa-second-rules', document_id: 'rules-acknowledgement', season: SEASON, member_id: 'portal-mem-second', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
        ],
      },
    });

    const requirements = await loadHouseholdRequirements(db, publishedDocuments, 'portal-hh-wright', SEASON);
    expect(requirements).not.toBeNull();
    expect(requirements!.adults).toHaveLength(2);
    expect(requirements!.minors).toHaveLength(0);
    expect(outstanding(requirements!)).toEqual([]);
  });

  it('derives zero outstanding requirements for the Sterling household (one adult, no assets, no minors)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM households WHERE id': { id: 'portal-hh-clear', name: 'Sterling household', primary_member_id: 'portal-mem-clear', left_at: null },
      },
      allResults: {
        'FROM members WHERE household_id = ?1 ORDER BY name': [
          { id: 'portal-mem-clear', name: 'Alex Sterling', email: 'e2e-member-clear@aksailingclub.org', phone: null, birthdate: null, directory_visibility: 'visible', archived_at: null },
        ],
        'FROM asset_assignments aa': [],
        'FROM waiver_acceptances': [
          { id: 'portal-wa-clear-release', document_id: 'general-release', season: SEASON, member_id: 'portal-mem-clear', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
          { id: 'portal-wa-clear-rules', document_id: 'rules-acknowledgement', season: SEASON, member_id: 'portal-mem-clear', minor_member_id: null, signed_at: '2026-06-01 00:00:00' },
        ],
      },
    });

    const requirements = await loadHouseholdRequirements(db, publishedDocuments, 'portal-hh-clear', SEASON);
    expect(requirements).not.toBeNull();
    expect(requirements!.adults).toHaveLength(1);
    expect(requirements!.minors).toHaveLength(0);
    expect(outstanding(requirements!)).toEqual([]);
  });
});
