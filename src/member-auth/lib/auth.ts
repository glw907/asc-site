// asc-club member-facing magic-link authentication (pass 2.2's member portal, Part 2): the
// site-brings-its-own-auth seam eating its own dogfood, deliberately living OUTSIDE
// src/admin-club/ (the club-admin surface). member-auth is the member-facing IDENTITY, a
// different axis entirely (docs/2026-07-07-member-portal-design.md's own "the auth surface"
// section: "A signed-in EDITOR is not a member session and vice versa; the two stores never
// blur"). Mirrors @glw907/cairn-cms's own auth discipline throughout (see each function's own
// header for the specific correspondence to `~/Projects/cairn-cms/src/lib/auth/`), reimplemented
// small here rather than importing the engine's auth internals, the same choice
// `src/admin-club/lib/offers.ts` made for its own waitlist-offer tokens.
import type { D1Database } from '@cloudflare/workers-types';
import {
  generateMemberToken,
  generateMemberSessionId,
  generateMemberCsrfToken,
  hashMemberToken,
  toSqliteDatetime,
  sqliteDatetimeAfter,
  memberCsrfCookieName,
  MEMBER_TOKEN_TTL_MS,
  MEMBER_SESSION_TTL_MS,
} from './crypto';
import {
  findMemberByEmail,
  findMemberByTokenHash,
  issueMemberToken,
  consumeMemberToken,
  createMemberSession,
  resolveMemberSession,
  deleteMemberSession,
  type MemberRow,
} from './store';

export type { MemberRow };
export { MEMBER_SESSION_TTL_MS };

/** The magic-link email's built shape, ready for `platform.env.EMAIL.send`. */
export interface MemberLinkMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

/** The injected send, mirroring cairn's own `SendMagicLink` seam: production wraps
 *  `platform.env.EMAIL.send`, a test passes a sink, so `requestMemberLink` itself never touches a
 *  binding directly (testable with no D1 *or* Worker runtime beyond the `D1Database` param). */
export type SendMemberLink = (message: MemberLinkMessage) => Promise<void>;

/** Per-site identity for the member magic-link email and the confirmation link's origin.
 *  `requestMemberLink`'s literal parameter list is `(db, email, sendEmail)`; this bag is the one
 *  necessary addition beyond it, since building the confirmation link at all needs an origin —
 *  cairn's own `requestAction` (`~/Projects/cairn-cms/src/lib/sveltekit/auth-routes.ts`) has the
 *  identical structural need and reads `requireOrigin(env)` before it can build its own link. */
export interface MemberLinkBranding {
  origin: string;
  siteName: string;
  from: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build the member sign-in email. Mirrors cairn's own `buildMagicLinkMessage`: the link is the
 *  only action, the copy stays plain, and `branding.siteName` (site config, not engine-built) is
 *  HTML-escaped before it reaches the message body. */
export function buildMemberLinkMessage(input: { to: string; branding: MemberLinkBranding; link: string }): MemberLinkMessage {
  const { to, branding, link } = input;
  const subject = `Sign in to ${branding.siteName}`;
  const text = `Open this link to sign in to ${branding.siteName}:\n\n${link}\n\nThe link expires in 15 minutes. If you did not request it, ignore this email.`;
  const name = escapeHtml(branding.siteName);
  const html = `<p>Open this link to sign in to ${name}:</p><p><a href="${link}">Sign in</a></p><p>The link expires in 15 minutes. If you did not request it, ignore this email.</p>`;
  return { to, from: branding.from, subject, html, text };
}

/** `requestMemberLink`'s result. `sent` is the single response the sign-in form ever renders
 *  ("check your inbox"): an unknown email, an archived member, and a real send-ok member all
 *  answer identically, so the response body carries no enumeration oracle (the same discipline
 *  cairn's own `RequestResult`/`requestAction` document for its editor allowlist, mirrored here
 *  for the member store). `send_error` is the one honest exception: a real, active member whose
 *  email genuinely failed to send. */
export type RequestMemberLinkResult = { status: 'sent' } | { status: 'send_error' };

async function writeAudit(db: D1Database, actor: string, action: string, entityId: string | null, detail?: string): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(actor, action, 'member_auth', entityId, detail ?? null)
      .run();
  } catch (err) {
    console.error('member-auth: audit_log insert failed', err);
  }
}

