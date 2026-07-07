#!/usr/bin/env node
/**
 * Import script: the MembershipWorks (MW) export -> asc-club's household/member/membership core.
 *
 * Source: a local CSV file, never committed (PII; `docs/mw-export-findings.md` keeps the
 * structural findings this script's mapping depends on, not the file itself). The path is read at
 * runtime only, defaulting to `~/.local/asc-data/mw-export-2026-07-07.csv`, overridable with
 * `--source`.
 *
 * Every row is a primary account (the export's own `Parent Account ID` is empty throughout;
 * household sub-members are a later import). Per row this creates one household, one primary
 * member, and one current-season membership row, all in a single natural-key upsert on
 * `members.email`: an email already present in `asc-club` is left untouched (this is an import,
 * not an edit, the same rule `people.ts`'s `ensureMember` already sets for the public-signup
 * path), so re-running the whole file is a no-op past the first run.
 *
 * A row with more than one, or fewer than one, of the three one-hot tier flags (`Family`,
 * `Single`, `Young adult`) is refused, reported, and not imported. A second row in the same file
 * naming an email already claimed by an earlier row in the same run is refused the same way (the
 * first occurrence wins). Neither refusal ever touches the real database.
 *
 * No `credit_grants` row is ever created here (Geoff's rule: the ledger starts empty, the
 * committee enters real balances by hand).
 *
 * Usage:
 *   node scripts/import/mw-members.mjs --dry-run [--source PATH]
 *   node scripts/import/mw-members.mjs [--source PATH] [--spot-check N]
 *
 * Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
 * access to the real `asc-club` database; always `--remote`, there is no local-D1 mode here.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** `--db-name` overrides the real `asc-club` target; only ever used to scratch-prove this
 *  script (including its rollback file) against a disposable database, never for a real run. */
const dbNameFlagIndex = process.argv.indexOf('--db-name');
const DB_NAME = dbNameFlagIndex !== -1 ? process.argv[dbNameFlagIndex + 1] : 'asc-club';

// ---------------------------------------------------------------------------
// Pure transform (exported for the test suite; touches no filesystem or network).
// ---------------------------------------------------------------------------

/** A row this import declines to write, carrying enough context to report without re-reading the
 *  source CSV: the account identity (never the full row, so a caller can log or store this
 *  without repeating every PII column) and a plain-language reason. */
export class RowRefusedError extends Error {
  /**
   * @param {string} reason
   * @param {{ accountId: string, accountName: string, email: string }} context
   */
  constructor(reason, context) {
    super(reason);
    this.name = 'RowRefusedError';
    this.reason = reason;
    this.context = context;
  }
}

const TIER_FLAG_COLUMNS = /** @type {const} */ (['Family', 'Single', 'Young adult']);
const TIER_BY_FLAG_COLUMN = /** @type {const} */ ({
  Family: 'family',
  Single: 'individual',
  'Young adult': 'young-adult',
});

/** The published tier prices, whole dollars (the schema's own convention: "money as INTEGER
 *  whole dollars, the club has no cents anywhere"), matching `TIER_PRICING` in
 *  `src/admin-club/lib/demo-members.ts`. */
export const TIER_PRICE = /** @type {const} */ ({
  individual: 250,
  family: 500,
  'young-adult': 100,
});

/** A per-field suppression column that, when set, maps to `directory_visibility: 'partial'`
 *  rather than the full `'hidden'` `Do not list in directory` flag. An array because the export
 *  may grow more of these; today it carries exactly one. */
const SUPPRESSION_COLUMNS = ['Do not show street address in profile'];

/**
 * Derives the one membership tier a row's one-hot flag columns encode, refusing a row that sets
 * zero or more than one of `Family`/`Single`/`Young adult`.
 * @param {Record<string, string>} record
 * @returns {'individual' | 'family' | 'young-adult'}
 */
export function deriveTier(record) {
  const set = TIER_FLAG_COLUMNS.filter((col) => record[col]?.trim());
  if (set.length !== 1) {
    throw new RowRefusedError(
      set.length === 0 ? 'no tier flag set' : `multiple tier flags set: ${set.join(', ')}`,
      { accountId: record['Account ID'], accountName: record['Account Name'], email: record.Email },
    );
  }
  return TIER_BY_FLAG_COLUMN[/** @type {typeof TIER_FLAG_COLUMNS[number]} */ (set[0])];
}

