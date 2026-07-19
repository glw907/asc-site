// The member-waivers document model's loader (member-waivers T1,
// docs/2026-07-17-member-waivers-design.md "Ratified decisions" 4 and 6): documents live in the
// repo as season-versioned markdown, one file per version, and the published version of each
// document id is the highest-versioned entry marked `status: 'published'` for the season asked
// about. A draft entry never resolves, even standing alone with no published sibling yet (Task 1's
// eight drafts all carry `status: 'draft'`, so no document resolves for season 2027 until an
// attorney-cleared version is published — the correct behavior, not a gap).
//
// `resolvePublishedDocuments` is the pure seam (a plain array in, a plain Map out), so the
// requirement engine (T3) and its tests can call it directly against synthetic entries.
// `loadPublishedDocuments` is the thin, non-pure wrapper over a live `ContentIndex` (the shape
// `$chassis/content`'s `documents` export carries) that T3 and the signing routes (T4/T5) actually
// import, following `post-cards.ts`'s own summaries-plus-index pattern.
import type { ContentEntry, ContentIndex } from '@glw907/cairn-cms/delivery';

/** The three kinds the spec's document model carries (decision 1): a release waives the member's
 *  own claims, an acknowledgement proves the member read something with no exculpatory language,
 *  and an agreement is a bilateral contract (the storage and mooring documents). */
export type DocumentKind = 'release' | 'acknowledgement' | 'agreement';

/** The closed audience vocabulary a document targets. The four asset kinds match `asset_types.id`
 *  in the club database (migrations/asc-club/0007_assets_email/forward.sql: `mooring`,
 *  `rv-parking`, `boat-parking`, `small-boat-rack`); `dry-storage` means the holder of any one of
 *  the three storage asset kinds (the Dry Storage Agreement's own audience, one agreement covering
 *  all three per its drafting notes); `all-members` and `youth-class` round out the set. */
export type DocumentAudience =
  | 'all-members'
  | 'mooring'
  | 'rv-parking'
  | 'boat-parking'
  | 'small-boat-rack'
  | 'dry-storage'
  | 'youth-class';

/** A document version's own publication state: `draft` never resolves for signing, `published`
 *  is frozen (the freeze guard, `src/tests/document-freeze-guard.test.ts`, holds its body
 *  immutable once set). */
export type DocumentStatus = 'draft' | 'published';

/** The `documents` concept's frontmatter shape (declared in `$theme/cairn.config.ts`). `document`
 *  is the stable id a document keeps across every version (e.g. "general-release"); `version` is
 *  that document's own version number, distinct from the content entry's own `id`. */
export interface DocumentFrontmatter {
  title: string;
  document: string;
  version: number;
  kind: DocumentKind;
  audience: DocumentAudience;
  season: number;
  status: DocumentStatus;
}

/** One signable document's full content entry: frontmatter plus the markdown body T4 renders and
 *  T2's signature record snapshots. */
export type SignableDocument = ContentEntry<DocumentFrontmatter>;

/**
 * Resolve the published version of each distinct document id for `season`: among `entries` whose
 * `status` is `'published'` and whose `season` matches, the highest `version` wins when several
 * exist (spec decision 6, fresh signatures every season: a season-rollover publish adds a new
 * version rather than replacing one in place). A document with no published version for `season`
 * is simply absent from the result; a draft is never a fallback.
 */
export function resolvePublishedDocuments(
  entries: SignableDocument[],
  season: number,
): Map<string, SignableDocument> {
  const resolved = new Map<string, SignableDocument>();
  for (const entry of entries) {
    const frontmatter = entry.frontmatter;
    if (frontmatter.status !== 'published' || frontmatter.season !== season) continue;
    const current = resolved.get(frontmatter.document);
    if (!current || frontmatter.version > current.frontmatter.version) {
      resolved.set(frontmatter.document, entry);
    }
  }
  return resolved;
}

/**
 * {@link resolvePublishedDocuments} over a live `documents` `ContentIndex` (the `$chassis/content`
 * export): reads every entry, including drafts (the concept's own `status` field governs
 * signability here, not cairn's reserved `draft:` frontmatter key, which this concept never sets),
 * and resolves them for `season`.
 */
export function loadPublishedDocuments(
  index: ContentIndex<DocumentFrontmatter>,
  season: number,
): Map<string, SignableDocument> {
  const entries = index
    .all({ includeDrafts: true })
    .map((summary) => index.byId(summary.id))
    .filter((entry): entry is SignableDocument => entry !== undefined);
  return resolvePublishedDocuments(entries, season);
}

/**
 * Resolve one exact document version by business id (member-waivers T6, the admin evidence
 * views): unlike {@link resolvePublishedDocuments}, this ignores `status` entirely and returns
 * the version regardless of whether it is still the published one for its season. A signature
 * record (`waiver_acceptances`) names the exact `document_id`/`version` it was signed under, and
 * that version's own file never disappears just because a later publish superseded it for the
 * same season (decision 6: a season-rollover publish adds a new version, it never replaces one
 * in place) -- the admin certificate and signature-text views need to keep resolving it. `null`
 * when no entry matches (the file was renamed or removed since signing, a genuinely missing case
 * the caller renders as "text unavailable" rather than throwing).
 */
export function resolveDocumentVersion(entries: SignableDocument[], documentId: string, version: number): SignableDocument | null {
  return entries.find((entry) => entry.frontmatter.document === documentId && entry.frontmatter.version === version) ?? null;
}

/** {@link resolveDocumentVersion} over a live `documents` `ContentIndex`, matching {@link
 *  loadPublishedDocuments}'s own read-every-entry-including-drafts precedent. */
export function loadDocumentVersion(index: ContentIndex<DocumentFrontmatter>, documentId: string, version: number): SignableDocument | null {
  const entries = index
    .all({ includeDrafts: true })
    .map((summary) => index.byId(summary.id))
    .filter((entry): entry is SignableDocument => entry !== undefined);
  return resolveDocumentVersion(entries, documentId, version);
}
