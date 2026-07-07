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
import { ensureMember } from './people';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import { sendClassWelcomeEmail } from './class-welcome';
import { formatClubTimestamp } from './ui';
import { notifyDiscord, buildOfferSentNotice, type DiscordBindingEnv } from './discord';

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

/**
 * Whether a class currently has a live (unresolved, unexpired) offer outstanding: the freed-spot
 * rule's third gate (design doc: "open iff enrolled < capacity AND the waitlist is empty AND no
 * offer is outstanding"), alongside `ClassWithCounts.isFull` and `waitlistCount`. A deliberately
 * cheap read, not a lazy-expiry sweep (`expireStaleOffers` is the sweep; this only reads): a
 * stale, past-expiry offer still counts as "live" here for the brief window before something else
 * sweeps it, which only ever makes public signup MORE conservative (waitlisting instead of
 * enrolling), never less safe.
 */
export async function hasActiveOfferForClass(db: D1Database, classId: string): Promise<boolean> {
  const now = toSqliteDatetime(new Date());
  const row = await db
    .prepare('SELECT 1 AS n FROM class_offers WHERE class_id = ?1 AND resolved IS NULL AND expires_at > ?2 LIMIT 1')
    .bind(classId, now)
    .first<{ n: number }>();
  return row !== null;
}

/** Every offer ever made for a class, most recent first: the detail screen's own need. A declined
 *  or expired offer keeps rendering as a history chip against its still-live waitlist entry; a
 *  claimed offer's own waitlist row no longer exists (this module's own header on `claimOffer`),
 *  so the detail screen's `waitlistView` derivation never has an entry left to attach a claimed
 *  offer's chip to (`class_offers.waitlist_id` itself cascades away with that row, migration
 *  0006_offer_cascade_on_waitlist_delete). */
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
 *  rest of this schema's own datetimes already do. Exported for the public claim page's own `load`
 *  (Task 8), which needs the same comparison to decide whether to show the expired state without
 *  itself mutating anything (see {@link previewOffer}). */
export function toSqliteDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Insert one `audit_log` row directly (mirrors `audit-sink.ts`'s own insert shape): the
 *  mechanism `claimOffer`, `declineOffer`, and the lazy sweep use in place of `ctx.audit`, since
 *  none of them run inside an `adminAction`-wrapped route (see this module's own header). Awaited
 *  by every call site (each already runs inside an `async` function its own caller awaits, unlike
 *  `audit-sink.ts`'s engine-typed, synchronous `AdminActionAuditSink`, which has no such chain to
 *  ride and needs `waitUntil` instead): an un-awaited `.run()` races the Worker's own response,
 *  which can tear the request context down mid-write and silently drop the row. A failed write
 *  must still never break the state transition it is auditing, which already committed by the
 *  time this runs; it only logs loudly, the same tradeoff `audit-sink.ts` makes. */
async function writeAudit(db: D1Database, actor: string, action: string, entityId: string, detail?: string): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(actor, action, 'offer', entityId, detail ?? null)
      .run();
  } catch (err) {
    console.error('admin/club: offer audit_log insert failed', err);
  }
}

/** Resolve one offer row as `'expired'` and audit it as `actor` (`'system'` for both the lazy
 *  sweep and the on-touch checks `offerSpot`/`claimOffer` run before trusting an unresolved row).
 *  Shared so every expiry path marks and audits identically. */
async function markExpired(db: D1Database, tokenHash: string, waitlistId: string, now: string, actor = 'system'): Promise<void> {
  await db
    .prepare("UPDATE class_offers SET resolved = 'expired', resolved_at = ?1 WHERE token = ?2")
    .bind(now, tokenHash)
    .run();
  await writeAudit(db, actor, 'expire', waitlistId);
}

/** The one unresolved offer for a waitlist entry, if any, after lazily expiring it in place when
 *  its window has already passed (so a stale, never-swept row can never wedge the "one active
 *  offer" rule open forever). Returns `null` when there is truly no active offer, whether because
 *  none was ever made or because this call just expired the only one that existed. */
