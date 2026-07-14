#!/usr/bin/env node
/**
 * Bootstraps the local CLUB_DB (asc-club) D1 replica the e2e webServer serves against, run
 * before every `npm run test:e2e` (wired into `playwright.config.ts`'s `webServer.command`).
 *
 * WHY THIS SCRIPT EXISTS: `.wrangler/` is gitignored, so a CI runner's local D1 replica starts
 * completely empty every run, while a developer's own workstation replica already carries
 * whatever migrations and rows a prior session left behind. Neither state alone is enough for
 * the join and class-door specs (`e2e/join-and-class-door.spec.ts`), which need the real
 * asc-club schema (settings, households, members, memberships -- not just the events/classes
 * subset the visual suite's own fixture used to need): this script applies every asc-club
 * migration idempotently (skipped if the schema is already there, checked via the `settings`
 * table `0001_substrate` always creates), then reseeds the suite's own fixture rows fresh every
 * run, so both a cold CI checkout and a warm workstation replica end up in the identical state.
 *
 * `wrangler d1 execute --local` never touches the real asc-club data the admin screens and the
 * import scripts own; it only ever writes the gitignored local replica.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const migrationsDir = path.join(repoRoot, 'migrations/asc-club');

function d1File(relativeSqlPath) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'asc-club', '--local', '--file', relativeSqlPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function schemaAlreadyMigrated() {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'asc-club',
      '--local',
      '--json',
      '--command',
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'",
    ],
    { cwd: repoRoot },
  ).toString();
  const [{ results }] = JSON.parse(out);
  return results.length > 0;
}

function applyMigrations() {
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const dir of migrationDirs) {
    d1File(path.join(migrationsDir, dir, 'forward.sql'));
  }
}

if (!schemaAlreadyMigrated()) {
  applyMigrations();
}

d1File(path.join(repoRoot, 'e2e/fixtures/events-seed.sql'));
d1File(path.join(repoRoot, 'e2e/fixtures/signup-seed.sql'));
