// The class-waitlist offer state machine (Task 7): a spot freed by a dropout is offered to one
// waitlist entry at a time through a single-use, expiring, hashed token, the same magic-link
// discipline `@glw907/cairn-cms`'s own `src/lib/auth/crypto.ts` uses for its sign-in links,
// reimplemented small here rather than importing the engine's auth internals (this module is the
// Club section's own domain, not an engine seam). `offered -> claimed | declined | expired`; once
// resolved, an offer never transitions again, and freeing the spot (`declineOffer`, an expiry) is
// deliberately not auto-chained into a next offer: the next one is always admin-triggered.
//
// Auditing splits by caller, matching this module's two genuinely different callers.
// `offerSpot` and `cancelActiveOffer` are data-only, like `classes-store.ts`'s writers, because
// their only caller is an admin route wrapped in `clubAdminAction`, whose own `ctx.audit` is the
// required, sacred audit emit (Task 6's precedent, unconditional per `adminAction`'s own
// contract). `claimOffer`, `declineOffer`, and `expireStaleOffers` have no such wrapper available:
// a token-bearer's claim or decline is a public request with no signed-in editor, and the lazy
// sweep runs from a page `load`, which `adminAction` never wraps either. All three write their
// own `audit_log` row directly (the same insert shape `audit-sink.ts` uses), as `'public:claim'`,
// `'public:decline'`, or `'system'` respectively.
import type { D1Database } from '@cloudflare/workers-types';
import { getClass, getClassWithCounts } from './classes-store';
import { getOfferWindowHours } from './club-settings';

/** How an offer was last resolved; `null` (the `class_offers.resolved` column's own default)
 *  means it is still pending. */
export type OfferResolution = 'claimed' | 'declined' | 'expired';

/** One `class_offers` row, camelCased. `tokenHash` is the stored value (`forward.sql`'s own
 *  comment: "the link's secret, hashed at rest like auth tokens"), never the plaintext token,
 *  which exists only in the moment `offerSpot` mints it. */
export interface OfferRow {
  tokenHash: string;
  waitlistId: string;
  classId: string;
  offeredBy: string;
  offeredAt: string;
  expiresAt: string;
  resolved: OfferResolution | null;
  resolvedAt: string | null;
}

/** A user-facing refusal: a capacity conflict, an already-active offer, an unknown or already-
 *  resolved token, or an expired one. Every exported function answers this shape rather than
 *  throwing, the same convention `class-form-input.ts`'s parse result already uses. */
export interface OfferActionError {
  error: string;
}

/** `offerSpot`'s success shape: the plaintext token and its expiry. The token is returned here and
 *  nowhere else again; only its hash reaches storage. */
export interface OfferMintResult {
  token: string;
  expiresAt: string;
}

/** `claimOffer`'s success shape: enough to render the public flow's confirmation, and the new
 *  enrollment's id. */
export interface OfferClaimResult {
  enrollmentId: string;
  classId: string;
  className: string;
  personName: string | null;
  personEmail: string | null;
}

const RAW_ROW_COLUMNS = `token AS token_hash, waitlist_id, class_id, offered_by, offered_at,
  expires_at, resolved, resolved_at`;

interface OfferRawRow {
  token_hash: string;
  waitlist_id: string;
  class_id: string;
  offered_by: string;
  offered_at: string;
  expires_at: string;
  resolved: OfferResolution | null;
  resolved_at: string | null;
}

function toOfferRow(row: OfferRawRow): OfferRow {
  return {
    tokenHash: row.token_hash,
    waitlistId: row.waitlist_id,
    classId: row.class_id,
    offeredBy: row.offered_by,
    offeredAt: row.offered_at,
    expiresAt: row.expires_at,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
  };
}

/** Every offer ever made for a class, most recent first: the detail screen's own need, so a
 *  resolved offer keeps rendering as a history chip rather than disappearing once claimed,
 *  declined, or expired. */
