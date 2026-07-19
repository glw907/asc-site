// The Club section's "is the club protected" admin rollup (member-waivers T6, spec decision 8):
// a per-season view over the requirement engine's own output ($member-portal/lib/waiver-
// requirements.ts, T3) plus the raw signature-record evidence (0029, T2). This module composes
// those two landed pieces rather than re-deriving who owes what -- see `deriveSeasonDocumentSummaries`'s
// own header for why importing the T3 engine here (rather than duplicating its ~100 lines of
// household/minor logic) is the deliberate call, even though `$member-portal` is not, before this
// task, an `$admin-club` import.
//
// Every read in this file is READ-ONLY: T6's own spec line is "no edit paths to signature rows --
// they are evidence; no delete anywhere". Nothing here writes.
import type { D1Database } from '@cloudflare/workers-types';
import type { DocumentAudience, DocumentKind, SignableDocument } from '$theme/documents';
import {
  deriveHouseholdRequirements,
  type AssetKind,
  type HouseholdMemberInput,
  type SignatureRecord,
} from '$member-portal/lib/waiver-requirements';

/** One person's own requirement row for one document, flattened out of the T3 engine's own
 *  per-household `HouseholdRequirements` shape into the rollup's per-document grouping. `personId`
 *  is an adult's own member id or a minor's own member id (the Part Two signer is always an adult,
 *  but the requirement itself belongs to the child, matching the engine's own `MinorRequirement`). */
export interface DocumentRosterEntry {
  personId: string;
  personName: string;
  householdId: string;
  signature: SignatureRecord | null;
}

/** One document's season rollup: every applicable person split into who has signed and who has
 *  not, per spec decision 8 ("each document with signed and outstanding counts, drill-through to
 *  either member list"). A published document with no current holder of its audience (an asset-kind
 *  document nobody currently holds) still appears, with both lists empty. */
export interface SeasonDocumentSummary {
  documentId: string;
  title: string;
  kind: DocumentKind;
  audience: DocumentAudience;
  version: number;
  signed: DocumentRosterEntry[];
  outstanding: DocumentRosterEntry[];
}

/** One household's roster and holdings, as much as {@link deriveHouseholdRequirements} needs --
 *  this module's own bulk-query shape, gathered in one pass rather than the one-household-at-a-time
 *  reads `waiver-requirements.ts`'s own `loadHouseholdRequirements` performs for the signing flow. */
export interface HouseholdRosterInput {
  id: string;
  primaryMemberId: string | null;
  members: HouseholdMemberInput[];
  assetKinds: AssetKind[];
}

/**
 * The season rollup, pure (member-waivers T6): runs the T3 engine once per household against
 * `households` (already bulk-read, see {@link loadSeasonDocumentSummaries}) and `signatures` (the
 * WHOLE season's rows, not pre-split per household -- {@link deriveHouseholdRequirements}'s own
 * signature matching is by member/minor id equality, so handing every household the full season
 * list is correct and needs no household-id correlation on the signature rows themselves, which
 * carry none). A household-scoped document (an asset-kind acknowledgement, the Dry Storage
 * Agreement) is attributed once, to its primary member, exactly as the engine already resolves it
 * for the signing flow -- this rollup counts what the signing flow itself would ask that household
 * to clear, never a second, divergent notion of "who owes this".
 */
export function deriveSeasonDocumentSummaries(
  publishedDocuments: Map<string, SignableDocument>,
  households: HouseholdRosterInput[],
  season: number,
  signatures: SignatureRecord[],
): SeasonDocumentSummary[] {
  const summaries = new Map<string, SeasonDocumentSummary>();

  function summaryFor(document: SignableDocument): SeasonDocumentSummary {
    const id = document.frontmatter.document;
    let summary = summaries.get(id);
    if (!summary) {
      summary = {
        documentId: id,
        title: document.frontmatter.title,
        kind: document.frontmatter.kind,
        audience: document.frontmatter.audience,
        version: document.frontmatter.version,
        signed: [],
        outstanding: [],
      };
      summaries.set(id, summary);
    }
    return summary;
  }

  // Every published document appears even with zero applicable people right now (an asset-kind
  // document nobody currently holds still needs to show 0/0, not vanish from the rollup).
  for (const document of publishedDocuments.values()) summaryFor(document);

  for (const household of households) {
    const requirements = deriveHouseholdRequirements({
      season,
      primaryMemberId: household.primaryMemberId,
      members: household.members,
      assetKinds: household.assetKinds,
      publishedDocuments,
      signatures,
    });

    for (const adult of requirements.adults) {
      for (const requirement of adult.requirements) {
        const summary = summaryFor(requirement.document);
        const entry: DocumentRosterEntry = {
          personId: adult.memberId,
          personName: adult.memberName,
          householdId: household.id,
          signature: requirement.signature,
        };
        (requirement.signed ? summary.signed : summary.outstanding).push(entry);
      }
    }

    for (const minor of requirements.minors) {
      const summary = summaryFor(minor.document);
      const entry: DocumentRosterEntry = {
        personId: minor.minorMemberId,
        personName: minor.minorName,
        householdId: household.id,
        signature: minor.signature,
      };
      (minor.signed ? summary.signed : summary.outstanding).push(entry);
    }
  }

  return [...summaries.values()].sort((a, b) => a.title.localeCompare(b.title));
}

