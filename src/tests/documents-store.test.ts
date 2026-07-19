// deriveSeasonDocumentSummaries's own coverage (member-waivers T6): an all-members document
// splitting a household's adults into signed/outstanding, a household-scope document attributed
// once to the primary (never duplicated across adults), a minor's Part Two folded into the same
// document's rollup, and a published document with no current holder still appearing at 0/0.
// loadSeasonDocumentSummaries, listMemberSignatureHistory, and getSignatureDetail each get one
// thin integration test against fakeD1, matching waiver-requirements.test.ts's own precedent.
import { describe, expect, it } from 'vitest';
import type { DocumentFrontmatter, SignableDocument } from '$theme/documents';
import type { SignatureRecord } from '$member-portal/lib/waiver-requirements';
import {
  deriveSeasonDocumentSummaries,
  getSignatureDetail,
  listMemberSignatureHistory,
  loadSeasonDocumentSummaries,
  type HouseholdRosterInput,
} from '$admin-club/lib/documents-store';
import { fakeD1 } from './_fake-d1';

const SEASON = 2027;

function doc(overrides: Partial<DocumentFrontmatter> & { id: string }): SignableDocument {
  const { id, ...frontmatterOverrides } = overrides;
  const frontmatter: DocumentFrontmatter = {
    title: 'A Document',
    document: 'general-release',
    version: 1,
    kind: 'release',
    audience: 'all-members',
    season: SEASON,
    status: 'published',
    ...frontmatterOverrides,
  };
  return {
    concept: 'documents',
    id,
    slug: id,
    permalink: '',
    title: frontmatter.title,
    tags: [],
    excerpt: '',
    wordCount: 0,
    draft: false,
    fields: {},
    frontmatter,
    body: 'The signable text.',
  };
}

function published(...docs: SignableDocument[]): Map<string, SignableDocument> {
  return new Map(docs.map((d) => [d.frontmatter.document, d]));
}

function signature(overrides: Partial<SignatureRecord>): SignatureRecord {
  return {
    id: crypto.randomUUID(),
    documentId: 'general-release',
    season: SEASON,
    memberId: null,
    minorMemberId: null,
    signedAt: '2027-06-01 12:00:00',
    ...overrides,
  };
}

const ADULT_A = { id: 'mem-adult-a', name: 'Alex Adult', birthdate: '1985-03-01' };
const ADULT_B = { id: 'mem-adult-b', name: 'Blair Adult', birthdate: '1987-09-01' };
const MINOR_C = { id: 'mem-minor-c', name: 'Casey Child', birthdate: '2015-01-01' };

function household(overrides: Partial<HouseholdRosterInput> & { id: string }): HouseholdRosterInput {
  return { primaryMemberId: ADULT_A.id, members: [ADULT_A], assetKinds: [], ...overrides };
}

describe('deriveSeasonDocumentSummaries', () => {
  it('splits a household into signed and outstanding for an all-members document', () => {
    const release = doc({ id: 'general-release-v1' });
    const households = [household({ id: 'hh-1', members: [ADULT_A, ADULT_B] })];
    const signatures = [signature({ memberId: ADULT_A.id })];
    const summaries = deriveSeasonDocumentSummaries(published(release), households, SEASON, signatures);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].signed.map((r) => r.personId)).toEqual([ADULT_A.id]);
    expect(summaries[0].outstanding.map((r) => r.personId)).toEqual([ADULT_B.id]);
  });

  it('attributes a household-scope document once, to the primary, never to a second adult', () => {
    const mooring = doc({ id: 'mooring-agreement-v1', document: 'mooring-agreement', kind: 'agreement', audience: 'mooring' });
    const households = [household({ id: 'hh-1', primaryMemberId: ADULT_A.id, members: [ADULT_A, ADULT_B], assetKinds: ['mooring'] })];
    const summaries = deriveSeasonDocumentSummaries(published(mooring), households, SEASON, []);
    const rollup = summaries.find((s) => s.documentId === 'mooring-agreement');
    expect(rollup?.outstanding).toHaveLength(1);
    expect(rollup?.outstanding[0].personId).toBe(ADULT_A.id);
  });

  it('folds a minor Part Two requirement into the release document rollup', () => {
    const release = doc({ id: 'general-release-v1' });
    const households = [household({ id: 'hh-1', members: [ADULT_A, MINOR_C] })];
    const summaries = deriveSeasonDocumentSummaries(published(release), households, SEASON, []);
    expect(summaries[0].outstanding.map((r) => r.personId).sort()).toEqual([ADULT_A.id, MINOR_C.id].sort());
  });

  it('keeps a published document in the rollup at 0/0 with no current applicable person', () => {
    const rack = doc({ id: 'rack-acknowledgement-v1', document: 'rack-acknowledgement', kind: 'acknowledgement', audience: 'small-boat-rack' });
    const households = [household({ id: 'hh-1', assetKinds: [] })];
    const summaries = deriveSeasonDocumentSummaries(published(rack), households, SEASON, []);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].signed).toHaveLength(0);
    expect(summaries[0].outstanding).toHaveLength(0);
  });

  it('reports every household, even a person the season has no signature for at all', () => {
    const release = doc({ id: 'general-release-v1' });
    const summaries = deriveSeasonDocumentSummaries(published(release), [household({ id: 'hh-1' })], SEASON, []);
    expect(summaries[0].outstanding.map((r) => r.personId)).toEqual([ADULT_A.id]);
  });
});