export async function listOffersForClass(db: D1Database, classId: string): Promise<OfferRow[]> {
  const { results } = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE class_id = ?1 ORDER BY offered_at DESC`)
    .bind(classId)
    .all<OfferRawRow>();
  return results.map(toOfferRow);
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** A fresh 256-bit claim token, url-safe: the plaintext the admin surfaces once, never stored. */
function generateOfferToken(): string {
  return randomBase64Url(32);
}

/** The lowercase hex SHA-256 of a token, the only form `class_offers.token` ever stores. */
export async function hashOfferToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A SQLite `datetime('now')`-shaped UTC string ("YYYY-MM-DD HH:MM:SS", no offset), so an offer's
 *  `expires_at` compares lexicographically against a database-read timestamp exactly like the
 *  rest of this schema's own datetimes already do. */
function toSqliteDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Insert one `audit_log` row directly (mirrors `audit-sink.ts`'s own insert shape): the
 *  mechanism `claimOffer`, `declineOffer`, and the lazy sweep use in place of `ctx.audit`, since
 *  none of them run inside an `adminAction`-wrapped route (see this module's own header). A
 *  failed write must never break the state transition it is auditing, which already committed;
 *  it only logs loudly, the same tradeoff `audit-sink.ts` makes. */
function writeAudit(db: D1Database, actor: string, action: string, entityId: string, detail?: string): void {
  db.prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(actor, action, 'offer', entityId, detail ?? null)
    .run()
    .catch((err: unknown) => {
      console.error('admin/club: offer audit_log insert failed', err);
    });
}

/** Resolve one offer row as `'expired'` and audit it as `actor` (`'system'` for both the lazy
 *  sweep and the on-touch checks `offerSpot`/`claimOffer` run before trusting an unresolved row).
 *  Shared so every expiry path marks and audits identically. */
async function markExpired(db: D1Database, tokenHash: string, waitlistId: string, now: string, actor = 'system'): Promise<void> {
  await db
    .prepare("UPDATE class_offers SET resolved = 'expired', resolved_at = ?1 WHERE token = ?2")
    .bind(now, tokenHash)
    .run();
  writeAudit(db, actor, 'expire', waitlistId);
}

/** The one unresolved offer for a waitlist entry, if any, after lazily expiring it in place when
 *  its window has already passed (so a stale, never-swept row can never wedge the "one active
 *  offer" rule open forever). Returns `null` when there is truly no active offer, whether because
 *  none was ever made or because this call just expired the only one that existed. */
async function activeOfferForWaitlist(db: D1Database, waitlistId: string, now: string): Promise<OfferRawRow | null> {
  const row = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE waitlist_id = ?1 AND resolved IS NULL`)
    .bind(waitlistId)
    .first<OfferRawRow>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await markExpired(db, row.token_hash, waitlistId, now);
    return null;
  }
  return row;
}

/**
 * Offer the freed spot to one waitlist entry: refuses (never throws) when the class has no free
 * capacity (`enrolled >= capacity`, i.e. there is nothing to offer) or an active offer already
 * exists for this exact waitlist entry. On success, mints a single-use token good for
 * `settings.offer_window_hours` and returns its plaintext once; only the hash reaches storage. No
 * audit write here: the caller is always an admin route wrapped in `clubAdminAction`, whose own
 * `ctx.audit` is the required emit (this module's own header).
 */
