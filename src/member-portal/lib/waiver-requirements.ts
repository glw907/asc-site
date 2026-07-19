// The member-waivers requirement engine (member-waivers T3, docs/2026-07-17-member-waivers-design.md
// ratified decisions 1, 6, 7, and 9, and the "Minors" section): given a household's members, the
// asset kinds it holds this season, the season's own published documents ($theme/documents.ts's T1
// loader), and the household's existing signature rows, derive who still owes a signature and who
// has one on file. `deriveHouseholdRequirements` is the pure seam (a plain object in, a plain object
// out, following `documents.ts`'s own resolve/load pairing and the directory pass's
// pure-`standingWindowFromPaidAt`-plus-bounded-queries pattern); `loadHouseholdRequirements` is the
// thin, non-pure wrapper the signing routes (T4/T5) and the household-complete gate actually call,
// built on this module's own household/asset reads (`household.ts`'s `getHouseholdInfo` and
// `listHouseholdMembers`, `assets.ts`'s `listHouseholdAssignments`) plus one bounded
// `waiver_acceptances` query, so it duplicates none of their SQL.
//
// STATED ASSUMPTION (rule 1 of this task): asset-kind and dry-storage documents are HOUSEHOLD-level
// requirements, not per-adult ones -- the schema attaches holdings to `memberships`
// (`asset_assignments.membership_id`, 0007_assets_email's own "assets attach to MEMBERSHIPS, never
// members" header), not to any individual member. One signature per household satisfies such a
// requirement, and the household's own `primary_member_id` is the natural, and only, signer this
// pass recognizes for it; every other adult's own per-person list never carries these documents.
//
// Audience 'youth-class' documents (the youth medical form) resolve but derive no requirement here
// (rule 1): the structured per-class medical-data flow is post-v1, so this engine only ever
// recognizes that such a document exists, never requires it.
import type { D1Database } from '@cloudflare/workers-types';
import type { DocumentAudience, SignableDocument } from '$theme/documents';
import { computeAge } from './age-gate';
import { getHouseholdInfo, listHouseholdMembers } from './household';
import { listHouseholdAssignments } from './assets';
import { householdSignatureGate } from './household-signature-gate';

/** The four holdable asset kinds (`asset_types.id`, `migrations/asc-club/0007_assets_email`): the
 *  audience vocabulary minus the three non-asset audiences. */
export type AssetKind = Exclude<DocumentAudience, 'all-members' | 'dry-storage' | 'youth-class'>;

/** The three asset kinds the single Dry Storage Agreement covers (its own drafting notes: "one
 *  agreement covering all three"), on top of each kind's own per-asset acknowledgement. */
const DRY_STORAGE_KINDS: ReadonlySet<AssetKind> = new Set(['rv-parking', 'boat-parking', 'small-boat-rack']);

/** Alaska's ordinary age of majority, the threshold AS 09.65.292's parental election in the
 *  "Minors" spec section turns on -- distinct from `age-gate.ts`'s own 8-12/13+ class tracks, which
 *  sort members into curriculum, not into this statute's adult/minor line. */
const ADULT_MIN_AGE = 18;

/** One household member, as much as this engine needs: identity, name, and the civil-date
 *  birthdate the minor determination reads (`members.birthdate`). A member with no birthdate on
 *  file reads as an adult -- the same permissive default `age-gate.ts`'s own eligibility check
 *  documents for a member who has never supplied one, rather than this engine silently requiring a
 *  Part Two signature nobody can complete. */
export interface HouseholdMemberInput {
  id: string;
  name: string;
  birthdate: string | null;
}

/** One existing `waiver_acceptances` row, the fields this engine matches against: which document
 *  (business id, not the versioned content-entry id) and season it signs, and who signed it -- the
 *  authenticated adult (`memberId`) for their own documents, or the minor the signature covers
 *  (`minorMemberId`) for a Part Two election. Rule 3: matching is by document id plus season only,
 *  never by version, so a mid-season new version never invalidates an existing same-season
 *  signature. */
export interface SignatureRecord {
  id: string;
  documentId: string;
  season: number;
  memberId: string | null;
  minorMemberId: string | null;
  signedAt: string;
}

/** One document's requirement state for the person it is attached to. `scope` names who can
 *  satisfy it: `'personal'` documents are signed by the member themself; `'household'` documents
 *  (asset-kind and dry-storage) are satisfied once by the household's primary member (this
 *  module's own stated assumption, see header) and only ever appear on the primary's own list. */
export interface DocumentRequirement {
  document: SignableDocument;
  scope: 'personal' | 'household';
  signed: boolean;
  signature: SignatureRecord | null;
}