async function activeOfferForWaitlist(db: D1Database, waitlistId: string, now: string): Promise<OfferRawRow | null> {
  const row = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE waitlist_id = ?1 AND resolved IS NULL LIMIT 1`)
    .bind(waitlistId)
    .first<OfferRawRow>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await markExpired(db, row.token_hash, waitlistId, now);
    return null;
  }
  return row;
}

/** One waitlist entry's contact, resolved for the offer notification: either edge the row's own
 *  `CHECK` guarantees (`classes-store.ts`'s `WaitlistRow` header), a member row joined for its
 *  stored email/name, or the applicant fields a not-yet-a-member public signup carries directly. A
 *  member with no email on file (the schema allows it; `people.ts`'s header names the covered-child
 *  case) resolves to `null`: nothing to notify, not an error. */
async function resolveWaitlistContact(
  db: D1Database,
  row: { member_id: string | null; applicant_name: string | null; applicant_email: string | null },
): Promise<{ email: string; name: string } | null> {
  if (row.member_id) {
    const member = await db.prepare('SELECT name, email FROM members WHERE id = ?1').bind(row.member_id).first<{ name: string; email: string | null }>();
    return member?.email ? { email: member.email, name: member.name } : null;
  }
  return row.applicant_email ? { email: row.applicant_email, name: row.applicant_name ?? row.applicant_email } : null;
}

/**
 * Offer the freed spot to one waitlist entry: refuses (never throws) when the class has no free
 * capacity (`enrolled >= capacity`, i.e. there is nothing to offer) or an active offer already
 * exists for this exact waitlist entry. On success, mints a single-use token good for
 * `settings.offer_window_hours` and returns its plaintext once; only the hash reaches storage. No
 * audit write here: the caller is always an admin route wrapped in `clubAdminAction`, whose own
 * `ctx.audit` is the required emit (this module's own header).
 *
 * `notify`, if given, best-effort emails the waitlisted person their claim link through the
 * `class_offer` template (`sendClubEmail`), alongside the admin's own copyable-link fallback (the
 * return value, unchanged either way): a missing `EMAIL` binding, a missing `origin`, an unresolved
 * contact (no email on file), or the send itself failing all degrade silently, logged but never
 * thrown, since a notification failure must never undo or fail the offer it is announcing (the
 * offer already exists in storage by the time this runs). Once a contact resolves, `notify.env`
 * also drives a best-effort Discord post to the classes channel
 * (`docs/discord-notifications-wiring.md`); `notify.env` intersects `DiscordBindingEnv` alongside
 * `EmailBindingEnv` for this reason, both satisfied at the real call site by the same
 * `platform.env`. A missing webhook secret is `notifyDiscord`'s own silent no-op, the same degrade
 * as the email above.
 */
export async function offerSpot(
  db: D1Database,
  args: { classId: string; waitlistId: string; actorEmail: string; notify?: { env: EmailBindingEnv & DiscordBindingEnv; origin: string } },
): Promise<OfferMintResult | OfferActionError> {
  const cls = await getClassWithCounts(db, args.classId);
  if (!cls) return { error: 'No such class.' };
  if (cls.isFull) return { error: 'This class has no free spot to offer.' };

  const waitlistRow = await db
    .prepare('SELECT class_id, member_id, applicant_name, applicant_email FROM class_waitlist WHERE id = ?1')
    .bind(args.waitlistId)
    .first<{ class_id: string; member_id: string | null; applicant_name: string | null; applicant_email: string | null }>();
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

  if (args.notify) {
    try {
      const contact = await resolveWaitlistContact(db, waitlistRow);
      if (contact) {
        await sendClubEmail(db, args.notify.env, {
          to: contact.email,
          templateId: 'class_offer',
          vars: {
            person_name: contact.name,
            item_display_name: cls.name,
            claim_url: `${args.notify.origin}/classes/offer/${token}`,
            expires_at: formatClubTimestamp(expiresAt),
            committee_email: 'program-committee@aksailingclub.org',
          },
        });
        await notifyDiscord(
          args.notify.env,
          buildOfferSentNotice({ className: cls.name, applicantName: contact.name, expiresAt: formatClubTimestamp(expiresAt) }),
        );
      }
    } catch (err) {
      // Never let a notification failure undo or fail the offer itself (this function's own
      // header): the token above is already committed, and the admin's copyable-link fallback
      // still works regardless of whether this email ever sends.
      console.error('admin/club: offer notification email failed', err);
    }
  }

  return { token, expiresAt };
}

/** {@link previewOffer}'s success shape: just enough for the public claim page to show the class
 *  and expiry before the visitor decides, without resolving anything itself. */
export interface OfferPreview {
  classId: string;
  className: string;
  expiresAt: string;
  resolved: OfferResolution | null;
}

/**
 * A read-only look at one offer by its plaintext token, for the public claim page's own `load`
 * (Task 8): unlike {@link claimOffer}, this never mutates (no lazy-expiry write), so viewing the
 * page before deciding never itself resolves the offer. The page compares `expiresAt` against
 * `toSqliteDatetime(new Date())` itself to decide whether to show the expired state; the actual
 * claim or decline (which does mutate, and does lazily expire a stale row) still goes through
 * {@link claimOffer} or {@link declineOffer}.
 */
export async function previewOffer(db: D1Database, token: string): Promise<OfferPreview | OfferActionError> {
  const tokenHash = await hashOfferToken(token);
  const row = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE token = ?1 LIMIT 1`)
    .bind(tokenHash)
    .first<OfferRawRow>();
  if (!row) return { error: 'This claim link is not valid.' };

  const classRow = await getClass(db, row.class_id);
  if (!classRow) return { error: 'The class for this offer no longer exists.' };

  return { classId: row.class_id, className: classRow.name, expiresAt: row.expires_at, resolved: row.resolved };
}