/**
 * Maps the export's directory flags to `members.directory_visibility`: the full `Do not list in
 * directory` flag wins over any per-field suppression flag, which in turn wins over the default.
 * @param {Record<string, string>} record
 * @returns {'visible' | 'partial' | 'hidden'}
 */
export function deriveDirectoryVisibility(record) {
  if (record['Do not list in directory']?.trim()) return 'hidden';
  if (SUPPRESSION_COLUMNS.some((col) => record[col]?.trim())) return 'partial';
  return 'visible';
}

/**
 * Normalizes a phone number to E.164 with a +1 default, per the ruling `docs/mw-export-findings.md`
 * records: the export's own bare 11-digit, spaced, and already-+1 forms all normalize the same way
 * once non-digit characters are stripped.
 * @param {string} raw
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @returns {string}
 */
export function normalizePhoneE164(raw, context) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  throw new RowRefusedError(`unrecognized phone format: ${raw}`, context);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parses the export's `Mon D, YYYY` date shape (e.g. `Jul 8, 2027`) to a civil-date ISO string
 * (`YYYY-MM-DD`), the schema's own convention for every other civil date column.
 * @param {string} raw
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @returns {string}
 */
export function parseMwDateToIso(raw, context) {
  const m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})$/.exec(raw.trim());
  const monthIndex = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || monthIndex === -1) {
    throw new RowRefusedError(`unrecognized date format: ${raw}`, context);
  }
  const month = String(monthIndex + 1).padStart(2, '0');
  const day = m[2].padStart(2, '0');
  return `${m[3]}-${month}-${day}`;
}

/** @param {Record<string, string>} record */
function memberNameFrom(record) {
  return [record['First Name'], record['Last Name']].filter((s) => s?.trim()).join(' ').trim();
}

/**
 * @typedef {object} TransformedRow
 * @property {string} accountId
 * @property {string} email
 * @property {string} householdName
 * @property {string | null} city
 * @property {string} memberName
 * @property {string} phone E.164
 * @property {'individual' | 'family' | 'young-adult'} tier
 * @property {number} pricePaid
 * @property {string} paidAt ISO civil date (the renewal date, per the import's own ruling)
 * @property {'visible' | 'partial' | 'hidden'} directoryVisibility
 * @property {string} billingMethod
 */

/**
 * Transforms one MW export record into the shape this import writes, or throws
 * {@link RowRefusedError} for a row this import declines to write.
 * @param {Record<string, string>} record
 * @returns {TransformedRow}
 */
export function transformRecord(record) {
  const context = {
    accountId: record['Account ID'],
    accountName: record['Account Name'],
    email: record.Email?.trim().toLowerCase(),
  };
  const tier = deriveTier(record);
  const phone = normalizePhoneE164(record.Phone, context);
  const paidAt = parseMwDateToIso(record['Renewal Date'], context);
  return {
    accountId: record['Account ID'],
    email: context.email,
    householdName: record['Account Name']?.trim(),
    city: record['Address (City)']?.trim() || null,
    memberName: memberNameFrom(record),
    phone,
    tier,
    pricePaid: TIER_PRICE[tier],
    paidAt,
    directoryVisibility: deriveDirectoryVisibility(record),
    billingMethod: record['Billing Method']?.trim(),
  };
}

/**
 * @typedef {object} ImportPlan
 * @property {TransformedRow[]} toCreate rows with no existing `members.email` match
 * @property {TransformedRow[]} skippedExisting rows whose email already exists (idempotent no-op)
 * @property {{ reason: string, accountId: string, accountName: string, email: string }[]} refusals
 * @property {string[]} recurringEmails every successfully-transformed row's email whose
 *   `Billing Method` reads `Recurring`
 */

/**
 * Plans the whole run: transforms every record, refusing malformed rows and duplicate emails
 * within the same file (first occurrence wins), then splits the rest into rows to create and rows
 * already present (the idempotent re-run path). Touches no database; `existingEmails` is supplied
 * by the caller.
 * @param {Record<string, string>[]} records
 * @param {Set<string>} existingEmails lowercased emails already in `members`
 * @returns {ImportPlan}
 */
