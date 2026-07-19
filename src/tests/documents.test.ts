import { describe, it, expect } from 'vitest';
import type { ContentIndex, ContentSummary } from '@glw907/cairn-cms/delivery';
import {
  loadDocumentVersion,
  loadPublishedDocuments,
  resolveDocumentVersion,
  resolvePublishedDocuments,
  type DocumentFrontmatter,
  type SignableDocument,
} from '$theme/documents';

function entry(overrides: Partial<DocumentFrontmatter> & { id: string }): SignableDocument {
  const { id, ...frontmatterOverrides } = overrides;
  const frontmatter: DocumentFrontmatter = {
    title: 'A Document',
    document: 'general-release',
    version: 1,
    kind: 'release',
    audience: 'all-members',
    season: 2027,
    status: 'draft',
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

function fakeIndex(entries: SignableDocument[]): ContentIndex<DocumentFrontmatter> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return {
    all: () =>
      entries.map((e): ContentSummary => {
        const { frontmatter: _frontmatter, body: _body, ...summary } = e;
        return summary;
      }),
    byId: (id) => byId.get(id),
    byTag: () => [],
    allTags: () => [],
    adjacent: () => ({}),
    problems: () => [],
  };
}

describe('resolvePublishedDocuments', () => {
  it('resolves nothing when every entry for the document is a draft', () => {
    const entries = [entry({ id: 'general-release-v1' })];
    expect(resolvePublishedDocuments(entries, 2027).size).toBe(0);
  });

  it('resolves a published document for the matching season', () => {
    const entries = [entry({ id: 'general-release-v1', status: 'published' })];
    const resolved = resolvePublishedDocuments(entries, 2027);
    expect(resolved.get('general-release')?.id).toBe('general-release-v1');
  });

  it('ignores a published version from a different season', () => {
    const entries = [entry({ id: 'general-release-v1', status: 'published', season: 2026 })];
    expect(resolvePublishedDocuments(entries, 2027).size).toBe(0);
  });

  it('picks the highest published version when several exist for the same season', () => {
    const entries = [
      entry({ id: 'general-release-v1', status: 'published', version: 1 }),
      entry({ id: 'general-release-v2', status: 'published', version: 2 }),
    ];
    const resolved = resolvePublishedDocuments(entries, 2027);
    expect(resolved.get('general-release')?.id).toBe('general-release-v2');
  });

  it('never falls back to a draft when no published version exists for the season (decision 4: publish freezes, nothing implicitly substitutes)', () => {
    const entries = [
      entry({ id: 'general-release-v1', status: 'published', season: 2026, version: 1 }),
      entry({ id: 'general-release-v2', status: 'draft', season: 2027, version: 2 }),
    ];
    expect(resolvePublishedDocuments(entries, 2027).size).toBe(0);
  });

  it('resolves distinct document ids independently', () => {
    const entries = [
      entry({ id: 'general-release-v1', document: 'general-release', status: 'published' }),
      entry({ id: 'rules-acknowledgement-v1', document: 'rules-acknowledgement', status: 'published' }),
    ];
    const resolved = resolvePublishedDocuments(entries, 2027);
    expect([...resolved.keys()].sort()).toEqual(['general-release', 'rules-acknowledgement']);
  });
});

describe('loadPublishedDocuments', () => {
  it('reads every entry off a live ContentIndex, including drafts, and resolves the published ones', () => {
    const entries = [
      entry({ id: 'general-release-v1', status: 'draft', version: 1 }),
      entry({ id: 'general-release-v2', status: 'published', version: 2 }),
    ];
    const resolved = loadPublishedDocuments(fakeIndex(entries), 2027);
    expect(resolved.get('general-release')?.id).toBe('general-release-v2');
  });
});

describe('resolveDocumentVersion', () => {
  it('finds a version regardless of status, unlike resolvePublishedDocuments', () => {
    const entries = [entry({ id: 'general-release-v1', status: 'draft', version: 1 })];
    expect(resolveDocumentVersion(entries, 'general-release', 1)?.id).toBe('general-release-v1');
  });

  it('finds a superseded version still on file after a later version published for the same season', () => {
    const entries = [
      entry({ id: 'general-release-v1', status: 'published', version: 1 }),
      entry({ id: 'general-release-v2', status: 'published', version: 2 }),
    ];
    expect(resolveDocumentVersion(entries, 'general-release', 1)?.id).toBe('general-release-v1');
  });

  it('returns null for a version that does not exist', () => {
    const entries = [entry({ id: 'general-release-v1', status: 'published', version: 1 })];
    expect(resolveDocumentVersion(entries, 'general-release', 9)).toBeNull();
  });
});

describe('loadDocumentVersion', () => {
  it('resolves a specific version off a live ContentIndex, including drafts', () => {
    const entries = [entry({ id: 'general-release-v1', status: 'draft', version: 1 })];
    expect(loadDocumentVersion(fakeIndex(entries), 'general-release', 1)?.id).toBe('general-release-v1');
  });
});