describe('loadSeasonDocumentSummaries', () => {
  it('assembles the rollup off three bulk reads', async () => {
    const release = doc({ id: 'general-release-v1' });
    const { db } = fakeD1({
      allResults: {
        'FROM households h': [
          { household_id: 'hh-1', primary_member_id: ADULT_A.id, member_id: ADULT_A.id, member_name: ADULT_A.name, birthdate: ADULT_A.birthdate },
        ],
        'FROM asset_assignments aa': [],
        'FROM waiver_acceptances': [{ id: 'sig-1', document_id: 'general-release', season: SEASON, member_id: ADULT_A.id, minor_member_id: null, signed_at: '2027-06-01 12:00:00' }],
      },
    });
    const summaries = await loadSeasonDocumentSummaries(db, published(release), SEASON);
    expect(summaries[0].signed.map((r) => r.personId)).toEqual([ADULT_A.id]);
  });
});

describe('listMemberSignatureHistory', () => {
  it('returns a member\'s own signatures and the minors they signed for, most recent first', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM waiver_acceptances wa': [
          { id: 'sig-2', document_id: 'general-release', version: 1, season: SEASON, kind: 'release', context: 'renewal', signed_at: '2027-06-02 00:00:00', member_id: ADULT_A.id, minor_member_id: null, minor_name: null },
          { id: 'sig-1', document_id: 'general-release', version: 1, season: SEASON, kind: 'release', context: 'renewal', signed_at: '2027-06-01 00:00:00', member_id: ADULT_A.id, minor_member_id: MINOR_C.id, minor_name: MINOR_C.name },
        ],
      },
    });
    const rows = await listMemberSignatureHistory(db, ADULT_A.id);
    expect(rows.map((r) => r.id)).toEqual(['sig-2', 'sig-1']);
    expect(rows[1].onBehalfOfMinorName).toBe(MINOR_C.name);
    expect(rows[0].onBehalfOfMinorId).toBeNull();
  });
});

describe('getSignatureDetail', () => {
  it('resolves the full evidence row, joining out the member and minor names', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM waiver_acceptances wa': {
          id: 'sig-1',
          document_id: 'general-release',
          version: 1,
          season: SEASON,
          kind: 'release',
          content_hash: 'a'.repeat(64),
          content_snapshot: 'The signed text.',
          person_name: 'Alex Adult',
          person_email: 'alex@example.com',
          context: 'renewal',
          signed_at: '2027-06-01 00:00:00',
          ip_address: '203.0.113.1',
          member_id: ADULT_A.id,
          member_name: ADULT_A.name,
          minor_member_id: null,
          minor_name: null,
          signer_relationship: null,
          auth_token_id: 'tok-1',
          auth_issued_at: '2027-06-01 00:00:00',
          auth_consumed_at: '2027-06-01 00:00:01',
          build_hash: 'abc123',
        },
      },
    });
    const detail = await getSignatureDetail(db, 'sig-1');
    expect(detail?.memberName).toBe(ADULT_A.name);
    expect(detail?.contentSnapshot).toBe('The signed text.');
  });

  it('resolves null for an unknown id', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM waiver_acceptances wa': null } });
    await expect(getSignatureDetail(db, 'no-such-id')).resolves.toBeNull();
  });
});
