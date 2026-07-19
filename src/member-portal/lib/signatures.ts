// The signing flow's server-side record write (member-waivers T4,
// docs/2026-07-17-member-waivers-design.md "The signature record", "Minors", and "The Mat-Su
// Borough flow-down"): records one typed-name signature into `waiver_acceptances` (0029) with
// everything the spec's record defines, and records the contact-confirmation into
// `contact_confirmations` (0030) for a storage or mooring holder's glance-and-confirm step. The
// legal weight lives here, in the row, not in the repo file (decision 5): the snapshot is taken
// from the exact document body served and re-read at write time, the hash is the SHA-256 of that
// snapshot, and the auth event backing the session is captured alongside the IP so attribution
// rests on the strong signal (the magic-link event), not the weak one (the IP).
//
// The pure requirement engine ($member-portal/lib/waiver-requirements.ts, T3) decides WHICH
// documents apply and whether each is already signed; this module is the WRITE path, and it
// re-checks the already-signed condition itself so a double submit (a member double-clicks Sign,
// or reloads a stale page) is a no-op rather than a duplicate row.
import type { D1Database } from '@cloudflare/workers-types';
import type { DocumentKind, SignableDocument } from '$theme/documents';
import { normalizeEmail, normalizePhoneE164 } from '$admin-club/lib/member-normalize.js';

/** The five money-moment contexts 0029's `context` CHECK admits. The signing page carries one
 *  page-level context (the entry flow's reason: a standalone portal visit defaults to `renewal`;
 *  the join/renewal/asset-fee flows T5 wires pass their own). */
export const SIGNING_CONTEXTS = ['join', 'renewal', 'class-signup', 'mooring-fee', 'storage-fee'] as const;
export type SigningContext = (typeof SIGNING_CONTEXTS)[number];

/** True when `value` is one of the five valid contexts, for validating a `?context=` param. */
export function isSigningContext(value: string): value is SigningContext {
  return (SIGNING_CONTEXTS as readonly string[]).includes(value);
}

/** AS 09.65.292(c)'s enumerated signer categories (0029's `signer_relationship` CHECK). The
 *  labels are the general release's own "Who may sign" list, so the attestation radios read
 *  exactly the words the signed document uses. */
export const SIGNER_RELATIONSHIPS = [
  { value: 'parent', label: 'A natural or adoptive parent' },
  { value: 'legal-guardian', label: 'A legal guardian or court-appointed representative' },
  { value: 'agency-representative', label: 'A representative of an agency with custody of the child' },
  { value: 'power-of-attorney', label: 'The holder of a power of attorney for the child' },
  { value: 'qualifying-relative', label: 'A grandparent, aunt, uncle, or adult sibling who resides with the child' },
] as const;
export type SignerRelationship = (typeof SIGNER_RELATIONSHIPS)[number]['value'];

/** True when `value` is one of the five statutory relationships. */
export function isSignerRelationship(value: string): value is SignerRelationship {
  return SIGNER_RELATIONSHIPS.some((relationship) => relationship.value === value);
}

/** The lowercase hex SHA-256 of a text, the exact shape 0029's `content_hash` stores and the
 *  freeze guard (`document-freeze-guard.test.ts`) computes. Mirrors `$member-auth/lib/crypto.ts`'s
 *  own `hashMemberToken` digest-to-hex, over the document snapshot rather than a token. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The auth event backing a signing session (0029's `auth_token_id`/`auth_issued_at`/
 *  `auth_consumed_at`): the magic-link token that minted the session, and its issuance and
 *  consumption timestamps snapshotted so the signature record stands on its own even if the token
 *  row is later pruned. */
export interface SessionAuthEvent {
  tokenId: string;
  issuedAt: string;
  consumedAt: string;
}

/**
 * Resolve the magic-link auth event behind a live session. `member_sessions` carries no direct
 * link to the token it was born from (`0009_member_auth`'s schema), so this reconstructs it: a
 * session is created (`createMemberSession`) in the same request that consumes its token
 * (`confirmMemberToken`), a moment after the consume, so the token whose `consumed_at` is the
 * latest at or before the session's own `created_at`, for that session's member, is the one that
 * minted it. Returns `null` for a session with no traceable consumed token (an inconsistent edge,
 * or a legacy session predating any token): the caller records the signature with null auth fields
 * rather than refusing, since the IP and the authenticated member id still attribute it.
 */
