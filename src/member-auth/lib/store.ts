// asc-club member auth: D1 access, prepared statements only. Mirrors @glw907/cairn-cms's own
// src/lib/auth/store.ts at the shape level, adapted to this schema's TEXT-datetime convention and
// its consumed_at-column single-use discipline (offers.ts's own compare-and-set lesson) rather
// than cairn's delete-on-consume (see migrations/asc-club/0008_member_auth/README.md).
import type { D1Database } from '@cloudflare/workers-types';

/** One `members` row, camelCased, as far as this store's own callers need it. */
export interface MemberRow {
  id: string;
  householdId: string;
  name: string;
  email: string | null;
  archivedAt: string | null;
}

interface MemberRawRow {
  id: string;
  household_id: string;
  name: string;
  email: string | null;
  archived_at: string | null;
}

function toMemberRow(row: MemberRawRow): MemberRow {
  return { id: row.id, householdId: row.household_id, name: row.name, email: row.email, archivedAt: row.archived_at };
}

const MEMBER_COLUMNS = 'id, household_id, name, email, archived_at';

/** Look a member up by email, case-insensitively, whether or not they are archived: the caller
 *  (`auth.ts`'s `requestMemberLink`) decides how an archived match behaves (silence, not an
 *  error), so this stays a plain lookup. */
export async function findMemberByEmail(db: D1Database, email: string): Promise<MemberRow | null> {
  const row = await db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE lower(email) = lower(?1) LIMIT 1`)
    .bind(email)
    .first<MemberRawRow>();
  return row ? toMemberRow(row) : null;
}

/** Mint a fresh member-token row. The plaintext token never reaches here; only its hash does. */
export async function issueMemberToken(
  db: D1Database,
  id: string,
  memberId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO member_tokens (id, member_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(id, memberId, tokenHash, expiresAt)
    .run();
}

/** The token row's own member, for the "send me a fresh link" pre-fill (mockup frame 09), whether
 *  or not the row is still usable (already consumed or expired): a read-only lookup, never a
 *  consume. Returns `null` for an unknown hash. */
export async function findMemberByTokenHash(db: D1Database, tokenHash: string): Promise<MemberRow | null> {
  const row = await db
    .prepare(
      `SELECT m.id AS id, m.household_id AS household_id, m.name AS name, m.email AS email, m.archived_at AS archived_at
       FROM member_tokens t JOIN members m ON m.id = t.member_id
       WHERE t.token_hash = ?1 LIMIT 1`,
    )
    .bind(tokenHash)
    .first<MemberRawRow>();
  return row ? toMemberRow(row) : null;
}

/**
 * Consume a token in one atomic conditional UPDATE, checked via `meta.changes`
 * (`src/admin-club/lib/offers.ts`'s own compare-and-set lesson: `claimOffer`'s identical shape).
 * Returns `true` only when THIS call is the one that consumed it (unexpired, not already
 * consumed); `false` otherwise, whether the token never existed, was already used, or has
 * expired, so a write-path caller sees one honest refusal for all three. `findMemberByTokenHash`
 * is the separate, read-only path for a caller that wants to know more (e.g. a pre-fill email).
 */
export async function consumeMemberToken(db: D1Database, tokenHash: string, now: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE member_tokens SET consumed_at = ?1 WHERE token_hash = ?2 AND consumed_at IS NULL AND expires_at > ?1')
    .bind(now, tokenHash)
    .run();
  return (result.meta.changes ?? 0) === 1;
}

/** Create a session row for a member. */
export async function createMemberSession(db: D1Database, id: string, memberId: string, expiresAt: string): Promise<void> {
  await db
    .prepare('INSERT INTO member_sessions (id, member_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(id, memberId, expiresAt)
    .run();
}

/** Resolve a session to its member, joining `members` so an archived member's session stops
 *  resolving on their very next request (mirrors cairn's own `resolveSession`, whose header notes
 *  the identical revoke-on-next-request effect for a removed editor). An expired session, an
 *  unknown id, and a now-archived member's session all resolve to `null` alike. */
export async function resolveMemberSession(db: D1Database, id: string, now: string): Promise<MemberRow | null> {
  const row = await db
    .prepare(
      `SELECT m.id AS id, m.household_id AS household_id, m.name AS name, m.email AS email, m.archived_at AS archived_at
       FROM member_sessions s JOIN members m ON m.id = s.member_id
       WHERE s.id = ?1 AND s.expires_at > ?2 AND m.archived_at IS NULL`,
    )
    .bind(id, now)
    .first<MemberRawRow>();
  return row ? toMemberRow(row) : null;
}

/** Delete a session (sign-out), returning the member id it belonged to, or `null` if the id was
 *  already gone, so the caller can audit as `member:<id>` without a separate read first. */
export async function deleteMemberSession(db: D1Database, id: string): Promise<string | null> {
  const row = await db
    .prepare('DELETE FROM member_sessions WHERE id = ?1 RETURNING member_id')
    .bind(id)
    .first<{ member_id: string }>();
  return row?.member_id ?? null;
}
