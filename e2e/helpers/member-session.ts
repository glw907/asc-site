// Mints a valid member session directly in the LOCAL CLUB_DB (asc-club) D1 replica the e2e
// webServer serves against, so a Playwright spec can reach /my-account already signed in, no
// magic-link email loop. Every write goes through `wrangler d1 execute --local`, the same
// mechanism e2e/fixtures/bootstrap-club-db.mjs and admin-session.ts already use; nothing here
// ever touches a remote database.
//
// This is the MEMBER analogue of admin-session.ts, against a different database and a
// different session-row shape. Three deliberate differences from that helper, each forced by
// `src/member-auth/`'s own conventions (never guessed):
//   - Table `member_sessions` (migration 0009_member_auth), not cairn's own `session`.
//   - Cookie name `memberSessionCookieName(secure)` (`src/member-auth/lib/crypto.ts`): on local
//     http `secure` is false, so the cookie is the BARE `asc-member`, no `__Host-` prefix (that
//     prefix only applies once the cookie is Secure, i.e. https).
//   - `expires_at` is a SQLite-datetime TEXT string ("YYYY-MM-DD HH:MM:SS", UTC), the OPPOSITE
//     of the admin helper's AUTH_DB convention (epoch milliseconds): `resolveMemberSession`
//     (`src/member-auth/lib/store.ts`) compares it lexicographically against
//     `toSqliteDatetime(new Date())`, so this helper must produce the same shape.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');

// Mirrors `MEMBER_SESSION_TTL_MS` (`src/member-auth/lib/crypto.ts`): member sessions live 30 days.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// wrangler.toml's CLUB_DB binding names this database (never the binding name itself; wrangler
// d1 execute takes the database_name, the same convention bootstrap-club-db.mjs follows).
const CLUB_DB_NAME = 'asc-club';

// `memberSessionCookieName(false)` in src/member-auth/lib/crypto.ts: on local http the __Host-
// prefix is dropped, since that prefix requires the cookie to be Secure.
const SESSION_COOKIE_NAME = 'asc-member';

function d1Exec(args: string[]): void {
  execFileSync('npx', ['wrangler', 'd1', 'execute', CLUB_DB_NAME, '--local', ...args], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

function d1Query(sql: string): { results: unknown[] } {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', CLUB_DB_NAME, '--local', '--json', '--command', sql],
    { cwd: repoRoot },
  ).toString();
  const [first] = JSON.parse(out) as [{ results: unknown[] }];
  return first;
}

// Test fixture values only, never user input, but escape defensively rather than trust that stays true.
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** A fresh, url-safe, unique-enough local id. Not `generateMemberSessionId` (256-bit random,
 *  package-internal); a test session only needs to be unguessable within one suite run, not
 *  cryptographically strong. */
function randomLocalId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

/** `toSqliteDatetime`'s own shape (`src/member-auth/lib/crypto.ts`), reimplemented here rather
 *  than imported: this helper runs as plain Playwright/Node config code, never bundled through
 *  the app's own module graph. */
function toSqliteDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function memberRowExists(memberId: string): boolean {
  const { results } = d1Query(`SELECT id FROM members WHERE id = ${sqlString(memberId)}`);
  return results.length > 0;
}

export type MintMemberSessionOptions = {
  /** The `members.id` row to sign in as. Defaults to the portal fixture seed's own primary
   *  member (`e2e/fixtures/portal-seed.sql`). */
  memberId?: string;
};

/**
 * Mints a fresh `member_sessions` row for an EXISTING member (this helper never creates the
 * member/household/membership rows themselves; that is `e2e/fixtures/portal-seed.sql`'s own job,
 * applied by `bootstrap-club-db.mjs` before the e2e webServer starts) and sets the session cookie
 * on the given browser context so its pages load already signed in. Throws if `memberId` does not
 * resolve to a real row, rather than silently minting a session `getMemberSession` can never
 * resolve.
 */
export async function mintMemberSession(
  context: BrowserContext,
  opts: MintMemberSessionOptions = {},
): Promise<{ memberId: string; sessionId: string }> {
  const memberId = opts.memberId ?? 'portal-mem-primary';

  if (!memberRowExists(memberId)) {
    throw new Error(`mintMemberSession: no members row with id ${memberId}. Is portal-seed.sql applied?`);
  }

  const sessionId = randomLocalId();
  const expiresAt = toSqliteDatetime(new Date(Date.now() + SESSION_TTL_MS));
  d1Exec([
    '--command',
    `INSERT INTO member_sessions (id, member_id, expires_at) VALUES (${sqlString(sessionId)}, ${sqlString(memberId)}, ${sqlString(expiresAt)})`,
  ]);

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return { memberId, sessionId };
}