export async function resolveSessionAuthEvent(db: D1Database, sessionId: string): Promise<SessionAuthEvent | null> {
  const row = await db
    .prepare(
      `SELECT t.id AS token_id, t.created_at AS issued_at, t.consumed_at AS consumed_at
       FROM member_sessions s
       JOIN member_tokens t ON t.member_id = s.member_id
       WHERE s.id = ?1 AND t.consumed_at IS NOT NULL AND t.consumed_at <= s.created_at
       ORDER BY t.consumed_at DESC
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ token_id: string; issued_at: string; consumed_at: string }>();
  return row ? { tokenId: row.token_id, issuedAt: row.issued_at, consumedAt: row.consumed_at } : null;
}

/** One signature row the moment reads back (member-waivers T4): the fields the view needs that the
 *  T3 engine's own minimal `SignatureRecord` does not carry -- the name as typed (for the receipt
 *  and the "type once" prefill) and the attested relationship (for the carry-forward). */
export interface MomentSignatureRow {
  documentId: string;
  memberId: string | null;
  minorMemberId: string | null;
  personName: string;
  signerRelationship: string | null;
  signedAt: string;
}

/**
 * Every signature this household's own members hold for `season`, with the extra fields the moment
 * view needs. One bounded query, matching `waiver-requirements.ts`'s own household-scoped read.
 */
export async function loadMomentSignatures(db: D1Database, householdId: string, season: number): Promise<MomentSignatureRow[]> {
  const { results } = await db
    .prepare(
      `SELECT document_id, member_id, minor_member_id, person_name, signer_relationship, signed_at
       FROM waiver_acceptances
       WHERE season = ?1
         AND document_id IS NOT NULL
         AND (member_id IN (SELECT id FROM members WHERE household_id = ?2)
              OR minor_member_id IN (SELECT id FROM members WHERE household_id = ?2))`,
    )
    .bind(season, householdId)
    .all<{
      document_id: string;
      member_id: string | null;
      minor_member_id: string | null;
      person_name: string;
      signer_relationship: string | null;
      signed_at: string;
    }>();
  return results.map((row) => ({
    documentId: row.document_id,
    memberId: row.member_id,
    minorMemberId: row.minor_member_id,
    personName: row.person_name,
    signerRelationship: row.signer_relationship,
    signedAt: row.signed_at,
  }));
}

/** The signing member, as much as the record needs: the authenticated identity and the email that
 *  goes on the row's `person_email` (0029's one NOT NULL contact column). */
export interface SigningMember {
  id: string;
  email: string | null;
}

/** Input to record one signature. `minor` is present only for a Part Two election: it names the
 *  child (from the household roster, never free-typed) and the attested statutory relationship. */
export interface RecordSignatureInput {
  member: SigningMember;
  document: SignableDocument;
  season: number;
  context: SigningContext;
  /** The name as typed by the signer; rejected empty/whitespace. */
  typedName: string;
  ipAddress: string | null;
  buildHash: string;
  authEvent: SessionAuthEvent | null;
  minor?: { memberId: string; relationship: SignerRelationship };
}

/** `recordSignature`'s result: `noop: true` when the requirement was already satisfied (a
 *  no-op, not an error), `noop: false` when a fresh row was written, and an `{ ok: false }` refusal
 *  only for a genuinely bad input (an empty typed name). */
export type RecordSignatureResult = { ok: true; noop: boolean } | { ok: false; error: string };

/** Whether a signature already exists for this document/season and this signer or minor. A
 *  personal signature is the member's own row with no minor; a minor signature matches the child
 *  regardless of which adult signed it (any adult's election satisfies the child's requirement). */
async function signatureExists(db: D1Database, documentId: string, season: number, memberId: string, minorMemberId: string | null): Promise<boolean> {
  const row = minorMemberId
    ? await db
        .prepare('SELECT 1 AS present FROM waiver_acceptances WHERE document_id = ?1 AND season = ?2 AND minor_member_id = ?3 LIMIT 1')
        .bind(documentId, season, minorMemberId)
        .first<{ present: number }>()
    : await db
        .prepare('SELECT 1 AS present FROM waiver_acceptances WHERE document_id = ?1 AND season = ?2 AND member_id = ?3 AND minor_member_id IS NULL LIMIT 1')
        .bind(documentId, season, memberId)
        .first<{ present: number }>();
  return row !== null;
}

/**
 * Record one typed-name signature (member-waivers T4). Rejects an empty/whitespace typed name;
 * returns a no-op when the requirement is already satisfied (a double submit or a stale reload);
 * otherwise snapshots the exact document body served, hashes it, and writes the full 0029 record
 * including the auth event, the IP, the build hash, and (for a Part Two) the minor id and attested
 * relationship. The snapshot is `document.body` verbatim -- the same canonical text the freeze
 * guard hashes -- so the stored `content_hash` matches the frozen version and reproduces the
 * signed record independent of the repo.
 */
export async function recordSignature(db: D1Database, input: RecordSignatureInput): Promise<RecordSignatureResult> {
  const typedName = input.typedName.trim();
  if (!typedName) return { ok: false, error: 'Type your full legal name to sign.' };

  const documentId = input.document.frontmatter.document;
  const minorMemberId = input.minor?.memberId ?? null;

  if (await signatureExists(db, documentId, input.season, input.member.id, minorMemberId)) {
    return { ok: true, noop: true };
  }

  const snapshot = input.document.body;
  const contentHash = await sha256Hex(snapshot);
  const kind: DocumentKind = input.document.frontmatter.kind;

  await db
    .prepare(
      `INSERT INTO waiver_acceptances
         (id, document_id, version, season, kind, content_hash, content_snapshot, person_name, person_email,
          context, ip_address, member_id, auth_token_id, auth_issued_at, auth_consumed_at, build_hash,
          signer_relationship, minor_member_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)`,
    )
    .bind(
      crypto.randomUUID(),
      documentId,
      input.document.frontmatter.version,
      input.season,
      kind,
      contentHash,
      snapshot,
      typedName,
      input.member.email ?? '',
      input.context,
      input.ipAddress,
      input.member.id,
      input.authEvent?.tokenId ?? null,
      input.authEvent?.issuedAt ?? null,
      input.authEvent?.consumedAt ?? null,
      input.buildHash,
      input.minor?.relationship ?? null,
      minorMemberId,
    )
    .run();

  return { ok: true, noop: false };
}

/** The contact values a confirmation snapshots, already normalized. */
export interface ContactValues {
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

/** The raw contact fields the "Update it" form submits, before normalization. */
export interface ContactUpdateInput {
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

/** Normalize contact fields on write (member-waivers T4 rule 4): email lowercased, phone to E.164
 *  (falling back to the trimmed input when it does not parse, the lenient posture household adds
 *  use, since a member confirming reachability should never be blocked over a phone format), every
 *  other field trimmed, an empty field stored as `null`. Pure, so the confirmation snapshot and the
 *  live-record update both derive from one function. */
export function normalizeContact(input: ContactUpdateInput): ContactValues {
  const trimOrNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };
  const emailTrimmed = normalizeEmail(input.email);
  const phoneTrimmed = input.phone.trim();
  return {
    email: emailTrimmed === '' ? null : emailTrimmed,
    phone: phoneTrimmed === '' ? null : (normalizePhoneE164(phoneTrimmed) ?? phoneTrimmed),
    addressLine1: trimOrNull(input.addressLine1),
    addressLine2: trimOrNull(input.addressLine2),
    city: trimOrNull(input.city),
    state: trimOrNull(input.state),
    postalCode: trimOrNull(input.postalCode),
  };
}

/**
 * Apply an updated contact set to the live records (member-waivers T4 rule 4): normalizes the
 * input, writes the member's own email and phone and the household's mailing address (so the club
 * can actually reach the member, the whole point of the Borough 72-hour clock), and returns the
 * normalized values for the confirmation snapshot. The member row and household row are updated
 * separately, matching how the profile and household screens each own their own write.
 */
export async function applyContactUpdate(db: D1Database, memberId: string, householdId: string, input: ContactUpdateInput): Promise<ContactValues> {
  const values = normalizeContact(input);
  await db
    .prepare("UPDATE members SET email = ?1, phone = ?2 WHERE id = ?3")
    .bind(values.email, values.phone, memberId)
    .run();
  await db
    .prepare("UPDATE households SET address_line1 = ?1, address_line2 = ?2, city = ?3, state = ?4, postal_code = ?5, updated_at = datetime('now') WHERE id = ?6")
    .bind(values.addressLine1, values.addressLine2, values.city, values.state, values.postalCode, householdId)
    .run();
  return values;
}

/** Whether this member already confirmed their contact info for `season`, so the moment shows the
 *  glance-and-confirm step once per season rather than on every visit. */
export async function hasContactConfirmation(db: D1Database, memberId: string, season: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS present FROM contact_confirmations WHERE member_id = ?1 AND season = ?2 LIMIT 1')
    .bind(memberId, season)
    .first<{ present: number }>();
  return row !== null;
}

/** Input to record a contact confirmation. */
export interface RecordContactConfirmationInput {
  memberId: string;
  householdId: string;
  season: number;
  context: SigningContext;
  values: ContactValues;
}

/** Record a contact confirmation (0030): snapshots the confirmed values so the record proves the
 *  member affirmed their contact info at signing time, independent of any later profile edit. */
export async function recordContactConfirmation(db: D1Database, input: RecordContactConfirmationInput): Promise<void> {
  const { values } = input;
  await db
    .prepare(
      `INSERT INTO contact_confirmations
         (id, member_id, household_id, season, context, email, phone, address_line1, address_line2, city, state, postal_code)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    )
    .bind(
      crypto.randomUUID(),
      input.memberId,
      input.householdId,
      input.season,
      input.context,
      values.email,
      values.phone,
      values.addressLine1,
      values.addressLine2,
      values.city,
      values.state,
      values.postalCode,
    )
    .run();
}
