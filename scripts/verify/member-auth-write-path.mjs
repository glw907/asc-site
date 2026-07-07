#!/usr/bin/env node
/**
 * Scripted end-to-end proof that the member-auth write path (migration
 * 0008_member_auth) actually works against REAL (remote) D1, not just the `fakeD1` test double
 * every unit test in this pass uses. Mirrors `scripts/verify/real-d1-write-path.mjs`'s own method
 * exactly (same header rationale): this does not import `src/member-auth/lib/{auth,store}.ts`
 * directly (those type their `db` parameter as `D1Database`, the Worker runtime binding object, a
 * plain Node process cannot construct without deploying a Worker or wiring Miniflare/
 * `getPlatformProxy`), so this instead issues, via `wrangler d1 execute --remote`, the EXACT SQL
 * text `store.ts`'s own functions run, in the exact order, against a real scratch D1 database. A
 * change to those functions' SQL should update this script's mirror in the same commit, or this
 * proof goes stale.
 *
 * What this proves: mint (`issueMemberToken`'s insert, storing only the token's SHA-256 hash) ->
 * consume (`consumeMemberToken`'s conditional UPDATE, checked via `meta.changes`, exercised twice
 * to prove the second, double-consume attempt is refused) -> session (`createMemberSession`'s
 * insert, then `resolveMemberSession`'s join resolving it back to the member) -> sign-out
 * (`deleteMemberSession`'s DELETE ... RETURNING, then a second resolve confirming the session is
 * really gone). All against a synthetic household/member row (no real member PII: this is a
 * public repo).
 *
 * Creates a fresh scratch database (`asc-club-scratch-<timestamp>` by default, or `--db-name` to
 * override), runs migrations 0001-0008 forward, exercises the write path, and deletes the
 * database when done. Pass `--keep` to skip the final delete.
 *
 * Usage: node scripts/verify/member-auth-write-path.mjs [--db-name NAME] [--keep]
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEEP = process.argv.includes('--keep');
const nameFlagIndex = process.argv.indexOf('--db-name');
const DB_NAME =
  nameFlagIndex !== -1 ? process.argv[nameFlagIndex + 1] : `asc-club-scratch-${Date.now()}`;

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function exec(sql) {
  const stdout = wrangler(['d1', 'execute', DB_NAME, '--remote', '--command', sql, '--json']);
  return JSON.parse(stdout);
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function firstRow(results) {
  return results[0]?.results?.[0] ?? null;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
  console.log(`  ok: ${message}`);
}

/** Mirrors `toSqliteDatetime`/`sqliteDatetimeAfter` (crypto.ts): a SQLite `datetime('now')`-shaped
 *  UTC string, optionally offset forward by `ms` milliseconds. */
