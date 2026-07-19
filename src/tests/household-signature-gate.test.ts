// householdSignatureGate's own coverage (member-waivers T5a, docs/2026-07-17-member-waivers-
// design.md ratified decision 7 AS AMENDED 2026-07-18): a complete household with nothing
// outstanding, an incomplete household naming an adult's own outstanding count, a minor's own
// outstanding Part Two counted once and never attributed to any adult, and the no-published-
// documents pass-through -- the season's requirements come back with every list empty, and the
// gate reports complete with nothing remaining and payment free to proceed, exactly the shipped
// state (every real document is still `status: draft`).
import { describe, expect, it } from 'vitest';
import type { DocumentFrontmatter, SignableDocument } from '$theme/documents';
import { deriveHouseholdRequirements, type DeriveHouseholdRequirementsInput, type SignatureRecord } from '$member-portal/lib/waiver-requirements';
import { householdSignatureGate } from '$member-portal/lib/household-signature-gate';

const SEASON = 2027;
const ASOF = new Date('2027-06-15T12:00:00Z');

const ADULT_A = { id: 'mem-adult-a', name: 'Alex Adult', birthdate: '1985-03-01' };
const ADULT_B = { id: 'mem-adult-b', name: 'Blair Adult', birthdate: '1987-09-01' };
const MINOR_C = { id: 'mem-minor-c', name: 'Casey Child', birthdate: '2015-01-01' }; // age 12 as of ASOF

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

function baseInput(overrides: Partial<DeriveHouseholdRequirementsInput> = {}): DeriveHouseholdRequirementsInput {
  return {
    season: SEASON,
    primaryMemberId: ADULT_A.id,
    members: [ADULT_A, ADULT_B],
    assetKinds: [],
    publishedDocuments: published(),
    signatures: [],
    asOf: ASOF,
    ...overrides,
  };
}

describe('householdSignatureGate', () => {
  it('reports complete, nothing remaining, and payment free to proceed once every adult has signed', () => {
    const release = doc({ id: 'general-release-v1', document: 'general-release', kind: 'release' });
    const requirements = deriveHouseholdRequirements(
      baseInput({
        publishedDocuments: published(release),
        signatures: [
          signature({ memberId: ADULT_A.id }),
          signature({ memberId: ADULT_B.id }),
        ],
      }),
    );
    const gate = householdSignatureGate(requirements);
    expect(gate).toEqual({ complete: true, remaining: [], canProceedToPayment: true });
  });

  it('names an adult who has not signed, with the count of their own outstanding documents, and blocks payment', () => {
    const release = doc({ id: 'general-release-v1', document: 'general-release', kind: 'release' });
    const rules = doc({ id: 'rules-acknowledgement-v1', document: 'rules-acknowledgement', kind: 'acknowledgement' });
    const requirements = deriveHouseholdRequirements(
      baseInput({
        publishedDocuments: published(release, rules),
        signatures: [
          signature({ documentId: 'general-release', memberId: ADULT_A.id }),
          signature({ documentId: 'rules-acknowledgement', memberId: ADULT_A.id }),
        ],
      }),
    );
    const gate = householdSignatureGate(requirements);
    expect(gate.complete).toBe(false);
    expect(gate.canProceedToPayment).toBe(false);
    expect(gate.remaining).toEqual([
      { memberId: ADULT_B.id, name: ADULT_B.name, role: 'adult', outstandingCount: 2 },
    ]);
  });

  it("names a minor with their own outstanding Part Two count, never attributed to any adult, once one adult has already signed for them", () => {
    const release = doc({ id: 'general-release-v1', document: 'general-release', kind: 'release' });
    const requirements = deriveHouseholdRequirements(
      baseInput({
        members: [ADULT_A, ADULT_B, MINOR_C],
        publishedDocuments: published(release),
        signatures: [signature({ memberId: ADULT_A.id }), signature({ memberId: ADULT_B.id })],
      }),
    );
    const gate = householdSignatureGate(requirements);
    expect(gate.complete).toBe(false);
    expect(gate.remaining).toEqual([
      { memberId: MINOR_C.id, name: MINOR_C.name, role: 'minor', outstandingCount: 1 },
    ]);
  });

  it("clears a minor's Part Two once any adult has signed it, regardless of which adult", () => {
    const release = doc({ id: 'general-release-v1', document: 'general-release', kind: 'release' });
    const requirements = deriveHouseholdRequirements(
      baseInput({
        members: [ADULT_A, ADULT_B, MINOR_C],
        publishedDocuments: published(release),
        signatures: [
          signature({ memberId: ADULT_A.id }),
          signature({ memberId: ADULT_B.id }),
          signature({ minorMemberId: MINOR_C.id }),
        ],
      }),
    );
    const gate = householdSignatureGate(requirements);
    expect(gate).toEqual({ complete: true, remaining: [], canProceedToPayment: true });
  });

  it('reports complete with nothing remaining when the season has no published documents at all (the shipped state)', () => {
    const requirements = deriveHouseholdRequirements(baseInput({ members: [ADULT_A, MINOR_C], assetKinds: ['mooring'] }));
    const gate = householdSignatureGate(requirements);
    expect(gate).toEqual({ complete: true, remaining: [], canProceedToPayment: true });
  });
});