interface HouseholdMemberRawRow {
  household_id: string;
  primary_member_id: string | null;
  member_id: string;
  member_name: string;
  birthdate: string | null;
}

interface HouseholdAssignmentRawRow {
  household_id: string;
  asset_type: string;
}

interface SignatureRawRow {
  id: string;
  document_id: string;
  season: number;
  member_id: string | null;
  minor_member_id: string | null;
  signed_at: string;
}

/**
 * {@link deriveSeasonDocumentSummaries} for the whole club (member-waivers T6): three bulk
 * queries (every listed household's roster, every active asset holding, every one of the
 * season's own signature rows), grouped in memory, then handed to the pure derivation -- never a
 * per-household round trip, unlike `waiver-requirements.ts`'s own single-household
 * `loadHouseholdRequirements`, since this rollup needs every household at once. A household with
 * `left_at` set (merged away, `household-surgery.ts`) or with no non-archived member is excluded
 * by construction (the inner join only visits a household through a live member row).
 */
export async function loadSeasonDocumentSummaries(
  db: D1Database,
  publishedDocuments: Map<string, SignableDocument>,
  season: number,
): Promise<SeasonDocumentSummary[]> {
  const [membersResult, assignmentsResult, signaturesResult] = await Promise.all([
    db
      .prepare(
        `SELECT h.id AS household_id, h.primary_member_id, m.id AS member_id, m.name AS member_name, m.birthdate
         FROM households h
         JOIN members m ON m.household_id = h.id AND m.archived_at IS NULL
         WHERE h.left_at IS NULL
         ORDER BY h.id, m.name`,
      )
      .all<HouseholdMemberRawRow>(),
    db
      .prepare(
        `SELECT m.household_id, aa.asset_type
         FROM asset_assignments aa
         JOIN memberships m ON m.id = aa.membership_id
         WHERE aa.status = 'active'`,
      )
      .all<HouseholdAssignmentRawRow>(),
    db
      .prepare(
        `SELECT id, document_id, season, member_id, minor_member_id, signed_at
         FROM waiver_acceptances
         WHERE season = ?1 AND document_id IS NOT NULL`,
      )
      .bind(season)
      .all<SignatureRawRow>(),
  ]);

  const householdsById = new Map<string, HouseholdRosterInput>();
  for (const row of membersResult.results) {
    let household = householdsById.get(row.household_id);
    if (!household) {
      household = { id: row.household_id, primaryMemberId: row.primary_member_id, members: [], assetKinds: [] };
      householdsById.set(row.household_id, household);
    }
    household.members.push({ id: row.member_id, name: row.member_name, birthdate: row.birthdate });
  }
  for (const row of assignmentsResult.results) {
    const household = householdsById.get(row.household_id);
    const assetKind = row.asset_type as AssetKind;
    if (household && !household.assetKinds.includes(assetKind)) household.assetKinds.push(assetKind);
  }

  const signatures: SignatureRecord[] = signaturesResult.results.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    season: row.season,
    memberId: row.member_id,
    minorMemberId: row.minor_member_id,
    signedAt: row.signed_at,
  }));

  return deriveSeasonDocumentSummaries(publishedDocuments, [...householdsById.values()], season, signatures);
}

/** One signature row for a member's own history list (member-waivers T6): light enough for a
 *  scannable list, linking through to {@link getSignatureDetail}'s full record for the frozen text
 *  and the certificate. `onBehalfOfMinorId`/`onBehalfOfMinorName` are set only for a Part Two row
 *  this member signed as the parent/guardian, distinguishing it from the member's own document at a
 *  glance. */
export interface SignatureHistoryRow {
  id: string;
  documentId: string;
  version: number;
  season: number;
  kind: DocumentKind;
  context: string;
  signedAt: string;
  onBehalfOfMinorId: string | null;
  onBehalfOfMinorName: string | null;
}

interface SignatureHistoryRawRow {
  id: string;
  document_id: string;
  version: number;
  season: number;
  kind: DocumentKind;
  context: string;
  signed_at: string;
  member_id: string | null;
  minor_member_id: string | null;
  minor_name: string | null;
}

/**
 * Every signature naming `memberId`, either as the signer (their own document) or as the minor a
 * parent signed for (their own Part Two election), most recent first (member-waivers T6). Reachable
 * from the member's own admin desk (`/admin/club/members/[id]`) and from a document's drill-through
 * roster alike.
 */