function sqliteDatetime(ms = 0) {
  return new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** Mirrors `hashMemberToken` (crypto.ts): the lowercase hex SHA-256 of a token. */
async function hashMemberToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log(`member-auth-write-path: creating scratch database ${DB_NAME}`);
  wrangler(['d1', 'create', DB_NAME]);

  try {
    console.log('\nApplying migrations 0001-0008 forward:');
    for (const m of [
      '0001_substrate',
      '0002_instructor_display_name',
      '0003_class_images',
      '0004_waitlist_integrity',
      '0005_member_domain',
      '0006_offer_cascade_on_waitlist_delete',
      '0007_assets_email',
      '0008_member_auth',
    ]) {
      wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', `migrations/asc-club/${m}/forward.sql`]);
      console.log(`  applied ${m}`);
    }

    // A synthetic household + member (no real PII: this is a public repo).
    const householdId = 'scratch-household';
    const memberId = 'scratch-member';
    exec(
      [
        `INSERT INTO households (id, name) VALUES (${sqlLiteral(householdId)}, 'Scratch Household')`,
        `INSERT INTO members (id, household_id, name, email) VALUES (${sqlLiteral(memberId)}, ${sqlLiteral(householdId)}, 'Scratch Member', 'scratch-member@example.com')`,
        `UPDATE households SET primary_member_id = ${sqlLiteral(memberId)} WHERE id = ${sqlLiteral(householdId)}`,
      ].join(';\n'),
    );
    console.log(`\nSeeded household ${householdId} / member ${memberId}`);

    // ---- mint: issueMemberToken's own insert (store.ts) ----
    console.log('\n--- mint: issueMemberToken ---');
    const plaintextToken = 'scratch-proof-member-token';
    const tokenHash = await hashMemberToken(plaintextToken);
    const tokenId = randomUUID();
    const tokenExpiresAt = sqliteDatetime(15 * 60 * 1000); // MEMBER_TOKEN_TTL_MS
    exec(
      `INSERT INTO member_tokens (id, member_id, token_hash, expires_at) VALUES (${sqlLiteral(tokenId)}, ${sqlLiteral(memberId)}, ${sqlLiteral(tokenHash)}, ${sqlLiteral(tokenExpiresAt)})`,
    );
    const mintedRow = firstRow(exec(`SELECT consumed_at FROM member_tokens WHERE token_hash = ${sqlLiteral(tokenHash)}`));
    assert(mintedRow && mintedRow.consumed_at === null, 'the token row was minted, unconsumed, only its hash stored');

    // ---- consume: consumeMemberToken's own conditional UPDATE (store.ts), first attempt ----
    console.log('\n--- consume: consumeMemberToken (first attempt, should succeed) ---');
    const consumeAt = sqliteDatetime();
    const firstConsume = exec(
      `UPDATE member_tokens SET consumed_at = ${sqlLiteral(consumeAt)} WHERE token_hash = ${sqlLiteral(tokenHash)} AND consumed_at IS NULL AND expires_at > ${sqlLiteral(consumeAt)}`,
    );
    assert((firstConsume[0]?.meta?.changes ?? 0) === 1, 'the first consume affected exactly one row');

    // ---- consume: a second, double-consume attempt against the SAME token (should be refused) ----
    console.log('\n--- consume: a second attempt against the same token (should be refused) ---');
    const secondAt = sqliteDatetime();
    const secondConsume = exec(
      `UPDATE member_tokens SET consumed_at = ${sqlLiteral(secondAt)} WHERE token_hash = ${sqlLiteral(tokenHash)} AND consumed_at IS NULL AND expires_at > ${sqlLiteral(secondAt)}`,
    );
    assert((secondConsume[0]?.meta?.changes ?? 0) === 0, 'the second, double-consume attempt affected zero rows (the compare-and-set closed the race)');

    // ---- session: createMemberSession's own insert (store.ts) ----
    console.log('\n--- session: createMemberSession ---');
    const sessionId = randomUUID();
    const sessionExpiresAt = sqliteDatetime(30 * 24 * 60 * 60 * 1000); // MEMBER_SESSION_TTL_MS
    exec(
      `INSERT INTO member_sessions (id, member_id, expires_at) VALUES (${sqlLiteral(sessionId)}, ${sqlLiteral(memberId)}, ${sqlLiteral(sessionExpiresAt)})`,
    );

    // ---- session: resolveMemberSession's own join (store.ts) resolves it back to the member ----
    console.log('\n--- session: resolveMemberSession resolves the session back to the member ---');
    const resolveAt = sqliteDatetime();
    const resolved = firstRow(
      exec(
        `SELECT m.id AS id, m.name AS name FROM member_sessions s JOIN members m ON m.id = s.member_id WHERE s.id = ${sqlLiteral(sessionId)} AND s.expires_at > ${sqlLiteral(resolveAt)} AND m.archived_at IS NULL`,
      ),
    );
    assert(resolved && resolved.id === memberId, 'the session resolved to the real, FK-checked member row');

    // ---- sign-out: deleteMemberSession's own DELETE ... RETURNING (store.ts) ----
    console.log('\n--- sign-out: deleteMemberSession ---');
    const deleted = firstRow(exec(`DELETE FROM member_sessions WHERE id = ${sqlLiteral(sessionId)} RETURNING member_id`));
    assert(deleted && deleted.member_id === memberId, 'the delete returned the member id it belonged to');

    const afterSignOut = firstRow(
      exec(
        `SELECT m.id AS id FROM member_sessions s JOIN members m ON m.id = s.member_id WHERE s.id = ${sqlLiteral(sessionId)} AND s.expires_at > ${sqlLiteral(sqliteDatetime())} AND m.archived_at IS NULL`,
      ),
    );
    assert(!afterSignOut, 'the session no longer resolves after sign-out');

    console.log('\nmember-auth-write-path: all assertions passed.');
  } finally {
    if (KEEP) {
      console.log(`\n--keep set: leaving ${DB_NAME} in place. Delete manually with:`);
      console.log(`  npx wrangler d1 delete ${DB_NAME} -y`);
    } else {
      console.log(`\nDeleting scratch database ${DB_NAME}`);
      wrangler(['d1', 'delete', DB_NAME, '-y']);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
