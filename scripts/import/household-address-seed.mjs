#!/usr/bin/env node
/**
 * Import script: the MembershipWorks (MW) member export -> asc-club's `households` street
 * address (migration `0027_directory_domain`'s `address_line1`/`address_line2`/`state`/
 * `postal_code` columns; `city` already exists and is already populated by `mw-members.mjs`,
 * and stays that import's domain, never this one's).
 *
 * ONE ROOF, ONE ADDRESS: a household's street, state, and postal code come from its PRIMARY
 * member's export row only (`households.primary_member_id` -> `members.mw_account_id` ->
 * the export's `Account ID`). There is no separate line-2 column in the export, so
 * `address_line2` is never touched by this seeder.
 *
 * UPDATE-IF-NULL ONLY: this seeder only ever fills a column that is currently `NULL` on the
 * household. It never overwrites a value a member has since edited by hand, so a re-run (or a
 * run after a real edit) converges to a no-op on every column it has already filled. Values are
 * stored VERBATIM from the export -- some rows are ALL CAPS -- re-casing free-typed street text
 * is error-prone and left to a later polish pass.
 *
 * Usage:
 *   node scripts/import/household-address-seed.mjs --dry-run [--source PATH]
 *   node scripts/import/household-address-seed.mjs [--source PATH] [--club-db-name NAME]
 *
 * `--club-db-name` overrides the real write target; only ever used to scratch-prove this script
 * (including its rollback file) against a disposable database, never for a real run. Needs
 * `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
 * access to the real `asc-club` database; always `--remote`, there is no local-D1 mode here.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMwCsv } from './mw-members.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const clubDbFlagIndex = process.argv.indexOf('--club-db-name');
const CLUB_DB_NAME = clubDbFlagIndex !== -1 ? process.argv[clubDbFlagIndex + 1] : 'asc-club';
const sourceFlagIndex = process.argv.indexOf('--source');
const SOURCE_PATH =
  sourceFlagIndex !== -1
    ? process.argv[sourceFlagIndex + 1]
    : path.join(os.homedir(), '.local', 'asc-data', 'mw-export-2026-07-13.csv');

const WORKSHEET_PATH = path.join(os.homedir(), '.local', 'asc-data', 'household-address-worksheet.md');

/** The three columns this seeder owns, in the fixed order every SET/WHERE clause follows. */
const ADDRESS_COLUMNS = /** @type {const} */ (['address_line1', 'state', 'postal_code']);

// ---------------------------------------------------------------------------
// Pure transforms (exported for the test suite; touch no filesystem or network).
// ---------------------------------------------------------------------------

/**
 * Normalizes one export address cell: trims whitespace, and treats an empty or whitespace-only
 * cell as absent (`null`), never as `''`. The text itself is stored verbatim otherwise -- no
 * re-casing.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeAddressCell(value) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * @typedef {object} HouseholdSrc
 * @property {string} id
 * @property {string} name
 * @property {string | null} primary_member_id
 * @property {string | null} address_line1
 * @property {string | null} state
 * @property {string | null} postal_code
 * @property {string | null} mw_account_id the PRIMARY member's `mw_account_id`, already joined
 */

/**
 * @typedef {object} AddressUpdate
 * @property {string} householdId
 * @property {string} householdName
 * @property {string} [address_line1]
 * @property {string} [state]
 * @property {string} [postal_code]
 */

/**
 * @typedef {object} SkippedHousehold
 * @property {string} householdId
 * @property {string} householdName
 * @property {'no-mw-account' | 'no-export-match' | 'no-street' | 'already-filled'} reason
 */

/**
 * Plans the whole seed run against already-fetched, plain-object source data (no database or
 * filesystem access here, so this stays unit-testable). Every household lands in exactly one
 * bucket: `updates` (at least one currently-null column will be filled) or `skipped` (with a
 * reason). An update only ever names a column that is BOTH currently `null` on the household AND
 * non-empty in the matched export row -- never an empty or `null` set.
 * @param {HouseholdSrc[]} households
 * @param {Map<string, Record<string, string>>} exportByAccountId export rows keyed by `Account ID`
 * @returns {{ updates: AddressUpdate[], skipped: SkippedHousehold[] }}
 */
export function planAddressSeed(households, exportByAccountId) {
  /** @type {AddressUpdate[]} */
  const updates = [];
  /** @type {SkippedHousehold[]} */
  const skipped = [];

  for (const household of households) {
    if (!household.mw_account_id) {
      skipped.push({ householdId: household.id, householdName: household.name, reason: 'no-mw-account' });
      continue;
    }

    const exportRow = exportByAccountId.get(household.mw_account_id);
    if (!exportRow) {
      skipped.push({ householdId: household.id, householdName: household.name, reason: 'no-export-match' });
      continue;
    }

    const street = normalizeAddressCell(exportRow['Address (Street)']);
    if (!street) {
      skipped.push({ householdId: household.id, householdName: household.name, reason: 'no-street' });
      continue;
    }

    const state = normalizeAddressCell(exportRow['Address (State/Province)']);
    const postalCode = normalizeAddressCell(exportRow['Address (Postal Code)']);

    /** @type {AddressUpdate} */
    const update = { householdId: household.id, householdName: household.name };
    if (household.address_line1 == null) update.address_line1 = street;
    if (household.state == null && state) update.state = state;
    if (household.postal_code == null && postalCode) update.postal_code = postalCode;

    const columnsSet = ADDRESS_COLUMNS.filter((c) => c in update);
    if (columnsSet.length === 0) {
      skipped.push({ householdId: household.id, householdName: household.name, reason: 'already-filled' });
      continue;
    }

    updates.push(update);
  }

  return { updates, skipped };
}