/**
 * Claim a spot with its offer's plaintext token: refuses an unknown token, one already resolved
 * (claimed, declined, or expired), one past its window (lazily marking it `'expired'` first, so a
 * late claim attempt is also what sweeps it), or a class that has filled up since the offer was
 * made (a second, independent offer to a different waitlist entry on the same class can resolve
 * first; `offerSpot` only ever blocks a SECOND offer to the SAME entry, not a second offer on the
 * class as a whole). On success, enrolls the waitlisted person and removes their waitlist row (the
 * schema carries no status column to flip instead, see `classes-store.ts`'s own header on
 * `class_enrollments`), audited as `'public:claim'`.
 *
 * The state transition itself is one atomic compare-and-set UPDATE, run and checked (`meta.changes
 * === 1`) BEFORE the enrollment write, not folded into one `db.batch()` with it: D1's `batch()`
 * runs every statement regardless of an earlier one's own effect, so a batched conditional UPDATE
 * gives no way to detect "this call lost the race" before the enrollment INSERT already ran too.
 * Two concurrent claims of the same token can't both see `changes === 1` (D1 serializes writes to
 * one SQLite file, the same reasoning `club-roles.ts`'s last-owner guard documents for an
 * identical shape); whichever loses sees `changes === 0` and refuses cleanly instead of double-
 * enrolling.
 *
 * A successful claim also sends the class-reminder set's own `welcome` touch (best-effort, after
 * the batch has committed, `notify` optional -- `class-welcome.ts`'s own header), the same as
 * `enrollments.ts`'s `signUpForClass` does for a direct signup: both are real enrollment moments,
 * and a waitlisted-then-offered participant deserves the same welcome a directly-enrolled one
 * gets.
 */