/** One adult member's own applicable documents: their personal all-members documents, plus (when
 *  they are the household's primary member) the household's asset-kind and dry-storage documents. */
export interface PersonRequirements {
  memberId: string;
  memberName: string;
  requirements: DocumentRequirement[];
}

/** One minor's own Part Two requirement under one release document: satisfied by a signature row
 *  carrying `minorMemberId === minorMemberId`, signed by any adult (rule 2: a signer's attested
 *  relationship lives on the signature record, not gated here -- this engine only asks whether the
 *  election is on file). */
export interface MinorRequirement {
  minorMemberId: string;
  minorName: string;
  document: SignableDocument;
  signed: boolean;
  signature: SignatureRecord | null;
}

/** A household's full requirement picture for one season: every adult's own applicable documents
 *  (including, for the primary, the household-wide ones), and every minor's own Part Two
 *  requirements. */
export interface HouseholdRequirements {
  season: number;
  adults: PersonRequirements[];
  minors: MinorRequirement[];
}

export interface DeriveHouseholdRequirementsInput {
  season: number;
  /** `households.primary_member_id`; `null` only for the deferred-primary instant a household is
   *  created in (0007_assets_email's own header) -- no household-wide document attaches to anyone
   *  in that state. */
  primaryMemberId: string | null;
  /** Every household member, adults and minors alike (an archived member is the caller's own
   *  concern to exclude; this engine trusts the list it is given). */
  members: HouseholdMemberInput[];
  /** The asset kinds the household actively holds this season (rule 1: presence, not the specific
   *  assignment). */
  assetKinds: AssetKind[];
  /** The season's own published documents, keyed by document business id -- `$theme/documents.ts`'s
   *  `resolvePublishedDocuments`/`loadPublishedDocuments` output, taken as-is (rule 4: an empty map
   *  yields an empty result throughout). */
  publishedDocuments: Map<string, SignableDocument>;
  /** Every signature row relevant to this household for `season` (both members' own and any minor
   *  Part Two elections); a row for a different season never matches (rule 3, fresh per season). */
  signatures: SignatureRecord[];
  /** The instant minor status is computed as of; defaults to now. */
  asOf?: Date;
}

function isMinor(member: HouseholdMemberInput, asOf: Date): boolean {
  if (!member.birthdate) return false;
  return computeAge(member.birthdate, asOf) < ADULT_MIN_AGE;
}

function documentsForAudience(published: Map<string, SignableDocument>, audience: DocumentAudience): SignableDocument[] {
  return [...published.values()].filter((doc) => doc.frontmatter.audience === audience);
}

/** The first signature matching `documentId`/`season` and `matches` -- `signatures` is small (one
 *  household's own rows for one season), so a linear scan needs no index. */
function findSignature(signatures: SignatureRecord[], documentId: string, season: number, matches: (signature: SignatureRecord) => boolean): SignatureRecord | null {
  return signatures.find((signature) => signature.documentId === documentId && signature.season === season && matches(signature)) ?? null;
}

/**
 * Derive a household's full requirement picture for `input.season` (member-waivers T3): pure, no
 * database access. Every published 'all-members' document is a personal requirement for each adult
 * member, satisfied only by that adult's own signature (never another adult's, rule 2's own "one
 * adult never satisfies another adult's requirement"). Every held asset kind's own document, plus
 * the Dry Storage Agreement for any of the three dry kinds (deduplicated when several dry kinds are
 * held), is a household-wide requirement attached to the primary member's own list, satisfied by the
 * primary's own signature. Every 'release'-kind 'all-members' document additionally opens a Part Two
 * requirement for each minor member, satisfied by any adult's signature naming that minor.
 */
