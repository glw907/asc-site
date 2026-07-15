// Mints a valid cairn-cms editor session directly in the LOCAL AUTH_DB replica the e2e
// webServer serves against, so a Playwright spec can reach /admin without the magic-link email
// loop. Every write goes through `wrangler d1 execute --local`, the same mechanism
// e2e/fixtures/bootstrap-club-db.mjs already uses for CLUB_DB; nothing here ever touches a
// remote database.
//
// Session-mint recipe (docs/STATUS.md's "SESSION-MINT RECIPE CORRECTIONS"): on local http the
// cookie is the bare `cairn_session` (the `__Host-` prefix only applies once the cookie is
// Secure, i.e. https), and `session.expires_at` is epoch MILLISECONDS, matching the
// `Date.now()` call site cairn's own `createSession` uses (auth-routes.js).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');

// Mirrors cairn's own SESSION_TTL_MS (auth/crypto.js): sessions live 30 days.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// wrangler.toml's AUTH_DB binding names this database (never the binding name itself; wrangler
// d1 execute takes the database_name, the same convention bootstrap-club-db.mjs follows for
// CLUB_DB/asc-club).
const AUTH_DB_NAME = 'cairn-asc-auth';

// sessionCookieName(secure: false) in @glw907/cairn-cms/dist/auth/crypto.js.
const SESSION_COOKIE_NAME = 'cairn_session';

function d1Exec(args: string[]): void {
  execFileSync('npx', ['wrangler', 'd1', 'execute', AUTH_DB_NAME, '--local', ...args], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

function d1Query(sql: string): { results: unknown[] } {
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', AUTH_DB_NAME, '--local', '--json', '--command', sql],
    { cwd: repoRoot },
  ).toString();
  const [first] = JSON.parse(out) as [{ results: unknown[] }];
  return first;
}

function schemaAlreadyMigrated(): boolean {
  const { results } = d1Query("SELECT name FROM sqlite_master WHERE type='table' AND name='editor'");
  return results.length > 0;
}

// Test fixture values only, never user input, but escape defensively rather than trust that stays true.
function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** A fresh, url-safe, unique-enough local id. Not cairn's own session-id generator (256-bit
 * random, package-internal, unexported); a test session only needs to be unguessable within one
 * suite run, not cryptographically strong. */
function randomLocalId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export type MintAdminSessionOptions = {
  /** Defaults to a fixture owner editor; never a real club address. */
  email?: string;
  displayName?: string;
  /** One of the site's declared role names (src/theme/cairn.config.ts's `roles`). Defaults to
   * 'owner'. */
  role?: string;
};

/**
 * Seeds the AUTH_DB schema (idempotent) and an editor row, mints a fresh session row, and sets
 * the session cookie on the given browser context so its pages load already signed in. Every
 * write targets the gitignored `.wrangler/` D1 replica the e2e webServer's `wrangler dev --local`
 * serves, never a remote database.
 */
export async function mintAdminSession(
  context: BrowserContext,
  opts: MintAdminSessionOptions = {},
): Promise<{ email: string; sessionId: string }> {
  const email = opts.email ?? 'e2e-owner@aksailingclub.org';
  const displayName = opts.displayName ?? 'E2E Owner';
  const role = opts.role ?? 'owner';

  if (!schemaAlreadyMigrated()) {
    d1Exec(['--file', path.join(repoRoot, 'migrations/0000_auth.sql')]);
  }

  const now = Date.now();
  // INSERT OR REPLACE: idempotent across repeated runs against a warm workstation replica. The
  // editor table declares no foreign keys, so replacing the row never orphans a session row.
  d1Exec([
    '--command',
    `INSERT OR REPLACE INTO editor (email, display_name, role, created_at) VALUES (${sqlString(email)}, ${sqlString(displayName)}, ${sqlString(role)}, ${now})`,
  ]);

  const sessionId = randomLocalId();
  const expiresAt = now + SESSION_TTL_MS;
  d1Exec([
    '--command',
    `INSERT INTO session (id, email, expires_at, created_at) VALUES (${sqlString(sessionId)}, ${sqlString(email)}, ${expiresAt}, ${now})`,
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

  return { email, sessionId };
}