export async function claimOffer(db: D1Database, token: string, notify?: EmailBindingEnv): Promise<OfferClaimResult | OfferActionError> {
  const tokenHash = await hashOfferToken(token);
  const now = toSqliteDatetime(new Date());

  // A read-only preview for a specific, friendly refusal (unknown / already-used / expired)
  // before touching anything. This read can go stale before the atomic consume below runs; that
  // is fine, since the consume re-checks the same conditions in the SAME statement that performs
  // the write, which is what actually closes the race, not this read.
  const preview = await db
    .prepare(`SELECT ${RAW_ROW_COLUMNS} FROM class_offers WHERE token = ?1 LIMIT 1`)
    .bind(tokenHash)
    .first<OfferRawRow>();
  if (!preview) return { error: 'This claim link is not valid.' };
  if (preview.resolved !== null) return { error: 'This offer has already been used.' };
  if (preview.expires_at <= now) {
    await markExpired(db, preview.token_hash, preview.waitlist_id, now);
    return { error: 'This offer has expired.' };
  }

  const cls = await getClassWithCounts(db, preview.class_id);
  if (!cls) return { error: 'The class for this offer no longer exists.' };
  if (cls.isFull) return { error: 'This class has filled up since this offer was made.' };

  const consume = await db
    .prepare(
      "UPDATE class_offers SET resolved = 'claimed', resolved_at = ?1 " +
        'WHERE token = ?2 AND resolved IS NULL AND expires_at > ?1',
    )
    .bind(now, tokenHash)
    .run();
  if ((consume.meta.changes ?? 0) !== 1) return { error: 'This offer has already been used.' };

  const waitlistRow = await db
    .prepare('SELECT id, applicant_name, applicant_email, applicant_phone, member_id FROM class_waitlist WHERE id = ?1 LIMIT 1')
    .bind(preview.waitlist_id)
    .first<{
      id: string;
      applicant_name: string | null;
      applicant_email: string | null;
      applicant_phone: string | null;
      member_id: string | null;
    }>();
  // The waitlist row's own CHECK guarantees exactly one identity edge: either `member_id` is
  // already set (the person joined as a known member), or `applicant_email` is (a public signup
  // who was not a member yet, resolved to a real `members.id` here through `ensureMember`,
  // migration 0005_member_domain's arrival). The offer is already marked claimed at this point
  // (the consume above committed); a missing waitlist row or identity here is an inconsistent-data
  // edge case, not a normal refusal, so this still answers honestly rather than pretending to
  // succeed.
  let enrollMemberId: string | null = null;
  if (waitlistRow?.member_id) {
    enrollMemberId = waitlistRow.member_id;
  } else if (waitlistRow?.applicant_email) {
    const member = await ensureMember(db, {
      name: waitlistRow.applicant_name ?? waitlistRow.applicant_email,
      email: waitlistRow.applicant_email,
      phone: waitlistRow.applicant_phone,
    });
    enrollMemberId = member.memberId;
  }
  if (!waitlistRow || !enrollMemberId) {
    console.error('admin/club: claimOffer consumed a token with no valid waitlist identity', preview.waitlist_id);
    return { error: 'Something went wrong completing your claim. Contact the club for help.' };
  }

  const enrollmentId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare('INSERT INTO class_enrollments (id, class_id, member_id) VALUES (?1, ?2, ?3)')
        .bind(enrollmentId, preview.class_id, enrollMemberId),
      db.prepare('DELETE FROM class_waitlist WHERE id = ?1').bind(preview.waitlist_id),
    ]);
  } catch (err) {
    // Most likely `UNIQUE(class_id, member_id)`: this person is already enrolled some other way.
    // The offer stays marked claimed (the consume above already committed); log loudly so an
    // admin can reconcile the now-stale waitlist row, and answer honestly rather than a 500.
    console.error('admin/club: claimOffer enrollment batch failed after a committed consume', err);
    return { error: 'You are already enrolled in this class.' };
  }

  await writeAudit(db, 'public:claim', 'claim', preview.waitlist_id, `class=${preview.class_id}`);

  await sendClassWelcomeEmail(db, notify, {
    enrollmentId,
    className: cls.name,
    track: cls.track,
    memberId: enrollMemberId,
  });

  return {
    enrollmentId,
    classId: preview.class_id,
    className: cls.name,
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
    .prepare('SELECT waitlist_id, resolved FROM class_offers WHERE token = ?1 LIMIT 1')
    .bind(tokenHash)
    .first<{ waitlist_id: string; resolved: OfferResolution | null }>();
  if (!row) return { error: 'This claim link is not valid.' };
  if (row.resolved !== null) return { error: 'This offer has already been used.' };

  const now = toSqliteDatetime(new Date());
  await db
    .prepare("UPDATE class_offers SET resolved = 'declined', resolved_at = ?1 WHERE token = ?2")
    .bind(now, tokenHash)
    .run();
  await writeAudit(db, 'public:decline', 'decline', row.waitlist_id);

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
    .prepare('SELECT token FROM class_offers WHERE waitlist_id = ?1 AND resolved IS NULL LIMIT 1')
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