export function planImport(records, existingEmails) {
  /** @type {ImportPlan} */
  const plan = { toCreate: [], skippedExisting: [], refusals: [], recurringEmails: [] };
  const seenEmails = new Set();

  for (const record of records) {
    let row;
    try {
      row = transformRecord(record);
    } catch (err) {
      if (err instanceof RowRefusedError) {
        plan.refusals.push({ reason: err.reason, ...err.context });
        continue;
      }
      throw err;
    }

    if (seenEmails.has(row.email)) {
      plan.refusals.push({
        reason: 'duplicate email within csv (first occurrence imported)',
        accountId: row.accountId,
        accountName: row.householdName,
        email: row.email,
      });
      continue;
    }
    seenEmails.add(row.email);

    if (row.billingMethod === 'Recurring') plan.recurringEmails.push(row.email);

    if (existingEmails.has(row.email)) plan.skippedExisting.push(row);
    else plan.toCreate.push(row);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// CSV parsing (no dependency: a small RFC4180-shaped state machine, quoted fields with "" escapes
// and embedded commas/newlines, which the real export's `Address (Full)` and `Release of
// liability` columns both carry).
// ---------------------------------------------------------------------------

/** @param {string} text @returns {string[][]} */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let sawAnything = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnything = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      sawAnything = true;
    } else if (c === '\r') {
      // skip; \n (below) ends the row
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAnything = false;
    } else {
      field += c;
      sawAnything = true;
    }
  }
  if (sawAnything || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** @param {string} text @returns {Record<string, string>[]} */
export function parseMwCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const [header, ...body] = parseCsvRows(clean).filter((r) => !(r.length === 1 && r[0] === ''));
  return body.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}

// ---------------------------------------------------------------------------
// SQL generation + the wrangler-shelling CLI (guarded so importing this module for tests never
// runs it; the same dual-mode idiom `scripts/verify/real-d1-write-path.mjs` documents).
// ---------------------------------------------------------------------------

/** @param {unknown} value */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Builds the household + member + primary-set + membership + audit statements for one new row.
 * Mirrors `people.ts`'s `ensureMember` creation batch (household unset, member, then the primary
 * update), plus the membership row and its own audit trail this import adds on top.
 * @param {TransformedRow} row
 * @param {string} batchId
 */
function statementsForRow(row, batchId) {
  const householdId = randomUUID();
  const memberId = randomUUID();
  const membershipId = randomUUID();
  const detail = `import_batch=${batchId}; source_account=${row.accountId}`;
  return [
    `INSERT INTO households (id, name, city) VALUES (${sqlLiteral(householdId)}, ${sqlLiteral(row.householdName)}, ${sqlLiteral(row.city)})`,
    `INSERT INTO members (id, household_id, name, email, phone, directory_visibility) VALUES (${sqlLiteral(memberId)}, ${sqlLiteral(householdId)}, ${sqlLiteral(row.memberName)}, ${sqlLiteral(row.email)}, ${sqlLiteral(row.phone)}, ${sqlLiteral(row.directoryVisibility)})`,
    `UPDATE households SET primary_member_id = ${sqlLiteral(memberId)} WHERE id = ${sqlLiteral(householdId)}`,
    `INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, stripe_ref) VALUES (${sqlLiteral(membershipId)}, ${sqlLiteral(householdId)}, (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'current_season'), ${sqlLiteral(row.tier)}, ${row.pricePaid}, ${sqlLiteral(row.paidAt)}, NULL)`,
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'household', ${sqlLiteral(householdId)}, ${sqlLiteral(detail)})`,
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'member', ${sqlLiteral(memberId)}, ${sqlLiteral(`${detail}; tier=${row.tier}`)})`,
  ];
}