/**
 * Request a sign-in link for `email`, case-insensitively matched against `members`. Four cases,
 * one identical response (the enumeration-safety discipline above): an unknown email, an archived
 * member (`members.archived_at` set: deliberately "not coming back"), a member with no email on
 * file (`members.email` is nullable — a covered dependent may have none), and a real, active
 * member with an email all return `{ status: 'sent' }`, with an email sent only in the last case.
 * The plaintext token is never logged, returned, or included in any audit row; only the fact that
 * a request happened, and for which member (when known), is recorded.
 */
export async function requestMemberLink(
  db: D1Database,
  email: string,
  sendEmail: SendMemberLink,
  branding: MemberLinkBranding,
): Promise<RequestMemberLinkResult> {
  const trimmed = email.trim().toLowerCase();
  const member = trimmed ? await findMemberByEmail(db, trimmed) : null;

  if (!member) {
    await writeAudit(db, 'public:auth', 'request_link', null, 'unknown');
    return { status: 'sent' };
  }
  if (member.archivedAt) {
    await writeAudit(db, 'public:auth', 'request_link', member.id, 'archived');
    return { status: 'sent' };
  }
  if (!member.email) {
    await writeAudit(db, 'public:auth', 'request_link', member.id, 'no-email');
    return { status: 'sent' };
  }

  const now = new Date();
  const token = generateMemberToken();
  await issueMemberToken(
    db,
    crypto.randomUUID(),
    member.id,
    await hashMemberToken(token),
    sqliteDatetimeAfter(MEMBER_TOKEN_TTL_MS, now),
  );

  const link = `${branding.origin}/my-account/confirm?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail(buildMemberLinkMessage({ to: member.email, branding, link }));
  } catch (err) {
    console.error('member-auth: sign-in link send failed', err);
    await writeAudit(db, 'public:auth', 'request_link_failed', member.id);
    return { status: 'send_error' };
  }

  await writeAudit(db, 'public:auth', 'request_link', member.id);
  return { status: 'sent' };
}

/** `confirmMemberToken`'s result: success carries the freshly created session id and the member's
 *  own row; failure carries the email to pre-fill the "send me a fresh link" form with, when the
 *  token row could still be traced back to a member (even an expired or already-consumed row) —
 *  mockup frame 09's own detail ("recovery is one button with the email pre-filled"). An entirely
 *  unknown token pre-fills nothing. */
export type ConfirmMemberTokenResult =
  | { ok: true; sessionId: string; member: MemberRow }
  | { ok: false; prefillEmail: string | null };

/**
 * Consume a magic-link token: one atomic conditional UPDATE (`consumeMemberToken`), checked
 * before anything else happens, the identical compare-and-set shape `claimOffer` (offers.ts) uses
 * for its own single-use tokens. Only a POST should ever call this (the confirm route's own
 * `load` renders a token and a button, never consumes, mirroring cairn's own
 * `confirmLoad`/`confirmAction` split): a GET that accidentally consumed a token would burn a
 * real member's link on a link-scanner's prefetch.
 */
export async function confirmMemberToken(db: D1Database, token: string): Promise<ConfirmMemberTokenResult> {
  const tokenHash = await hashMemberToken(token);
  const now = toSqliteDatetime(new Date());

  const consumed = await consumeMemberToken(db, tokenHash, now);
  if (!consumed) {
    const found = await findMemberByTokenHash(db, tokenHash);
    await writeAudit(db, 'public:auth', 'confirm_failed', found?.id ?? null);
    return { ok: false, prefillEmail: found?.email ?? null };
  }

  const member = await findMemberByTokenHash(db, tokenHash);
  if (!member) {
    // The token row referenced a member id that no longer exists: an inconsistent-data edge
    // case, not a normal refusal (offers.ts's own claimOffer sets the precedent for answering
    // honestly here rather than pretending to succeed).
    console.error('member-auth: confirmMemberToken consumed a token with no matching member row');
    return { ok: false, prefillEmail: null };
  }

  const sessionId = generateMemberSessionId();
  await createMemberSession(db, sessionId, member.id, sqliteDatetimeAfter(MEMBER_SESSION_TTL_MS));
  await writeAudit(db, 'public:auth', 'confirm', member.id);
  return { ok: true, sessionId, member };
}

/** Resolve a session cookie's value to the member it belongs to, or `null` for a missing,
 *  expired, unknown, or now-archived member's session (mirrors cairn's own `resolveSession`). */
export async function getMemberSession(db: D1Database, sessionId: string): Promise<MemberRow | null> {
  return resolveMemberSession(db, sessionId, toSqliteDatetime(new Date()));
}

/** Sign a member out: deletes the session row and audits as `member:<id>`, the post-auth actor
 *  shape (the caller already held a valid session to reach this action at all). A missing or
 *  already-gone session id is a silent no-op, not an error: signing out twice is not a failure. */
export async function destroyMemberSession(db: D1Database, sessionId: string): Promise<void> {
  const memberId = await deleteMemberSession(db, sessionId);
  if (memberId) await writeAudit(db, `member:${memberId}`, 'sign_out', memberId);
}

/** The minimal cookie-jar shape `issueMemberCsrfToken`/`validateMemberCsrfToken` need, matching
 *  SvelteKit's own `Cookies` structurally rather than importing its type. `opts` is an index
 *  signature (not a closed object type): SvelteKit's real `Cookies.set` takes a wider
 *  `CookieSerializeOptions & { path: string }`, and a closed `Record<string, unknown>` parameter
 *  is NOT a valid supertype of that (method parameters are checked contravariantly), so a real
 *  `RequestEvent` would fail to satisfy this interface without the index signature here. */
interface MemberCookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: { path: string; [key: string]: unknown }): void;
}

/**
 * CSRF for member actions: mirrors cairn's own double-submit pattern
 * (`~/Projects/cairn-cms/src/lib/sveltekit/csrf.ts`) verbatim, with its own cookie name
 * (`memberCsrfCookieName`) so the two token stores never collide (the chosen option per this
 * task's own either/or: mirror the engine, not a SameSite-only shortcut). SameSite=Strict is safe
 * here even though the confirmation link is a legitimate cross-site GET a member follows from
 * their inbox: `Strict` only withholds the cookie on that cross-site *navigation* into the
 * confirm page, which reads it fresh via this same function on its own `load` and re-issues it
 * before the page's own POST ever fires; the POST itself is always a same-site form submission
 * from a page the member is already on, exactly cairn's own login flow's shape. Session-scoped
 * (no `maxAge`), HttpOnly, `__Host-` on https, matching cairn's own `issueCsrfToken`.
 */
export function issueMemberCsrfToken(event: { url: URL; cookies: MemberCookieJar }): string {
  const secure = event.url.protocol === 'https:';
  const name = memberCsrfCookieName(secure);
  const existing = event.cookies.get(name);
  if (existing) return existing;
  const token = generateMemberCsrfToken();
  event.cookies.set(name, token, { path: '/', httpOnly: true, secure, sameSite: 'strict' });
  return token;
}

/** A length-checked constant-time compare, so the token check leaks no timing (mirrors cairn's
 *  own `tokensMatch`). */
function tokensMatch(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Validate a member form POST's double-submit token: the cookie `issueMemberCsrfToken` sets,
 *  compared constant-time against the submitted `csrf` field (mirrors cairn's own
 *  `validateCsrfToken`). */
export async function validateMemberCsrfToken(event: {
  url: URL;
  request: Request;
  cookies: Pick<MemberCookieJar, 'get'>;
}): Promise<boolean> {
  const cookie = event.cookies.get(memberCsrfCookieName(event.url.protocol === 'https:'));
  if (!cookie) return false;
  let submitted = '';
  try {
    const form = await event.request.clone().formData();
    submitted = String(form.get('csrf') ?? '');
  } catch {
    return false;
  }
  return tokensMatch(submitted, cookie);
}