export async function offerSpot(
  db: D1Database,
  args: { classId: string; waitlistId: string; actorEmail: string },
): Promise<OfferMintResult | OfferActionError> {
  const cls = await getClassWithCounts(db, args.classId);
  if (!cls) return { error: 'No such class.' };
  if (cls.isFull) return { error: 'This class has no free spot to offer.' };

  const waitlistRow = await db
    .prepare('SELECT class_id FROM class_waitlist WHERE id = ?1')
    .bind(args.waitlistId)
    .first<{ class_id: string }>();
  if (!waitlistRow || waitlistRow.class_id !== args.classId) {
    return { error: 'No such waitlist entry for this class.' };
  }

  const now = toSqliteDatetime(new Date());
  if (await activeOfferForWaitlist(db, args.waitlistId, now)) {
    return { error: 'An offer is already active for this waitlist entry.' };
  }

  const token = generateOfferToken();
  const tokenHash = await hashOfferToken(token);
  const hours = await getOfferWindowHours(db);
  const expiresAt = toSqliteDatetime(new Date(Date.now() + hours * 60 * 60 * 1000));

  await db
    .prepare('INSERT INTO class_offers (token, waitlist_id, class_id, offered_by, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(tokenHash, args.waitlistId, args.classId, args.actorEmail, expiresAt)
    .run();

  return { token, expiresAt };
}

/**
 * Claim a spot with its offer's plaintext token: refuses an unknown token, one already resolved
 * (claimed, declined, or expired), or one past its window (lazily marking it `'expired'` first, so
 * a late claim attempt is also what sweeps it). On success, enrolls the waitlisted person and
 * removes their waitlist row (the schema carries no status column to flip instead, see
 * `classes-store.ts`'s own header on `class_enrollments`), audited as `'public:claim'`.
 */
export async function claimOffer(db: D1Database, token: string): Promise<OfferClaimResult | OfferActionError> {
  const tokenHash = await hashOfferToken(token);
  const row = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE token = ?1`)
    .bind(tokenHash)
    .first<OfferRawRow>();
  if (!row) return { error: 'This claim link is not valid.' };
  if (row.resolved !== null) return { error: 'This offer has already been used.' };

  const now = toSqliteDatetime(new Date());
  if (row.expires_at <= now) {
    await markExpired(db, row.token_hash, row.waitlist_id, now);
    return { error: 'This offer has expired.' };
  }

  const waitlistRow = await db
    .prepare('SELECT id, applicant_name, applicant_email, member_id FROM class_waitlist WHERE id = ?1')
    .bind(row.waitlist_id)
    .first<{ id: string; applicant_name: string | null; applicant_email: string | null; member_id: string | null }>();
  if (!waitlistRow) return { error: 'The waitlist entry for this offer no longer exists.' };

  const classRow = await getClass(db, row.class_id);
  if (!classRow) return { error: 'The class for this offer no longer exists.' };

  // Pre-2.2, `class_enrollments.member_id` reuses the person's own email as a natural key, the
  // same workaround migration 0002's header documents for `class_instructors.member_id`: there is
  // no real `members` row yet to reference, and an email is unique and stable in its place.
  const enrollMemberId = waitlistRow.member_id ?? waitlistRow.applicant_email;
  if (!enrollMemberId) return { error: 'This waitlist entry has no member or applicant identity to enroll.' };

  const enrollmentId = crypto.randomUUID();
  await db
    .prepare('INSERT INTO class_enrollments (id, class_id, member_id) VALUES (?1, ?2, ?3)')
    .bind(enrollmentId, row.class_id, enrollMemberId)
    .run();
  await db.prepare('DELETE FROM class_waitlist WHERE id = ?1').bind(row.waitlist_id).run();
  await db
    .prepare("UPDATE class_offers SET resolved = 'claimed', resolved_at = ?1 WHERE token = ?2")
    .bind(now, tokenHash)
    .run();
  writeAudit(db, 'public:claim', 'claim', row.waitlist_id, `class=${row.class_id}`);

  return {
    enrollmentId,
    classId: row.class_id,
    className: classRow.name,
    personName: waitlistRow.applicant_name,
    personEmail: waitlistRow.applicant_email,
  };
}

/**
 * Decline a pending offer by its plaintext token (the public token-bearer's own path): refuses an
 * unknown or already-resolved token. Freeing the spot means only that the active-offer block over
 * this waitlist entry clears; the next offer is always a fresh admin action, never automatic.
 * Audited as `'public:decline'` (this module's own header): a token-bearer's decline has no signed-
 * in editor behind it. The Club section's admin cancel action uses {@link cancelActiveOffer}
 * instead, since by the time an admin clicks it the plaintext token is long gone.
 */
export async function declineOffer(db: D1Database, token: string): Promise<{ ok: true } | OfferActionError> {
  const tokenHash = await hashOfferToken(token);
  const row = await db
    .prepare('SELECT waitlist_id, resolved FROM class_offers WHERE token = ?1')
    .bind(tokenHash)
    .first<{ waitlist_id: string; resolved: OfferResolution | null }>();
  if (!row) return { error: 'This claim link is not valid.' };
  if (row.resolved !== null) return { error: 'This offer has already been used.' };

  const now = toSqliteDatetime(new Date());
  await db
    .prepare("UPDATE class_offers SET resolved = 'declined', resolved_at = ?1 WHERE token = ?2")
    .bind(now, tokenHash)
    .run();
  writeAudit(db, 'public:decline', 'decline', row.waitlist_id);

  return { ok: true };
}

/**
 * The admin's own cancel action, by waitlist entry rather than by token: once the plaintext token
 * has scrolled off the page (any render after the one `offerSpot` returned it to), the admin's
 * only remaining handle on a pending offer is which waitlist entry it was offered to, not the
 * token itself, which only its hash reaches storage to compare against. Data-only, no audit write
 * (`offerSpot`'s own header): the caller is always an admin route wrapped in `clubAdminAction`,
 * whose `ctx.audit` is the required emit.
 */
export async function cancelActiveOffer(db: D1Database, waitlistId: string): Promise<{ ok: true } | OfferActionError> {
  const row = await db
    .prepare('SELECT token FROM class_offers WHERE waitlist_id = ?1 AND resolved IS NULL')
    .bind(waitlistId)
    .first<{ token: string }>();
  if (!row) return { error: 'There is no active offer to cancel.' };

  const now = toSqliteDatetime(new Date());
  await db
    .prepare("UPDATE class_offers SET resolved = 'declined', resolved_at = ?1 WHERE token = ?2")
    .bind(now, row.token)
    .run();

  return { ok: true };
}

/**
 * The lazy sweep: expire every unresolved offer whose window has already passed, auditing each as
 * `'system'`. Callable from a page `load` (the Club classes detail screen runs this before reading
 * the waitlist, so a stale offer never lingers as "active" in the admin's own view), with no
 * `ctx` available to defer to, hence the direct audit write (this module's own header).
 */
export async function expireStaleOffers(db: D1Database): Promise<{ expiredCount: number }> {
  const now = toSqliteDatetime(new Date());
  const { results } = await db
    .prepare('SELECT token, waitlist_id FROM class_offers WHERE resolved IS NULL AND expires_at <= ?1')
    .bind(now)
    .all<{ token: string; waitlist_id: string }>();
  for (const row of results) {
    await markExpired(db, row.token, row.waitlist_id, now);
  }
  return { expiredCount: results.length };
}