/** @param {string[]} args */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Runs a small SELECT via `--command --json` (the query path; `--file` silently drops SELECT
 *  output, per this repo's own migration mechanics convention) and returns its `results` array.
 *  @param {string} sql @returns {Record<string, unknown>[]} */
function query(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--command', sql, '--json']);
  return JSON.parse(out)[0].results;
}

/** @param {string} email */
function redactEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}***@${domain}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sourceFlagIndex = args.indexOf('--source');
  const sourcePath =
    sourceFlagIndex !== -1
      ? args[sourceFlagIndex + 1]
      : path.join(os.homedir(), '.local', 'asc-data', 'mw-export-2026-07-07.csv');
  const spotCheckFlagIndex = args.indexOf('--spot-check');
  const spotCheckCount = spotCheckFlagIndex !== -1 ? Number(args[spotCheckFlagIndex + 1]) : 3;

  const seasonRow = query(`SELECT value FROM settings WHERE key = 'current_season'`)[0];
  const season = Number(seasonRow.value);
  console.log(`mw-members: current_season=${season}`);

  const existingRows = query(`SELECT email FROM members`);
  const existingEmails = new Set(existingRows.map((r) => String(r['email']).trim().toLowerCase()));
  console.log(`mw-members: ${existingEmails.size} member email(s) already in asc-club`);

  const csvText = readFileSync(sourcePath, 'utf8');
  const records = parseMwCsv(csvText);
  console.log(`mw-members: ${records.length} source row(s) in ${sourcePath}`);

  const plan = planImport(records, existingEmails);
  const batchId = `mw-members-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  const tierCounts = { individual: 0, family: 0, 'young-adult': 0 };
  const visibilityCounts = { visible: 0, partial: 0, hidden: 0 };
  for (const row of [...plan.toCreate, ...plan.skippedExisting]) {
    tierCounts[row.tier] += 1;
    visibilityCounts[row.directoryVisibility] += 1;
  }

  console.log(`\nmw-members: plan for batch ${batchId}`);
  console.log(`  to create: ${plan.toCreate.length}`);
  console.log(`  already present (skipped, idempotent): ${plan.skippedExisting.length}`);
  console.log(`  refused: ${plan.refusals.length}`);
  console.log(`  tier distribution: family=${tierCounts.family} individual=${tierCounts.individual} young-adult=${tierCounts['young-adult']}`);
  console.log(`  visibility distribution: visible=${visibilityCounts.visible} partial=${visibilityCounts.partial} hidden=${visibilityCounts.hidden}`);
  console.log(`  recurring billing (${plan.recurringEmails.length}): ${plan.recurringEmails.map(redactEmail).join(', ')}`);
  if (plan.refusals.length) {
    console.log('  refusal detail:');
    for (const r of plan.refusals) console.log(`    ${r.accountId} (${redactEmail(r.email)}): ${r.reason}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  if (plan.toCreate.length === 0) {
    console.log('\nmw-members: nothing to create (idempotent no-op run).');
  } else {
    const statements = plan.toCreate.flatMap((row) => statementsForRow(row, batchId));
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.batch', 'member', NULL, ` +
        `${sqlLiteral(
          `import_batch=${batchId}; source_count=${records.length}; created=${plan.toCreate.length}; ` +
            `skipped_existing=${plan.skippedExisting.length}; refused=${plan.refusals.length}; ` +
            `tier_family=${tierCounts.family}; tier_individual=${tierCounts.individual}; tier_young_adult=${tierCounts['young-adult']}; ` +
            `visibility_visible=${visibilityCounts.visible}; visibility_partial=${visibilityCounts.partial}; visibility_hidden=${visibilityCounts.hidden}; ` +
            `recurring_billing_count=${plan.recurringEmails.length}; ` +
            `payment inferred from renewal date; reconcile on accounting export`,
        )});`,
    );

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mw-members-'));
    const tmpFile = path.join(tmpDir, 'import.sql');
    writeFileSync(tmpFile, statements.join(';\n'));
    try {
      wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', tmpFile]);
      console.log(`\nmw-members: applied ${plan.toCreate.length} new row(s) to ${DB_NAME}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  if (spotCheckCount > 0 && plan.toCreate.length > 0) {
    console.log(`\nmw-members: spot-checking ${Math.min(spotCheckCount, plan.toCreate.length)} imported row(s)`);
    const sample = plan.toCreate.slice(0, spotCheckCount);
    for (const expected of sample) {
      const [actual] = query(
        `SELECT m.name AS member_name, m.email, m.phone, m.directory_visibility, h.name AS household_name, h.city, ` +
          `ms.tier, ms.price_paid, ms.paid_at ` +
          `FROM members m JOIN households h ON h.id = m.household_id ` +
          `JOIN memberships ms ON ms.household_id = h.id ` +
          `WHERE m.email = ${sqlLiteral(expected.email)}`,
      );
      const ok =
        actual &&
        actual.member_name === expected.memberName &&
        actual.phone === expected.phone &&
        actual.directory_visibility === expected.directoryVisibility &&
        actual.household_name === expected.householdName &&
        (actual.city ?? null) === expected.city &&
        actual.tier === expected.tier &&
        actual.price_paid === expected.pricePaid &&
        actual.paid_at === expected.paidAt;
      console.log(`  ${ok ? 'ok' : 'FAIL'}: ${expected.accountId} (${redactEmail(expected.email)})`);
      if (!ok) {
        console.log('    expected:', expected);
        console.log('    actual:  ', actual);
        process.exitCode = 1;
      }
    }
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