// ---------------------------------------------------------------------------
// The wrangler-shelling CLI (guarded so importing this module for tests never runs it, the same
// dual-mode idiom `boat-seed.mjs` and `mw-members.mjs` document).
// ---------------------------------------------------------------------------

/** @param {unknown} value */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** @param {string[]} args */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** @param {string} dbName @param {string} sql @returns {Record<string, unknown>[]} */
function query(dbName, sql) {
  const out = wrangler(['d1', 'execute', dbName, '--remote', '--command', sql, '--json']);
  return JSON.parse(out)[0].results;
}

/**
 * Renders the machine-local review worksheet Geoff reads before the real apply run. Never
 * committed (member names and addresses appear in it).
 * @param {{ updates: AddressUpdate[], skipped: SkippedHousehold[] }} plan
 */
function renderWorksheet(plan) {
  const lines = [
    '# household-address-seed: worksheet (machine-local; never committed)',
    '',
    `Generated by scripts/import/household-address-seed.mjs, ${new Date().toISOString()}.`,
    '',
    `${plan.updates.length} household(s) to update; ${plan.skipped.length} skipped.`,
    '',
    '## To update',
    '',
  ];
  for (const u of plan.updates) {
    const fields = ADDRESS_COLUMNS.filter((c) => c in u)
      .map((c) => `${c}=${JSON.stringify(u[c])}`)
      .join(', ');
    lines.push(`- ${u.householdName}: ${fields}`);
  }
  if (plan.updates.length === 0) lines.push('(none)');

  lines.push('', '## Skipped', '');
  for (const s of plan.skipped) lines.push(`- ${s.householdName}: ${s.reason}`);
  if (plan.skipped.length === 0) lines.push('(none)');

  return lines.join('\n') + '\n';
}

async function main() {
  const households = /** @type {HouseholdSrc[]} */ (
    query(
      CLUB_DB_NAME,
      `SELECT h.id, h.name, h.primary_member_id, h.address_line1, h.state, h.postal_code, m.mw_account_id ` +
        `FROM households h LEFT JOIN members m ON m.id = h.primary_member_id`,
    )
  );

  const exportRecords = parseMwCsv(readFileSync(SOURCE_PATH, 'utf8'));
  /** @type {Map<string, Record<string, string>>} */
  const exportByAccountId = new Map(exportRecords.map((r) => [r['Account ID'], r]));

  const plan = planAddressSeed(households, exportByAccountId);

  const reasonCounts = { 'no-mw-account': 0, 'no-export-match': 0, 'no-street': 0, 'already-filled': 0 };
  for (const s of plan.skipped) reasonCounts[s.reason] += 1;

  console.log(`household-address-seed: ${households.length} household(s), ${exportRecords.length} export row(s)`);
  console.log(
    `household-address-seed: ${plan.updates.length} to update, ${plan.skipped.length} skipped ` +
      `(no-mw-account=${reasonCounts['no-mw-account']}, no-export-match=${reasonCounts['no-export-match']}, ` +
      `no-street=${reasonCounts['no-street']}, already-filled=${reasonCounts['already-filled']})`,
  );

  if (DRY_RUN) {
    mkdirSync(path.dirname(WORKSHEET_PATH), { recursive: true });
    writeFileSync(WORKSHEET_PATH, renderWorksheet(plan));
    console.log(`household-address-seed: worksheet written to ${WORKSHEET_PATH}`);
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  const batchId = `household-address-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const statements = [];
  let updated = 0;

  for (const u of plan.updates) {
    const columns = ADDRESS_COLUMNS.filter((c) => c in u);
    const setClause = columns.map((c) => `${c} = ${sqlLiteral(u[c])}`).join(', ');
    const guardClause = columns.map((c) => `${c} IS NULL`).join(' AND ');
    statements.push(`UPDATE households SET ${setClause} WHERE id = ${sqlLiteral(u.householdId)} AND ${guardClause};`);

    /** @type {Record<string, string>} */
    const detailColumns = {};
    for (const c of columns) detailColumns[c] = /** @type {string} */ (u[c]);
    const detail = JSON.stringify({ batchId, ...detailColumns });
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:household-address', 'import.update', 'household', ${sqlLiteral(u.householdId)}, ${sqlLiteral(detail)});`,
    );
    updated += 1;
  }

  const batchDetail = JSON.stringify({
    updated,
    skipped: plan.skipped.length,
    skippedNoStreet: reasonCounts['no-street'],
    skippedAlreadyFilled: reasonCounts['already-filled'],
    skippedNoMwAccount: reasonCounts['no-mw-account'],
    skippedNoExportMatch: reasonCounts['no-export-match'],
    sourceHouseholds: households.length,
  });
  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:household-address', 'import.batch', 'household', NULL, ${sqlLiteral(batchDetail)});`,
  );

  console.log(`\nhousehold-address-seed: batch ${batchId} -- ${updated} household(s) to update`);

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'household-address-seed-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join('\n'));
  try {
    wrangler(['d1', 'execute', CLUB_DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`household-address-seed: applied to ${CLUB_DB_NAME}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
