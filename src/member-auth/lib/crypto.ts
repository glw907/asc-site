// asc-club member auth: token/session id generation and hashing, mirroring
// @glw907/cairn-cms's own src/lib/auth/crypto.ts (the same discipline, this site's own domain,
// reimplemented small here rather than importing the engine's auth internals, the same choice
// offers.ts made for its own waitlist-offer tokens). Timestamps everywhere else in this schema
// are TEXT `datetime('now')`-shaped UTC strings, not epoch milliseconds
// (`src/admin-club/lib/offers.ts`'s own `toSqliteDatetime`), so the TTL constants below are
// durations in milliseconds, converted to a SQLite-comparable string at the call site, never
// stored as a number.

/** The member session cookie's base name, __Host- prefixed when the cookie is Secure. Distinct
 *  from cairn's own `cairn_session` (the content-editor cookie): the two stores never blur. */
const SESSION_COOKIE_BASE = 'asc-member';

/** The member session cookie name. On https the cookie is Secure and takes the __Host- prefix
 *  (binds it to the origin); on local http dev the prefix is dropped, since __Host- requires
 *  Secure. Mirrors cairn's own `sessionCookieName`. */
export function memberSessionCookieName(secure: boolean): string {
  return secure ? `__Host-${SESSION_COOKIE_BASE}` : SESSION_COOKIE_BASE;
}

/** The member CSRF double-submit cookie's base name, mirroring cairn's own `cairn_csrf`, with its
 *  own distinct name so the two token stores never collide. */
const CSRF_COOKIE_BASE = 'asc-member-csrf';

export function memberCsrfCookieName(secure: boolean): string {
  return secure ? `__Host-${CSRF_COOKIE_BASE}` : CSRF_COOKIE_BASE;
}

/** Magic-link tokens live 15 minutes (this pass's own ruling; cairn's own editor tokens live 10,
 *  a deliberate difference, not a drift). */
export const MEMBER_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Sessions live 30 days, matching cairn's own `SESSION_TTL_MS`. */
export const MEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** A fresh 256-bit magic-link token, url-safe. */
export function generateMemberToken(): string {
  return randomBase64Url(32);
}

/** A fresh 256-bit session id, url-safe. */
export function generateMemberSessionId(): string {
  return randomBase64Url(32);
}

/** A fresh 256-bit double-submit CSRF token, url-safe. */
export function generateMemberCsrfToken(): string {
  return randomBase64Url(32);
}

/** The lowercase hex SHA-256 of a token, for storage and lookup. The store keeps only this, never
 *  the plaintext token (mirrors cairn's own `hashToken`). */
export async function hashMemberToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A SQLite `datetime('now')`-shaped UTC string ("YYYY-MM-DD HH:MM:SS", no offset), matching
 *  offers.ts's own `toSqliteDatetime`: every timestamp this domain writes or compares uses this
 *  exact shape, so lexicographic comparison against a database-read value stays safe. */
export function toSqliteDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** `toSqliteDatetime`, offset forward by a duration in milliseconds: the shape every expiry
 *  column this migration writes wants. */
export function sqliteDatetimeAfter(ms: number, from: Date = new Date()): string {
  return toSqliteDatetime(new Date(from.getTime() + ms));
}