export async function listMemberSignatureHistory(db: D1Database, memberId: string): Promise<SignatureHistoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT wa.id, wa.document_id, wa.version, wa.season, wa.kind, wa.context, wa.signed_at,
              wa.member_id, wa.minor_member_id, minor.name AS minor_name
       FROM waiver_acceptances wa
       LEFT JOIN members minor ON minor.id = wa.minor_member_id
       WHERE wa.document_id IS NOT NULL AND (wa.member_id = ?1 OR wa.minor_member_id = ?1)
       ORDER BY wa.signed_at DESC`,
    )
    .bind(memberId)
    .all<SignatureHistoryRawRow>();
  return results.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    version: row.version,
    season: row.season,
    kind: row.kind,
    context: row.context,
    signedAt: row.signed_at,
    onBehalfOfMinorId: row.member_id === memberId ? row.minor_member_id : null,
    onBehalfOfMinorName: row.member_id === memberId ? row.minor_name : null,
  }));
}

/** One member's identity as much as the history page's header needs. */
export interface MemberIdentityRow {
  id: string;
  name: string;
  householdId: string;
}

/** The member a signature history page is about, `null` for an id with no `members` row. */
export async function getMemberIdentity(db: D1Database, memberId: string): Promise<MemberIdentityRow | null> {
  const row = await db.prepare('SELECT id, name, household_id FROM members WHERE id = ?1').bind(memberId).first<{ id: string; name: string; household_id: string }>();
  return row ? { id: row.id, name: row.name, householdId: row.household_id } : null;
}

/** One signature record in full (member-waivers T6): every 0029 column the frozen-text view and
 *  the certificate-of-completion both read, joined out to the signer's and the minor's own current
 *  names (never bare ids). `documentId`/`version` resolve the exact snapshot's own file through
 *  `$theme/documents.ts`'s `loadDocumentVersion` at the route layer, which this module does not
 *  import (it stays free of the `ContentIndex`/`$chassis` coupling, matching `waiver-
 *  requirements.ts`'s own boundary). */
export interface SignatureDetailRow {
  id: string;
  documentId: string;
  version: number;
  season: number;
  kind: DocumentKind;
  contentHash: string | null;
  contentSnapshot: string | null;
  personName: string;
  personEmail: string;
  context: string;
  signedAt: string;
  ipAddress: string | null;
  memberId: string | null;
  memberName: string | null;
  minorMemberId: string | null;
  minorName: string | null;
  signerRelationship: string | null;
  authTokenId: string | null;
  authIssuedAt: string | null;
  authConsumedAt: string | null;
  buildHash: string | null;
}

interface SignatureDetailRawRow {
  id: string;
  document_id: string;
  version: number;
  season: number;
  kind: DocumentKind;
  content_hash: string | null;
  content_snapshot: string | null;
  person_name: string;
  person_email: string;
  context: string;
  signed_at: string;
  ip_address: string | null;
  member_id: string | null;
  member_name: string | null;
  minor_member_id: string | null;
  minor_name: string | null;
  signer_relationship: string | null;
  auth_token_id: string | null;
  auth_issued_at: string | null;
  auth_consumed_at: string | null;
  build_hash: string | null;
}

/** One signature record's full evidence, `null` for an unknown id -- the frozen-text view and the
 *  certificate-of-completion view both read this same row. */
export async function getSignatureDetail(db: D1Database, id: string): Promise<SignatureDetailRow | null> {
  const row = await db
    .prepare(
      `SELECT wa.id, wa.document_id, wa.version, wa.season, wa.kind, wa.content_hash, wa.content_snapshot,
              wa.person_name, wa.person_email, wa.context, wa.signed_at, wa.ip_address,
              wa.member_id, member.name AS member_name,
              wa.minor_member_id, minor.name AS minor_name,
              wa.signer_relationship, wa.auth_token_id, wa.auth_issued_at, wa.auth_consumed_at, wa.build_hash
       FROM waiver_acceptances wa
       LEFT JOIN members member ON member.id = wa.member_id
       LEFT JOIN members minor ON minor.id = wa.minor_member_id
       WHERE wa.id = ?1 AND wa.document_id IS NOT NULL`,
    )
    .bind(id)
    .first<SignatureDetailRawRow>();
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    version: row.version,
    season: row.season,
    kind: row.kind,
    contentHash: row.content_hash,
    contentSnapshot: row.content_snapshot,
    personName: row.person_name,
    personEmail: row.person_email,
    context: row.context,
    signedAt: row.signed_at,
    ipAddress: row.ip_address,
    memberId: row.member_id,
    memberName: row.member_name,
    minorMemberId: row.minor_member_id,
    minorName: row.minor_name,
    signerRelationship: row.signer_relationship,
    authTokenId: row.auth_token_id,
    authIssuedAt: row.auth_issued_at,
    authConsumedAt: row.auth_consumed_at,
    buildHash: row.build_hash,
  };
}