export function deriveHouseholdRequirements(input: DeriveHouseholdRequirementsInput): HouseholdRequirements {
  const asOf = input.asOf ?? new Date();
  const { season, publishedDocuments, signatures } = input;

  const adultMembers = input.members.filter((member) => !isMinor(member, asOf));
  const minorMembers = input.members.filter((member) => isMinor(member, asOf));

  // The flagged edge (member-waivers T5b): `primaryMemberId` can point at a member this household
  // no longer counts as an active adult (an admin archived the household's own primary, rather
  // than the self-serve `removeHouseholdMember` path this module's own header already documents as
  // refusing that). Falling through to `input.primaryMemberId` unmodified would attach every
  // household-wide document (an asset-kind acknowledgement, the Dry Storage Agreement) to nobody's
  // own list at all -- a held asset's own requirement would simply vanish rather than surface, the
  // exact defect a held asset "still surfaces its requirement rather than vanishing" exists to
  // prevent. The fallback is deterministic (the first active adult, in `input.members`'s own
  // order -- `listHouseholdMembers`'s `ORDER BY name`), so which adult owes the household's
  // documents never depends on iteration order or which adult happens to load the signing page
  // first.
  const primaryMemberId =
    input.primaryMemberId && adultMembers.some((member) => member.id === input.primaryMemberId)
      ? input.primaryMemberId
      : (adultMembers[0]?.id ?? null);

  const allMembersDocuments = documentsForAudience(publishedDocuments, 'all-members');

  const householdAudiences = new Set<DocumentAudience>();
  for (const kind of input.assetKinds) {
    householdAudiences.add(kind);
    if (DRY_STORAGE_KINDS.has(kind)) householdAudiences.add('dry-storage');
  }
  const householdDocuments: SignableDocument[] = [];
  const seenHouseholdDocumentIds = new Set<string>();
  for (const audience of householdAudiences) {
    for (const doc of documentsForAudience(publishedDocuments, audience)) {
      if (seenHouseholdDocumentIds.has(doc.frontmatter.document)) continue;
      seenHouseholdDocumentIds.add(doc.frontmatter.document);
      householdDocuments.push(doc);
    }
  }

  const adults: PersonRequirements[] = adultMembers.map((member) => {
    const requirements: DocumentRequirement[] = allMembersDocuments.map((doc) => {
      const signature = findSignature(signatures, doc.frontmatter.document, season, (s) => s.memberId === member.id && s.minorMemberId === null);
      return { document: doc, scope: 'personal', signed: signature !== null, signature };
    });

    if (member.id === primaryMemberId) {
      for (const doc of householdDocuments) {
        const signature = findSignature(signatures, doc.frontmatter.document, season, (s) => s.memberId === primaryMemberId && s.minorMemberId === null);
        requirements.push({ document: doc, scope: 'household', signed: signature !== null, signature });
      }
    }

    return { memberId: member.id, memberName: member.name, requirements };
  });

  const releaseDocuments = allMembersDocuments.filter((doc) => doc.frontmatter.kind === 'release');
  const minors: MinorRequirement[] = minorMembers.flatMap((minor) =>
    releaseDocuments.map((doc) => {
      const signature = findSignature(signatures, doc.frontmatter.document, season, (s) => s.minorMemberId === minor.id);
      return { minorMemberId: minor.id, minorName: minor.name, document: doc, signed: signature !== null, signature };
    }),
  );

  return { season, adults, minors };
}

/**
 * Every unsigned household-scoped document that gates `assetKind`'s own money moment
 * (member-waivers T5b, spec rule 7's asset-fee gate): the asset kind's own per-asset
 * acknowledgement (`document.frontmatter.audience === assetKind`), plus, for a dry-storage kind,
 * the Dry Storage Agreement (`audience === 'dry-storage'`) alongside it. Scans every adult's own
 * `'household'`-scope requirements rather than trusting a single primary id, since
 * {@link deriveHouseholdRequirements}'s own fallback can already have attached them to whichever
 * adult qualified; an empty result gates nothing (either every applicable document is signed, or
 * none is published for the season -- the shipped pass-through).
 */
export function outstandingAssetDocuments(requirements: HouseholdRequirements, assetKind: AssetKind): DocumentRequirement[] {
  const audiences = new Set<DocumentAudience>([assetKind]);
  if (DRY_STORAGE_KINDS.has(assetKind)) audiences.add('dry-storage');
  return requirements.adults.flatMap((adult) =>
    adult.requirements.filter((r) => r.scope === 'household' && !r.signed && audiences.has(r.document.frontmatter.audience)),
  );
}

/**
 * The one adult who can actually satisfy a household-scoped document (member-waivers T5b fix
 * round): {@link deriveHouseholdRequirements}'s own header states the household's asset-kind and
 * dry-storage documents attach to, and can only ever be signed by, one adult -- the primary, or
 * (its own flagged fallback) the first active adult when the primary is no longer one. By
 * construction, at most one adult's own `requirements` list ever carries a `'household'`-scope
 * entry, so the first hit is sound. `null` when the household holds no asset that opens a
 * household-scoped requirement at all (nobody's list carries one).
 *
 * A caller with a real outstanding household document (e.g. the asset-fee gate) uses this to
 * distinguish the one adult who can walk into `/my-account/sign` and clear it from every other
 * adult, who cannot: the signing page's own load only ever builds a signer's items from their own
 * `PersonRequirements`, so sending anyone else there would strand them in front of an empty
 * moment.
 */
export function householdDocumentSigner(requirements: HouseholdRequirements): { memberId: string; memberName: string } | null {
  const adult = requirements.adults.find((a) => a.requirements.some((r) => r.scope === 'household'));
  return adult ? { memberId: adult.memberId, memberName: adult.memberName } : null;
}

/**
 * Whether `memberId`'s own current-season general release is on file (member-waivers T5b, spec
 * rule 7's amendment: class signup "gates on the current-season general release" for the
 * REGISTRANT specifically, on top of the household's own signature-complete standing the caller
 * checks separately). `memberId` may be an adult (checked against every one of their own
 * `'personal'`-scope `'release'`-kind requirements -- in practice just the one general release,
 * but this holds even if a future season ever published a second) or a minor (checked against
 * their own Part Two). Reads `true` when nothing applies (no release published for the season --
 * the shipped pass-through -- or `memberId` matches neither list, which this engine's own callers
 * never produce for a real active household member), so a missing release document never blocks a
 * legitimate registrant.
 */
export function hasSignedCurrentRelease(requirements: HouseholdRequirements, memberId: string): boolean {
  const adult = requirements.adults.find((a) => a.memberId === memberId);
  if (adult) {
    const releaseRequirements = adult.requirements.filter((r) => r.scope === 'personal' && r.document.frontmatter.kind === 'release');
    return releaseRequirements.every((r) => r.signed);
  }
  const minor = requirements.minors.find((m) => m.minorMemberId === memberId);
  if (minor) return minor.signed;
  return true;
}

interface SignatureRawRow {
  id: string;
  document_id: string;
  season: number;
  member_id: string | null;
  minor_member_id: string | null;
  signed_at: string;
}

/** Every signature row for `householdId`'s own members (either as the signer or the named minor)
 *  in `season`: one bounded query, matching this module's own `SignatureRecord` shape. A row with
 *  no `document_id` (a legacy pre-T2 row this migration left in place) never matches any document
 *  business id, so it is filtered out here rather than surfacing as a false negative downstream. */
async function loadHouseholdSignatures(db: D1Database, householdId: string, season: number): Promise<SignatureRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, document_id, season, member_id, minor_member_id, signed_at
       FROM waiver_acceptances
       WHERE season = ?1
         AND document_id IS NOT NULL
         AND (member_id IN (SELECT id FROM members WHERE household_id = ?2)
              OR minor_member_id IN (SELECT id FROM members WHERE household_id = ?2))`,
    )
    .bind(season, householdId)
    .all<SignatureRawRow>();
  return results.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    season: row.season,
    memberId: row.member_id,
    minorMemberId: row.minor_member_id,
    signedAt: row.signed_at,
  }));
}

/**
 * {@link deriveHouseholdRequirements} for a real household: assembles its inputs from
 * `household.ts`'s `getHouseholdInfo`/`listHouseholdMembers`, `assets.ts`'s
 * `listHouseholdAssignments` (its own active-assignment read; holding is presence, not a
 * season-scoped column, per that module's own header), and this module's own bounded signatures
 * query, then hands them to the pure derivation. Excludes an archived member from every list (an
 * archived member owes nothing further). Returns `null` only when `householdId` does not resolve.
 */
export async function loadHouseholdRequirements(
  db: D1Database,
  publishedDocuments: Map<string, SignableDocument>,
  householdId: string,
  season: number,
): Promise<HouseholdRequirements | null> {
  const household = await getHouseholdInfo(db, householdId);
  if (!household) return null;

  const [memberRows, assignments, signatures] = await Promise.all([
    listHouseholdMembers(db, householdId),
    listHouseholdAssignments(db, householdId, season),
    loadHouseholdSignatures(db, householdId, season),
  ]);

  const members: HouseholdMemberInput[] = memberRows
    .filter((row) => row.archivedAt === null)
    .map((row) => ({ id: row.id, name: row.name, birthdate: row.birthdate }));
  const assetKinds = [...new Set(assignments.map((assignment) => assignment.assetType as AssetKind))];

  return deriveHouseholdRequirements({
    season,
    primaryMemberId: household.primaryMemberId,
    members,
    assetKinds,
    publishedDocuments,
    signatures,
  });
}

/**
 * Whether a household's signatures are complete for `season` -- the money-moment hard gate shared
 * by the renewal and join-resume doors (member-waivers T5b/T5c): `true` when the household is
 * unresolvable, or when the season carries no published documents at all
 * ({@link loadHouseholdRequirements} then returns every adult with an empty `requirements` array
 * and `householdSignatureGate` reads that as complete -- the shipped state today, since every real
 * document is still `status: draft`), so this never blocks a real money moment until the attorney
 * actually publishes a document.
 */
export async function householdSignaturesComplete(
  db: D1Database,
  publishedDocuments: Map<string, SignableDocument>,
  householdId: string,
  season: number,
): Promise<boolean> {
  const requirements = await loadHouseholdRequirements(db, publishedDocuments, householdId, season);
  if (!requirements) return true;
  return householdSignatureGate(requirements).complete;
}
