#!/usr/bin/env node
/**
 * Import script v2: the full MembershipWorks (MW) history -> asc-club's member/membership/class
 * core. Supersedes v1's single-pass primary-only upsert (still in git history): this version
 * reads THREE local sources -- the full member export (primaries + household sub-members), the
 * canon accounting export (every Membership/Event/Donation transaction), and a directory of
 * per-event attendee rosters -- and plans six phases before writing anything:
 *
 *   1. Update pass over rows that already exist in `asc-club` (matched by email, the only key
 *      before migration 0020): backfill `mw_account_id`, recase names.
 *   2. New primaries: household + member (no membership row -- that arrives in phase 4).
 *   3. Household sub-members ("Additional Contacts"): resolved to their parent's household via
 *      `Parent Account ID` -> `mw_account_id`.
 *   4. Membership history: one row per net Membership transaction, tier from the accounting
 *      `Items` field, season derived from the renewal-date pair, an in-place-update guard for
 *      the one pre-existing (July 7) row per household.
 *   5. Historical classes: mints `classes` rows for every accounting-referenced class instance
 *      missing from the database (an explicit reference -> {season, slug, name, track,
 *      start_date} map, `HISTORICAL_CLASS_MAP`).
 *   6. Enrollments: roster-driven where an attendee file exists (validated against accounting by
 *      buyer-account overlap), an accounting-only fallback otherwise.
 *
 * None of the three sources are ever committed (PII); every path is read at runtime only,
 * overridable with `--source` (members), `--accounting`, and `--attendees` (a directory).
 * `docs/mw-export-findings.md` keeps the structural findings this script's mapping depends on.
 *
 * Accounting pre-processing (shared by phases 4-6, see {@link preprocessAccounting}): `Items =
 * 'Voided'` rows are dropped outright; a negative-total row is netted against its most recent
 * prior same-account/same-type(/same-Event-Reference) positive row of the same absolute amount,
 * canceling both; an unmatched refund is refused and reported; Donation rows are reported, never
 * imported; an Event row with an empty `Account ID` is refused and reported.
 *
 * No `credit_grants` row is ever created here (Geoff's rule: the ledger starts empty, the
 * committee enters real balances by hand).
 *
 * Usage:
 *   node scripts/import/mw-members.mjs --dry-run [--source PATH] [--accounting PATH] [--attendees DIR]
 *   node scripts/import/mw-members.mjs [--source PATH] [--accounting PATH] [--attendees DIR]
 *
 * Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
 * access to the real `asc-club` database; always `--remote`, there is no local-D1 mode here.
 *
 * SAFETY -- take a backup before a real run: this import applies as ONE `wrangler d1 execute
 * --remote --file` call with no cross-statement transaction (D1 rejects an explicit BEGIN/COMMIT
 * in a file), so a mid-run failure leaves a partial write. BEFORE any non-dry-run invocation:
 *   npx wrangler d1 export asc-club --remote --output /path/to/backup.sql
 * Recovery after a partial failure is a plain re-run of the same command: every phase's own
 * idempotency check (see the README's "Idempotency and the second run") means a row this run
 * already wrote plans as a no-op the second time through, so the re-run resumes forward rather
 * than duplicating anything already applied. See the README's "Partial-failure recovery" section.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from '../../src/admin-club/lib/member-normalize.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** `--db-name` overrides the real `asc-club` target; only ever used to scratch-prove this
 *  script against a disposable database, never for a real run. */
const dbNameFlagIndex = process.argv.indexOf('--db-name');
const DB_NAME = dbNameFlagIndex !== -1 ? process.argv[dbNameFlagIndex + 1] : 'asc-club';

// ---------------------------------------------------------------------------
// Shared primitives (kept from v1: CSV parsing, date parsing, the refusal type).
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

/** A per-field suppression column that, when set, maps to `directory_visibility: 'partial'`
 *  rather than the full `'hidden'` `Do not list in directory` flag. */
const SUPPRESSION_COLUMNS = ['Do not show street address in profile'];

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

/** @param {Record<string, string>} record */
function memberNameFrom(record) {
  return [record['First Name'], record['Last Name']].filter((s) => s?.trim()).join(' ').trim();
}

/**
 * Redacts an email address for a printed report (`ops-assets.mjs` carries the identical helper;
 * this script never imports across the two, so it is kept small and duplicated rather than
 * introducing a shared module for one four-line function): the local part's first three
 * characters, then `***@domain`. Names may print in this script's own reports (a conductor reads
 * them locally), but an email is the one field kept redacted everywhere it could otherwise leak
 * into a log line or a refusal reason.
 * @param {string} email
 * @returns {string}
 */
function redactEmail(email) {
  const [local, domain] = email.split('@');
  return `${(local ?? '').slice(0, 3)}***@${domain ?? '?'}`;
}

/**
 * Normalizes a phone number for a row this import may refuse: delegates to
 * {@link normalizePhoneE164} and turns its not-normalizable `null` signal into a
 * {@link RowRefusedError}, the import's own stricter rule (a live write path stores the raw
 * value instead; this import wants a human's look at a malformed source record).
 * @param {string} raw
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @returns {string}
 */
function normalizePhoneOrRefuse(raw, context) {
  const normalized = normalizePhoneE164(raw);
  if (normalized === null) throw new RowRefusedError(`unrecognized phone format: ${raw}`, context);
  return normalized;
}

/**
 * Parses a money-shaped CSV cell (`'$1,200'`, `'250'`, `''`) to a finite integer, stripping a
 * leading `$` and thousands commas before `Number()` so a currency-formatted export cell parses
 * rather than refusing. Throws {@link RowRefusedError} when the cleaned value is not a finite
 * integer -- refusing the source row rather than letting a `NaN` or fractional token survive into
 * a plan object and, eventually, a generated SQL statement (real D1 rejects a malformed numeric
 * literal mid-batch).
 * @param {string} raw
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @param {string} fieldLabel
 * @returns {number}
 */
export function parseMoneyToInt(raw, context, fieldLabel) {
  const cleaned = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RowRefusedError(`non-numeric ${fieldLabel}: ${raw}`, context);
  }
  return value;
}

/**
 * Embeds a number as a raw SQL literal, asserting it is a finite integer first -- the last line of
 * defense against a stray `NaN` or fractional token reaching a generated statement (D1 errors
 * mid-batch on either). Every numeric plan field reaching this point was already guarded at
 * derivation time by {@link parseMoneyToInt}, so this assertion should never actually fire; it
 * exists so no code path can ever emit the bare token `NaN` into a statement.
 * @param {number} value
 * @returns {string}
 */
export function sqlInt(value) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`refusing to embed a non-finite/non-integer value in SQL: ${value}`);
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Phases 1-2: the update pass over existing primaries, and new primaries.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ExistingMember
 * @property {string} id
 * @property {string} householdId
 * @property {string} name
 * @property {string | null} email
 * @property {string | null} mwAccountId
 */
/**
 * @typedef {object} ExistingHousehold
 * @property {string} id
 * @property {string} name
 * @property {string | null} city
 * @property {string | null} primaryMemberId
 */
/**
 * @typedef {object} ExistingMembership
 * @property {string} id
 * @property {string} householdId
 * @property {number} season
 * @property {string} tier
 * @property {number} pricePaid
 * @property {string | null} paidAt
 * @property {string | null} stripeRef
 */
/**
 * @typedef {object} ExistingClass
 * @property {string} id
 * @property {number} season
 * @property {string} slug
 * @property {number} fee
 * @property {'adult-teen' | 'youth'} track
 */
/**
 * @typedef {object} ExistingEnrollment
 * @property {string} id
 * @property {string} classId
 * @property {string} memberId
 * @property {boolean} approximate whether this run should treat it as upgradeable identity
 */
/**
 * @typedef {object} ExistingState
 * @property {ExistingMember[]} members
 * @property {ExistingHousehold[]} households
 * @property {ExistingMembership[]} memberships
 * @property {ExistingClass[]} classes
 * @property {ExistingEnrollment[]} enrollments
 */

/**
 * @typedef {object} NewPrimaryRow
 * @property {string} accountId
 * @property {string} householdName
 * @property {string | null} city
 * @property {string} memberName
 * @property {string | null} email
 * @property {string | null} phone
 * @property {'visible' | 'partial' | 'hidden'} directoryVisibility
 */

/**
 * Transforms a primary-account record with no existing match into the household+member shape
 * phase 2 creates. Throws {@link RowRefusedError} for an unparseable (non-blank) phone; a blank
 * phone is `null`, never refused (the sub-member path, {@link planSubMemberRow}, already treats a
 * blank phone the same way).
 * @param {Record<string, string>} record
 * @returns {NewPrimaryRow}
 */
function transformNewPrimary(record) {
  const context = {
    accountId: record['Account ID'],
    accountName: record['Account Name'],
    email: normalizeEmail(record.Email ?? ''),
  };
  const rawPhone = record.Phone?.trim();
  return {
    accountId: record['Account ID'],
    householdName: normalizeNameCaps(record['Account Name']?.trim() ?? ''),
    city: record['Address (City)']?.trim() || null,
    memberName: normalizeNameCaps(memberNameFrom(record)),
    email: record.Email?.trim() ? normalizeEmail(record.Email) : null,
    phone: rawPhone ? normalizePhoneOrRefuse(rawPhone, context) : null,
    directoryVisibility: deriveDirectoryVisibility(record),
  };
}

/**
 * @typedef {object} PrimaryFieldChange
 * @property {string | null} from
 * @property {string} to
 */
/**
 * @typedef {{ kind: 'existing', accountId: string, memberId: string, householdId: string,
 *   memberChanges: Record<string, PrimaryFieldChange>, householdChanges: Record<string, PrimaryFieldChange> }
 *   | { kind: 'create', accountId: string, row: NewPrimaryRow }
 *   | { kind: 'refuse', accountId: string, reason: string }} PrimaryRowPlan
 */

/**
 * Plans a single primary-account record: an update against its existing match (name recasing,
 * `mw_account_id` backfill) or a brand-new household+member. `existingMatch` is looked up by the
 * caller (`mw_account_id` first, then email -- the only key before migration 0020).
 * `emailAlreadyClaimed` tracks new-primary email claims across the whole run (not just the
 * database), the same dedup {@link planSubMemberRow} already applies to sub-members: a second
 * brand-new primary claiming an email another brand-new primary already claimed earlier in this
 * same run is refused rather than minting a second household+member for the same person.
 * @param {Record<string, string>} record
 * @param {ExistingMember | null} existingMatch
 * @param {ExistingHousehold | null} existingHousehold
 * @param {boolean} [emailAlreadyClaimed]
 * @returns {PrimaryRowPlan}
 */
export function planPrimaryRow(record, existingMatch, existingHousehold, emailAlreadyClaimed = false) {
  const accountId = record['Account ID']?.trim() ?? '';
  if (!existingMatch) {
    let row;
    try {
      row = transformNewPrimary(record);
    } catch (err) {
      if (err instanceof RowRefusedError) return { kind: 'refuse', accountId, reason: err.reason };
      throw err;
    }
    if (row.email && emailAlreadyClaimed) {
      return { kind: 'refuse', accountId, reason: `email ${redactEmail(row.email)} already claimed by another new primary earlier in this run` };
    }
    return { kind: 'create', accountId, row };
  }

  /** @type {Record<string, PrimaryFieldChange>} */
  const memberChanges = {};
  const newName = normalizeNameCaps(memberNameFrom(record));
  if (newName && newName !== existingMatch.name) memberChanges.name = { from: existingMatch.name, to: newName };
  if (!existingMatch.mwAccountId) memberChanges.mw_account_id = { from: null, to: accountId };

  /** @type {Record<string, PrimaryFieldChange>} */
  const householdChanges = {};
  const newHouseholdName = normalizeNameCaps(record['Account Name']?.trim() ?? '');
  if (existingHousehold && newHouseholdName && newHouseholdName !== existingHousehold.name) {
    householdChanges.name = { from: existingHousehold.name, to: newHouseholdName };
  }

  return {
    kind: 'existing',
    accountId,
    memberId: existingMatch.id,
    householdId: existingMatch.householdId,
    memberChanges,
    householdChanges,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: household sub-members.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} NewSubMemberRow
 * @property {string} accountId
 * @property {string} householdId
 * @property {string} name
 * @property {string | null} email
 * @property {string | null} emailNote set when a claimed email was suppressed to NULL
 * @property {string | null} phone
 * @property {'visible' | 'partial' | 'hidden'} directoryVisibility
 * @property {string | null} relation the raw `Position/relation` value, audit provenance only
 */
/**
 * @typedef {{ kind: 'create', row: NewSubMemberRow } | { kind: 'refuse', accountId: string, reason: string }} SubMemberRowPlan
 */

/**
 * Plans a single household sub-member record. `parentHouseholdId` is resolved by the caller via
 * `Parent Account ID` -> `mw_account_id` (including any household created earlier in this same
 * run); `emailAlreadyClaimed` likewise tracks claims across the whole run, not just the database.
 * @param {Record<string, string>} record
 * @param {string | undefined} parentHouseholdId
 * @param {boolean} emailAlreadyClaimed
 * @returns {SubMemberRowPlan}
 */
export function planSubMemberRow(record, parentHouseholdId, emailAlreadyClaimed) {
  const accountId = record['Account ID']?.trim() ?? '';
  const relation = record['Position/relation']?.trim() ?? '';
  if (relation.toLowerCase() === 'dog') {
    return { kind: 'refuse', accountId, reason: 'non-person row (Position/relation = Dog)' };
  }
  if (!parentHouseholdId) {
    return {
      kind: 'refuse',
      accountId,
      reason: `parent account ${record['Parent Account ID']?.trim()} not found in any household`,
    };
  }

  const name = normalizeNameCaps(memberNameFrom(record));
  const rawEmail = record.Email?.trim();
  let email = null;
  let emailNote = null;
  if (rawEmail) {
    if (emailAlreadyClaimed) {
      emailNote = `email claimed elsewhere in the run/database; stored NULL (raw was a shared-address duplicate)`;
    } else {
      email = normalizeEmail(rawEmail);
    }
  }

  const rawPhone = record.Phone?.trim();
  let phone = null;
  if (rawPhone) {
    phone = normalizePhoneE164(rawPhone);
    if (phone === null) {
      return { kind: 'refuse', accountId, reason: `unrecognized phone format: ${rawPhone}` };
    }
  }

  return {
    kind: 'create',
    row: {
      accountId,
      householdId: parentHouseholdId,
      name,
      email,
      emailNote,
      phone,
      directoryVisibility: deriveDirectoryVisibility(record),
      relation: relation || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Accounting pre-processing (shared by phases 4-6).
// ---------------------------------------------------------------------------

/**
 * @typedef {object} AccountingRefusal
 * @property {string} reason
 * @property {string} [accountId]
 * @property {string} [date]
 * @property {string} [reference]
 * @property {string} [amount]
 */
/**
 * @typedef {object} NettedPair
 * @property {string} accountId
 * @property {string} type the `Transaction Type` (`Membership` or `Event`)
 * @property {string} amount the absolute transaction amount, as the export's own string
 * @property {string} positiveDate
 * @property {string} negativeDate
 */
/**
 * @typedef {object} AccountingPreprocessResult
 * @property {Record<string, string>[]} netRows every remaining Membership/Event row after
 *   dropping Voided items, netting refunds, and refusing empty-Account-ID Event rows -- sorted
 *   chronologically
 * @property {AccountingRefusal[]} refusals unmatched refunds and empty-Account-ID Event rows
 * @property {{ date: string, accountId: string, amount: string }[]} donationReports
 * @property {NettedPair[]} nettedPairs every refund/positive pair this run canceled, report detail
 * @property {number} voidedCount
 * @property {number} nettedCount number of refund/positive pairs canceled (== nettedPairs.length)
 */

/**
 * Drops `Items = 'Voided'` rows, nets refunds against their most recent prior same-account,
 * same-type (and, for Events, same-`Reference`) positive row of the same absolute amount, reports
 * (never imports) Donation rows, and refuses an Event row with an empty `Account ID`.
 * @param {Record<string, string>[]} records
 * @returns {AccountingPreprocessResult}
 */
export function preprocessAccounting(records) {
  const nonVoided = records.filter((r) => r.Items?.trim() !== 'Voided');
  const voidedCount = records.length - nonVoided.length;

  /** @type {{ date: string, accountId: string, amount: string }[]} */
  const donationReports = [];
  /** @type {Record<string, string>[]} */
  const candidates = [];
  for (const r of nonVoided) {
    if (r['Transaction Type'] === 'Donation') {
      donationReports.push({ date: r.Date, accountId: r['Account ID'], amount: r['Transaction Total'] });
    } else {
      candidates.push(r);
    }
  }

  const withDates = candidates.map((r, i) => ({
    r,
    i,
    iso: parseMwDateToIso(r.Date, { accountId: r['Account ID'], accountName: r.Name, email: '' }),
  }));
  // Same-day tiebreak: positives before negatives, so a same-day refund always sees its own
  // purchase regardless of which row the export happened to list first (a refund-before-purchase
  // csv order used to fail to net); only then the original csv index, for a stable order among
  // same-sign same-day rows.
  withDates.sort((a, b) => {
    if (a.iso !== b.iso) return a.iso < b.iso ? -1 : 1;
    const aIsNegative = Number(a.r['Transaction Total']) < 0 ? 1 : 0;
    const bIsNegative = Number(b.r['Transaction Total']) < 0 ? 1 : 0;
    if (aIsNegative !== bIsNegative) return aIsNegative - bIsNegative;
    return a.i - b.i;
  });

  /** @param {Record<string, string>} r */
  const refundKey = (r) => `${r['Transaction Type']}:${r['Account ID']}:${r['Transaction Type'] === 'Event' ? r.Reference : ''}`;

  /** @type {Map<string, { r: Record<string, string>, i: number, consumed: boolean }[]>} */
  const openPositives = new Map();
  /** @type {AccountingRefusal[]} */
  const refusals = [];
  /** @type {NettedPair[]} */
  const nettedPairs = [];
  const excluded = new Set();

  for (const entry of withDates) {
    const amount = Number(entry.r['Transaction Total']);
    const key = refundKey(entry.r);
    if (amount < 0) {
      const list = openPositives.get(key) ?? [];
      let matchIdx = -1;
      for (let j = list.length - 1; j >= 0; j -= 1) {
        if (!list[j].consumed && Number(list[j].r['Transaction Total']) === -amount) {
          matchIdx = j;
          break;
        }
      }
      if (matchIdx === -1) {
        refusals.push({
          reason: 'unmatched refund',
          accountId: entry.r['Account ID'],
          date: entry.r.Date,
          amount: entry.r['Transaction Total'],
        });
        excluded.add(entry.i);
      } else {
        list[matchIdx].consumed = true;
        excluded.add(list[matchIdx].i);
        excluded.add(entry.i);
        nettedPairs.push({
          accountId: entry.r['Account ID'],
          type: entry.r['Transaction Type'],
          amount: String(-amount),
          positiveDate: list[matchIdx].r.Date,
          negativeDate: entry.r.Date,
        });
      }
    } else {
      const list = openPositives.get(key) ?? [];
      list.push({ r: entry.r, i: entry.i, consumed: false });
      openPositives.set(key, list);
    }
  }

  /** @type {Record<string, string>[]} */
  const netRows = [];
  for (const entry of withDates) {
    if (excluded.has(entry.i)) continue;
    if (entry.r['Transaction Type'] === 'Event' && !entry.r['Account ID']?.trim()) {
      refusals.push({ reason: 'event row missing account id', date: entry.r.Date, reference: entry.r.Reference });
      continue;
    }
    netRows.push(entry.r);
  }

  return { netRows, refusals, donationReports, nettedPairs, voidedCount, nettedCount: nettedPairs.length };
}

// ---------------------------------------------------------------------------
// Phase 4: membership history.
// ---------------------------------------------------------------------------

/** Leading `Items` segment (before the ` - One-time`/` - Recurring` billing-method suffix) ->
 *  membership tier. Both the pre-2025 flag-string form (`Family`, `Single`, `Young adult`) and
 *  the current `... membership` form map to the same three tiers; the four retired
 *  `Youth membership` rows also map to `young-adult`, carrying `mwTier: 'Youth'` as audit
 *  provenance rather than a fourth enum value (not worth a schema change for 4 historical rows). */
const MEMBERSHIP_TIER_ITEM_MAP = new Map([
  ['Single', 'individual'],
  ['Single membership', 'individual'],
  ['Family', 'family'],
  ['Family membership', 'family'],
  ['Young adult', 'young-adult'],
  ['Young adult membership', 'young-adult'],
  ['Youth membership', 'young-adult'],
]);

/**
 * Explicit per-account membership-tier overrides for a two-tier `Items` row
 * {@link deriveMembershipTier} would otherwise refuse. An override applies ONLY at the two-tier
 * refusal branch: it never touches a normal single-tier row, and it never substitutes for the
 * "no recognized tier" refusal either. Geoff's ruling (2026-07-13): account
 * `667e724fa1a5ecb053071dc3`'s `Single membership - One-time, Family membership - One-time` row
 * is FAMILY tier (a mid-transaction upgrade, both segments describing the one real membership,
 * not two separate ones). `price_paid` is unaffected by an override -- it always stays the row's
 * real `Membership Sub-Total`, whatever that is.
 * @type {Record<string, 'individual' | 'family' | 'young-adult'>}
 */
export const MEMBERSHIP_TIER_OVERRIDES = {
  '667e724fa1a5ecb053071dc3': 'family',
};

/**
 * Derives the one membership tier a Membership transaction's `Items` field encodes (its leading
 * comma-separated segment, ignoring add-on segments like `Trailered boat parking...`), refusing a
 * row that names zero or more than one recognized tier -- unless the account has an explicit
 * {@link MEMBERSHIP_TIER_OVERRIDES} entry, in which case the ruled tier wins and `tierOverride`
 * carries the ruling plus the original `Items` text for the audit detail.
 * @param {string} itemsField
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @returns {{ tier: 'individual' | 'family' | 'young-adult', mwTier: string | null, tierOverride: { tier: string, items: string } | null }}
 */
export function deriveMembershipTier(itemsField, context) {
  const segments = (itemsField ?? '').split(',').map((s) => s.trim());
  const found = new Set();
  let mwTier = null;
  for (const segment of segments) {
    const head = segment.split(' - ')[0].trim();
    const tier = MEMBERSHIP_TIER_ITEM_MAP.get(head);
    if (tier) {
      found.add(tier);
      if (head === 'Youth membership') mwTier = 'Youth';
    }
  }
  if (found.size === 0) throw new RowRefusedError(`no recognized membership tier in items: ${itemsField}`, context);
  if (found.size > 1) {
    const override = MEMBERSHIP_TIER_OVERRIDES[context.accountId];
    if (override) {
      return { tier: override, mwTier, tierOverride: { tier: override, items: itemsField } };
    }
    throw new RowRefusedError(`row names two tiers: ${itemsField}`, context);
  }
  return { tier: /** @type {'individual' | 'family' | 'young-adult'} */ ([...found][0]), mwTier, tierOverride: null };
}

/**
 * `season = year(Renewal Date After Transaction) - 1`, falling back to `year(Date)` when that
 * column is blank (the fallback fires for zero accounts in the real data, per the containment
 * facts, but stays in code as the honest default).
 * @param {Record<string, string>} row
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @returns {number}
 */
export function deriveMembershipSeason(row, context) {
  const renewalAfter = row['Renewal Date After Transaction']?.trim();
  if (renewalAfter) {
    const iso = parseMwDateToIso(renewalAfter, context);
    return Number(iso.slice(0, 4)) - 1;
  }
  const iso = parseMwDateToIso(row.Date, context);
  return Number(iso.slice(0, 4));
}

/**
 * @typedef {object} MembershipPlanRow
 * @property {string} householdId
 * @property {number} season
 * @property {'individual' | 'family' | 'young-adult'} tier
 * @property {string | null} mwTier
 * @property {{ tier: string, items: string } | null} tierOverride set when
 *   {@link MEMBERSHIP_TIER_OVERRIDES} ruled a two-tier row's tier; carries the ruling plus the
 *   original `Items` text for the audit detail
 * @property {number} pricePaid
 * @property {string} paidAt
 * @property {string | null} stripeRef
 * @property {string} accountId
 */
/**
 * @typedef {object} MembershipUpdateBefore snapshot of the existing row's own fields, for the
 *   report's before -> after detail
 * @property {number} season
 * @property {string} tier
 * @property {number} pricePaid
 * @property {string | null} paidAt
 * @property {string | null} stripeRef
 */
/**
 * @typedef {object} MembershipDeleteRow
 * @property {string} membershipId
 * @property {string} householdId
 * @property {string} accountId the netted pair's own account -- report/audit provenance
 * @property {string} reason human-readable justification, also the `import.delete` audit detail
 */
/**
 * @typedef {object} MembershipPlan
 * @property {MembershipPlanRow[]} toInsert
 * @property {(MembershipPlanRow & { membershipId: string, before: MembershipUpdateBefore })[]} toUpdate
 * @property {MembershipDeleteRow[]} toDelete
 * @property {{ reason: string, accountId: string }[]} refusals
 * @property {{ reason: string, accountId: string, season: number, supersededBy: string }[]} collisions
 */

/**
 * Plans every net Membership transaction, household by household. Within a household, only its
 * single MOST RECENT transaction (by original chronological order -- {@link preprocessAccounting}
 * already sorted `netMembershipRows` this way -- never by computed season, which does not
 * monotonically track transaction date) is ever eligible to update an existing row in place,
 * REWRITING that row's season along with tier/price/paid_at/stripe_ref, guarded exactly as before
 * (`stripe_ref IS NULL AND paid_at` equals the members-CSV renewal date, the July-7
 * approximation's own signature). Every OTHER transaction for that household always inserts its
 * own history row, matched against the database by its own `(household, season)` key purely for
 * idempotency (never eligible to update, even when a row happens to already sit at that exact
 * key) -- this is what keeps a stale approximation row from surviving under a season none of a
 * household's real transactions actually computed to.
 *
 * A same-`(household, season)` collision between two of a household's own transactions is
 * resolved before either classification: the chronologically later one wins, the earlier is
 * reported as superseded. Because every winning candidate is already unique per `(household,
 * season)` by construction, this single mechanism is also what guarantees the real `UNIQUE
 * (household_id, season)` constraint can never be violated by this plan, whichever candidate (the
 * update or an insert) ends up at a given season -- no separate collision check is needed for the
 * update's own new season.
 *
 * A household with an existing row but NO winning candidate at all (every one of its Membership
 * transactions refund-netted away to nothing, Geoff's ruling 2026-07-14: accounting is canon) is
 * a DELETE candidate, guarded the same way an update is: `stripe_ref IS NULL AND paid_at` equals
 * the members-CSV renewal date for the netted pair's own account. A non-import-shaped row (a real
 * edit or a real write already landed) is never deleted -- it is reported instead, same spirit as
 * the update guard. A household with no netted pair at all (never touched by any Membership
 * transaction, netted or otherwise) is left alone; the delete only fires on POSITIVE evidence of
 * a fully-refunded membership, never on the mere absence of accounting data.
 * @param {Record<string, string>[]} netMembershipRows
 * @param {Map<string, string>} mwAccountIdToHouseholdId
 * @param {Map<string, ExistingMembership[]>} existingMembershipsByHousehold every existing
 *   membership row for a household, keyed by householdId (today's real data carries at most one
 *   per household, the July-7 approximation; a household with more than one uses its first row as
 *   the sole update/delete-eligible target, documented here rather than assumed silently)
 * @param {Map<string, string>} renewalDateByAccountId the members CSV's own `Renewal Date`
 *   per account, ISO, for the update-in-place and delete guards
 * @param {NettedPair[]} [nettedMembershipPairs] every refund/positive pair
 *   {@link preprocessAccounting} netted for a `Membership` transaction, the delete's own ground
 *   truth (defaults to none, so existing single-argument-less call sites/tests keep working)
 * @returns {MembershipPlan}
 */
export function planMemberships(netMembershipRows, mwAccountIdToHouseholdId, existingMembershipsByHousehold, renewalDateByAccountId, nettedMembershipPairs = []) {
  /** @type {{ reason: string, accountId: string }[]} */
  const refusals = [];
  /** @type {{ reason: string, accountId: string, season: number, supersededBy: string }[]} */
  const collisions = [];
  /** @type {Map<string, MembershipPlanRow>} */
  const winners = new Map();
  /** @type {Map<string, number>} winner key -> its original netMembershipRows index (chronological order) */
  const winnerOrderIndex = new Map();

  netMembershipRows.forEach((row, orderIndex) => {
    const accountId = row['Account ID'];
    const context = { accountId, accountName: row.Name, email: '' };
    const householdId = mwAccountIdToHouseholdId.get(accountId);
    if (!householdId) {
      refusals.push({ reason: 'no household found for membership account', accountId });
      return;
    }

    let tierInfo;
    let paidAt;
    let season;
    let pricePaid;
    try {
      tierInfo = deriveMembershipTier(row.Items, context);
      paidAt = parseMwDateToIso(row.Date, context);
      season = deriveMembershipSeason(row, context);
      pricePaid = parseMoneyToInt(row['Membership Sub-Total'], context, 'Membership Sub-Total');
    } catch (err) {
      if (err instanceof RowRefusedError) {
        refusals.push({ reason: err.reason, accountId });
        return;
      }
      throw err;
    }

    const key = `${householdId}:${season}`;
    const candidate = {
      householdId,
      season,
      tier: tierInfo.tier,
      mwTier: tierInfo.mwTier,
      tierOverride: tierInfo.tierOverride,
      pricePaid,
      paidAt,
      stripeRef: row['Payment ID']?.trim() || null,
      accountId,
    };
    const priorWinner = winners.get(key);
    if (priorWinner) {
      collisions.push({
        reason: 'superseded by a later transaction for the same household/season',
        accountId: priorWinner.accountId,
        season,
        supersededBy: accountId,
      });
    }
    winners.set(key, candidate);
    winnerOrderIndex.set(key, orderIndex);
  });

  // Determine, per household, which winning candidate is the MOST RECENT transaction overall
  // (across every season it touches) -- the one eligible for the update-in-place path.
  /** @type {Map<string, string>} householdId -> its latest winner's key */
  const latestKeyByHousehold = new Map();
  for (const [key, candidate] of winners) {
    const currentLatestKey = latestKeyByHousehold.get(candidate.householdId);
    const currentLatestOrder = currentLatestKey !== undefined ? winnerOrderIndex.get(currentLatestKey) : undefined;
    const thisOrder = winnerOrderIndex.get(key) ?? -1;
    if (currentLatestOrder === undefined || thisOrder > currentLatestOrder) {
      latestKeyByHousehold.set(candidate.householdId, key);
    }
  }

  /** @type {Map<string, ExistingMembership>} householdId -> its one update-eligible existing row */
  const existingByHousehold = new Map();
  /** @type {Map<string, ExistingMembership>} household:season -> existing row */
  const membershipByKey = new Map();
  for (const [householdId, rows] of existingMembershipsByHousehold) {
    for (const row of rows) membershipByKey.set(`${householdId}:${row.season}`, row);
    if (rows.length > 0) existingByHousehold.set(householdId, rows[0]);
  }

  /** @type {MembershipPlanRow[]} */
  const toInsert = [];
  /** @type {(MembershipPlanRow & { membershipId: string, before: MembershipUpdateBefore })[]} */
  const toUpdate = [];

  // Pass 1: resolve each household's single latest-transaction candidate first (update, insert,
  // or refusal), BEFORE evaluating any other transaction -- so pass 2 sees `membershipByKey` as
  // it will actually look once this batch applies. The old season key is freed only when the
  // update genuinely happens (the guard passes): a guard FAILURE leaves the existing row
  // untouched at its old season, so that key must stay occupied for pass 2, never silently
  // vacated just because a different candidate was designated "latest".
  for (const [householdId, latestKey] of latestKeyByHousehold) {
    const candidate = winners.get(latestKey);
    if (!candidate) continue;
    const existingRow = existingByHousehold.get(householdId);
    if (!existingRow) {
      toInsert.push(candidate);
      continue;
    }
    const alreadyWritten =
      existingRow.season === candidate.season &&
      existingRow.tier === candidate.tier &&
      existingRow.pricePaid === candidate.pricePaid &&
      existingRow.paidAt === candidate.paidAt &&
      existingRow.stripeRef === candidate.stripeRef;
    if (alreadyWritten) continue; // this run's own prior write; idempotent no-op

    const renewalDate = renewalDateByAccountId.get(candidate.accountId);
    const guardOk = existingRow.stripeRef === null && renewalDate !== undefined && existingRow.paidAt === renewalDate;
    if (guardOk) {
      toUpdate.push({
        ...candidate,
        membershipId: existingRow.id,
        before: { season: existingRow.season, tier: existingRow.tier, pricePaid: existingRow.pricePaid, paidAt: existingRow.paidAt, stripeRef: existingRow.stripeRef },
      });
      const oldKey = `${householdId}:${existingRow.season}`;
      if (oldKey !== latestKey) membershipByKey.delete(oldKey);
    } else {
      refusals.push({
        reason: `existing membership row for household ${householdId} does not match the import-shaped guard; not overwritten`,
        accountId: candidate.accountId,
      });
    }
  }

  // Pass 2: every other transaction for a household always inserts its own history row -- never
  // an update, even when an existing row happens to sit at this exact (household, season) key.
  for (const [key, candidate] of winners) {
    if (latestKeyByHousehold.get(candidate.householdId) === key) continue; // handled in pass 1

    const existingRow = membershipByKey.get(key);
    if (!existingRow) {
      toInsert.push(candidate);
      continue;
    }
    const alreadyWritten =
      existingRow.tier === candidate.tier &&
      existingRow.pricePaid === candidate.pricePaid &&
      existingRow.paidAt === candidate.paidAt &&
      existingRow.stripeRef === candidate.stripeRef;
    if (alreadyWritten) continue; // this run's own prior insert; idempotent no-op
    refusals.push({
      reason: `existing membership row for ${key} does not match this transaction, and only a household's single most-recent transaction may update an existing row; not overwritten`,
      accountId: candidate.accountId,
    });
  }

  // Pass 3: a household with an existing row but NO winning candidate at all -- every one of its
  // Membership transactions refund-netted away -- is a delete candidate, guarded the same way an
  // update is. Only fires on POSITIVE evidence (a real netted pair); a household with no
  // Membership transaction in this run's accounting at all is left alone.
  const householdsWithWinners = new Set([...winners.values()].map((c) => c.householdId));
  /** @type {Map<string, NettedPair[]>} */
  const nettedPairsByHousehold = new Map();
  for (const pair of nettedMembershipPairs) {
    const householdId = mwAccountIdToHouseholdId.get(pair.accountId);
    if (!householdId) continue;
    const list = nettedPairsByHousehold.get(householdId) ?? [];
    list.push(pair);
    nettedPairsByHousehold.set(householdId, list);
  }

  /** @type {MembershipDeleteRow[]} */
  const toDelete = [];
  for (const [householdId, existingRow] of existingByHousehold) {
    if (householdsWithWinners.has(householdId)) continue; // has a real transaction; already handled above
    const pairs = nettedPairsByHousehold.get(householdId);
    if (!pairs || pairs.length === 0) continue; // no netted-to-zero evidence; never delete on absence alone
    const pair = pairs[0];

    const renewalDate = renewalDateByAccountId.get(pair.accountId);
    const guardOk = existingRow.stripeRef === null && renewalDate !== undefined && existingRow.paidAt === renewalDate;
    const pairDetail = `${pair.type} account=${pair.accountId} amount=${pair.amount}, purchased ${pair.positiveDate}, refunded ${pair.negativeDate}`;
    if (guardOk) {
      toDelete.push({
        membershipId: existingRow.id,
        householdId,
        accountId: pair.accountId,
        reason: `household's only net membership transaction(s) refund-netted to zero (${pairDetail})`,
      });
    } else {
      refusals.push({
        reason: `existing membership row for household ${householdId} has zero net transactions after refund-netting (${pairDetail}) but does not match the import-shaped guard; not deleted`,
        accountId: pair.accountId,
      });
    }
  }

  return { toInsert, toUpdate, toDelete, refusals, collisions };
}

// ---------------------------------------------------------------------------
// Phase 5: historical classes.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} HistoricalClassInfo
 * @property {number} season
 * @property {string} slug the real `classes.slug` column value (the site's own URL-friendly
 *   convention, e.g. `adult-intro-class-1`), NOT the filename/id-style name below
 * @property {string} idBase the attendee-filename and `classes.id` naming convention (e.g.
 *   `1st_adult_teen_intro`, unchanged since asc-ops originally minted it) -- a season-2026 row's
 *   own real `id`, and a minted historical row's `id` once suffixed with its season
 * @property {string} name
 * @property {'adult-teen' | 'youth'} track
 * @property {string} startDate ISO civil date
 */

/** The real `classes.slug` column values (site URL slugs), reused across every season this
 *  import mints under: `UNIQUE(season, slug)` permits the same slug to recur once per season, so
 *  only a minted row's `id` (the real PRIMARY KEY, season-suffixed below) needs to be unique.
 *  Asc-ops's own `id` and `slug` columns are two genuinely distinct values (`ops-classes.mjs`
 *  carries both over verbatim); attendee filenames and a class row's `id` both use the OLDER
 *  underscore-cased name (`idBase` above), never this slug. */
const ADULT_1_SLUG = 'adult-intro-class-1';
const YOUTH_1_SLUG = 'youth-intro-class-1';
const ADULT_2_SLUG = 'adult-intro-class-2';
const YOUTH_2_SLUG = 'youth-intro-class-2';
const INTERMEDIATE_SLUG = 'intermediate';

const REF_2024_1ST_ADULT = { season: 2024, slug: ADULT_1_SLUG, idBase: '1st_adult_teen_intro', name: '1st Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2024-07-11' };
const REF_2024_1ST_YOUTH = { season: 2024, slug: YOUTH_1_SLUG, idBase: '1st_youth_intro', name: '1st Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2024-07-11' };
const REF_2024_2ND_ADULT = { season: 2024, slug: ADULT_2_SLUG, idBase: '2nd_adult_teen_intro', name: '2nd Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2024-07-18' };
const REF_2024_2ND_YOUTH = { season: 2024, slug: YOUTH_2_SLUG, idBase: '2nd_youth_intro', name: '2nd Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2024-07-18' };
const REF_2024_INTERMEDIATE = { season: 2024, slug: INTERMEDIATE_SLUG, idBase: 'intermediate', name: 'Intermediate Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2024-06-28' };
const REF_2025_1ST_ADULT = { season: 2025, slug: ADULT_1_SLUG, idBase: '1st_adult_teen_intro', name: '1st Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2025-06-19' };
const REF_2025_1ST_YOUTH = { season: 2025, slug: YOUTH_1_SLUG, idBase: '1st_youth_intro', name: '1st Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2025-06-19' };
const REF_2025_2ND_ADULT = { season: 2025, slug: ADULT_2_SLUG, idBase: '2nd_adult_teen_intro', name: '2nd Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2025-06-26' };
const REF_2025_2ND_YOUTH = { season: 2025, slug: YOUTH_2_SLUG, idBase: '2nd_youth_intro', name: '2nd Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2025-06-26' };
const REF_2025_INTERMEDIATE = { season: 2025, slug: INTERMEDIATE_SLUG, idBase: 'intermediate', name: 'Intermediate Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2025-06-13' };
const REF_2026_1ST_ADULT = { season: 2026, slug: ADULT_1_SLUG, idBase: '1st_adult_teen_intro', name: '1st Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2026-06-18' };
const REF_2026_1ST_YOUTH = { season: 2026, slug: YOUTH_1_SLUG, idBase: '1st_youth_intro', name: '1st Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2026-06-18' };
const REF_2026_2ND_ADULT = { season: 2026, slug: ADULT_2_SLUG, idBase: '2nd_adult_teen_intro', name: '2nd Adult/Teen Intro to Sailing Class', track: /** @type {const} */ ('adult-teen'), startDate: '2026-07-09' };
const REF_2026_2ND_YOUTH = { season: 2026, slug: YOUTH_2_SLUG, idBase: '2nd_youth_intro', name: '2nd Youth Intro to Sailing Class', track: /** @type {const} */ ('youth'), startDate: '2026-07-09' };

/**
 * Every real `Event` `Reference` string the 2026-07-13 accounting export carries (after dropping
 * Voided rows), mapped to the class instance it identifies. The 2024 "2nd" events include the
 * export's own typo'd `2st` variant, folded into the same entry as its correctly-spelled sibling
 * (2024 2nd Youth has ONLY the typo'd reference -- no correctly-spelled row exists that year).
 * The four already-existing 2026 rows are included too, so a 2026 Event row is never refused as
 * "unmapped"; phase 5 only mints the entries missing from the database. The 2026 entries' `slug`
 * values are the REAL `classes.slug` column asc-ops seeded (verified 2026-07-14 against the live
 * `asc-club` snapshot): a stale slug here once meant a 2026 reference's `${season}:${slug}` key
 * never matched the database's own key, silently re-minting all four already-existing rows.
 * @type {Record<string, HistoricalClassInfo>}
 */
export const HISTORICAL_CLASS_MAP = {
  'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)': REF_2024_1ST_ADULT,
  'Event: 1st Youth Intro to Sailing Class (Thu Jul 11 2024, 01:00pm AKDT)': REF_2024_1ST_YOUTH,
  'Event: 2nd Adult/Teen Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)': REF_2024_2ND_ADULT,
  'Event: 2st Adult/Teen Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)': REF_2024_2ND_ADULT,
  'Event: 2st Youth Intro to Sailing Class (Thu Jul 18 2024, 01:00pm AKDT)': REF_2024_2ND_YOUTH,
  'Event: Intermediate Sailing Class (Fri Jun 28 2024, 10:00am AKDT)': REF_2024_INTERMEDIATE,
  'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)': REF_2025_1ST_ADULT,
  'Event: 1st Youth Intro to Sailing Class (Thu Jun 19 2025, 1:00pm AKDT)': REF_2025_1ST_YOUTH,
  'Event: 2nd Adult/Teen Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)': REF_2025_2ND_ADULT,
  'Event: 2nd Youth Intro to Sailing Class (Thu Jun 26 2025, 1:00pm AKDT)': REF_2025_2ND_YOUTH,
  'Event: Intermediate Sailing Class (Fri Jun 13 2025, 10:00am AKDT)': REF_2025_INTERMEDIATE,
  'Event: 1st Adult/Teen Intro to Sailing Class (Thu Jun 18 2026, 1:00pm AKDT)': REF_2026_1ST_ADULT,
  'Event: 1st Youth Intro to Sailing Class (Thu Jun 18 2026, 1:00pm AKDT)': REF_2026_1ST_YOUTH,
  'Event: 2nd Adult/Teen Intro to Sailing Class (Thu Jul 9 2026, 1:00pm AKDT)': REF_2026_2ND_ADULT,
  'Event: 2nd Youth Intro to Sailing Class (Thu Jul 9 2026, 1:00pm AKDT)': REF_2026_2ND_YOUTH,
};

/**
 * Reverse-maps an attendee filename's own `{season, idBase}` naming convention (e.g. `2024`,
 * `1st_adult_teen_intro`) to the real `classes.slug` {@link HISTORICAL_CLASS_MAP} associates with
 * that season -- built once from the map's own values, so a filename and the accounting-derived
 * `HISTORICAL_CLASS_MAP` lookups always resolve to the identical `${season}:${slug}` key space.
 * @type {Map<string, string>} keyed `${season}:${idBase}` -> real slug
 */
const REAL_SLUG_BY_SEASON_AND_ID_BASE = new Map(
  Object.values(HISTORICAL_CLASS_MAP).map((mapped) => [`${mapped.season}:${mapped.idBase}`, mapped.slug]),
);

/**
 * Translates an attendee filename's `{season, idBase}` (its own underscore-cased naming
 * convention) to the real `classes.slug` column value, or `null` when no
 * {@link HISTORICAL_CLASS_MAP} entry names that season+idBase combination.
 * @param {number} season
 * @param {string} idBase
 * @returns {string | null}
 */
export function realSlugForIdBase(season, idBase) {
  return REAL_SLUG_BY_SEASON_AND_ID_BASE.get(`${season}:${idBase}`) ?? null;
}

/** The historical convention this import mints under: today's capacity default, since the real
 *  historical capacity is unknown (README says so); the class fee every intro/intermediate class
 *  has charged across all three seasons in the accounting data. */
const HISTORICAL_CLASS_FEE = 100;
const HISTORICAL_CLASS_CAPACITY = 10;

/**
 * @typedef {object} HistoricalClassPlanRow
 * @property {string} id
 * @property {number} season
 * @property {string} slug
 * @property {string} name
 * @property {'adult-teen' | 'youth'} track
 * @property {string} startDate
 * @property {number} fee
 * @property {number} capacity
 */
/**
 * @typedef {object} HistoricalClassPlan
 * @property {HistoricalClassPlanRow[]} toInsert
 * @property {{ reason: string }[]} refusals
 */

/**
 * Mints a `classes` row for every net Event row's referenced class instance missing from the
 * database. An Event reference with no {@link HISTORICAL_CLASS_MAP} entry is refused and reported
 * (deduplicated by reference, not by row, since every purchase of the same unmapped class would
 * otherwise report the identical unmapped-reference reason many times). A minted row's id is
 * `${idBase}_${season}` (season-suffixed, since the real PRIMARY KEY must be unique across every
 * season this import ever mints, unlike `slug`, which recurs by design).
 *
 * A hard invariant guards the real database's `id TEXT PRIMARY KEY`: when this row's own
 * `${season}:${slug}` key already exists in the database snapshot, it is a normal, silent
 * no-op (the class is already correctly present, exactly the steady state every re-run reaches;
 * unchanged from before). But when the row's `id` ALONE already belongs to some OTHER existing
 * row (its `${season}:${slug}` key is free, yet its id is not) -- the exact shape of failure a
 * stale `HISTORICAL_CLASS_MAP` slug once produced, silently re-minting a duplicate class under a
 * fresh id whose (season, slug) pair happened not to collide -- this is refused and reported
 * instead of ever risking a PRIMARY KEY collision at apply.
 * @param {Record<string, string>[]} netEventRows
 * @param {Map<string, ExistingClass>} classByKey keyed `${season}:${slug}`
 * @returns {HistoricalClassPlan}
 */
export function planHistoricalClasses(netEventRows, classByKey) {
  /** @type {HistoricalClassPlanRow[]} */
  const toInsert = [];
  /** @type {{ reason: string }[]} */
  const refusals = [];
  const reportedUnmapped = new Set();
  const reportedIdCollisions = new Set();
  const seen = new Set();
  const seenIds = new Set();
  const existingIds = new Set([...classByKey.values()].map((c) => c.id));

  for (const row of netEventRows) {
    const mapped = HISTORICAL_CLASS_MAP[row.Reference];
    if (!mapped) {
      if (!reportedUnmapped.has(row.Reference)) {
        reportedUnmapped.add(row.Reference);
        refusals.push({ reason: `unmapped event reference: ${row.Reference}` });
      }
      continue;
    }
    const key = `${mapped.season}:${mapped.slug}`;
    if (classByKey.has(key) || seen.has(key)) continue;
    const id = `${mapped.idBase}_${mapped.season}`;

    if (existingIds.has(id) || seenIds.has(id)) {
      seen.add(key);
      if (!reportedIdCollisions.has(id)) {
        reportedIdCollisions.add(id);
        refusals.push({ reason: `refusing to mint id ${id} for ${key}: id already present in the database (or planned earlier this run)` });
      }
      continue;
    }

    seen.add(key);
    seenIds.add(id);
    toInsert.push({
      id,
      season: mapped.season,
      slug: mapped.slug,
      name: mapped.name,
      track: mapped.track,
      startDate: mapped.startDate,
      fee: HISTORICAL_CLASS_FEE,
      capacity: HISTORICAL_CLASS_CAPACITY,
    });
  }

  return { toInsert, refusals };
}

// ---------------------------------------------------------------------------
// Phase 6: enrollments (roster-driven and accounting-only fallback).
// ---------------------------------------------------------------------------

/**
 * @typedef {object} AttendeeGroup
 * @property {Record<string, string>} primaryRow the `Primary = Y` buyer row
 * @property {Record<string, string>[]} attendeeRows the rows following it, up to the next
 *   `Primary = Y` row (own name, answers, `Check In`)
 * @property {string} accountId the buyer's Account ID (may be empty for a test/dummy purchase)
 */

/**
 * Groups an attendee CSV's rows into purchases: each `Primary = Y` row starts a new group; every
 * row until the next `Primary = Y` row (or EOF) is that group's own attendee.
 * @param {Record<string, string>[]} records
 * @returns {AttendeeGroup[]}
 */
export function parseAttendeeGroups(records) {
  /** @type {AttendeeGroup[]} */
  const groups = [];
  /** @type {AttendeeGroup | null} */
  let current = null;
  for (const record of records) {
    if (record.Primary?.trim().toUpperCase() === 'Y') {
      current = { primaryRow: record, attendeeRows: [], accountId: record['Account ID']?.trim() ?? '' };
      groups.push(current);
    } else if (current) {
      current.attendeeRows.push(record);
    }
  }
  return groups;
}

const ATTENDEE_FILENAME_RE = /^(\d{4})-(.+)\.csv$/;

/**
 * Derives `{season, idBase}` from an attendee filename (`<season>-<idBase>.csv`), matching the
 * real files' naming convention (e.g. `2024-1st_adult_teen_intro.csv`): the filename's own
 * underscore-cased segment is the `idBase`/`classes.id` naming convention, NOT the real
 * `classes.slug` column (see {@link HISTORICAL_CLASS_MAP}'s own header) -- callers that need the
 * real slug translate through {@link realSlugForIdBase}.
 * @param {string} filename
 * @returns {{ season: number, idBase: string } | null}
 */
export function parseAttendeeFilename(filename) {
  const base = filename.split('/').pop() ?? filename;
  const m = ATTENDEE_FILENAME_RE.exec(base);
  if (!m) return null;
  return { season: Number(m[1]), idBase: m[2] };
}

/**
 * @typedef {{ valid: true, season: number, slug: string } | { valid: false, reason: string }} AttendeeFileValidation
 */

/**
 * Validates a filename-derived `{season, idBase}` against the accounting data. The idBase first
 * translates to the real `classes.slug` ({@link realSlugForIdBase}); an idBase naming no known
 * class instance for that season refuses outright, never guessed. Once translated, the file's
 * `Primary = Y` rows must overlap that class instance's net accounting rows strictly more than
 * any other class instance's, or the file is refused by name.
 *
 * The overlap metric is (buyer Account ID, net total) PAIRS, not bare account-id overlap: bare
 * accounts alone tie whenever the same buyer purchases more than one sibling class in a season
 * (a family registering for both the 1st and 2nd youth intro classes, say) -- the buyer account
 * is identical either way, but the two purchases' amounts usually differ, which pairs resolve. A
 * `Total`/`Event Sub-Total` cell that fails to parse as money is simply excluded from the pair
 * set (never crashes validation); a tie that survives even on pairs still refuses -- the
 * accounting-only fallback covers that event.
 *
 * `excludedFromComparison` (a set of `${season}:${slug}` keys) is round 2 of the batch-level
 * resolution {@link planPhase6EnrollmentsFromFiles} runs: a class already decisively claimed by
 * another attendee file in round 1 is removed from the "best other class" comparison before this
 * file's own tie is judged, since it is no longer a real competitor for THIS file's pairs (a
 * different file already carries it). Empty by default (a bare, single-round call).
 * @param {string} filename
 * @param {Record<string, string>[]} records
 * @param {Record<string, string>[]} netEventRows
 * @param {Set<string>} [excludedFromComparison]
 * @returns {AttendeeFileValidation}
 */
export function validateAttendeeFile(filename, records, netEventRows, excludedFromComparison = new Set()) {
  const parsed = parseAttendeeFilename(filename);
  if (!parsed) return { valid: false, reason: `filename does not match <season>-<idBase>.csv: ${filename}` };

  const realSlug = realSlugForIdBase(parsed.season, parsed.idBase);
  if (!realSlug) {
    return { valid: false, reason: `${filename}: no class instance known for season ${parsed.season}, id ${parsed.idBase}` };
  }

  const groups = parseAttendeeGroups(records);
  const fileBuyerAccounts = new Set(groups.map((g) => g.accountId).filter(Boolean));
  if (fileBuyerAccounts.size === 0) {
    return { valid: false, reason: `no buyer account ids found in ${filename}` };
  }

  /** @param {string} raw */
  const safeMoneyInt = (raw) => {
    try {
      return parseMoneyToInt(raw, { accountId: '', accountName: '', email: '' }, 'x');
    } catch {
      return null;
    }
  };

  /** @type {Set<string>} `${accountId}:${total}` pairs the file's own buyer groups claim */
  const filePairs = new Set();
  for (const group of groups) {
    if (!group.accountId) continue;
    const total = safeMoneyInt(group.primaryRow.Total ?? '');
    if (total === null) continue;
    filePairs.add(`${group.accountId}:${total}`);
  }

  /** @type {Map<string, Set<string>>} class key -> the (account,total) pairs it shares with the file */
  const overlaps = new Map();
  for (const row of netEventRows) {
    const mapped = HISTORICAL_CLASS_MAP[row.Reference];
    if (!mapped) continue;
    if (!fileBuyerAccounts.has(row['Account ID'])) continue;
    const amount = safeMoneyInt(row['Event Sub-Total'] ?? '');
    if (amount === null) continue;
    const pair = `${row['Account ID']}:${amount}`;
    if (!filePairs.has(pair)) continue;
    const key = `${mapped.season}:${mapped.slug}`;
    if (!overlaps.has(key)) overlaps.set(key, new Set());
    overlaps.get(key)?.add(pair);
  }

  const derivedKey = `${parsed.season}:${realSlug}`;
  const derivedOverlap = overlaps.get(derivedKey)?.size ?? 0;
  let maxOtherOverlap = 0;
  for (const [key, set] of overlaps) {
    if (key === derivedKey || excludedFromComparison.has(key)) continue;
    maxOtherOverlap = Math.max(maxOtherOverlap, set.size);
  }

  if (derivedOverlap === 0 || derivedOverlap <= maxOtherOverlap) {
    return {
      valid: false,
      reason: `overlap validation failed for ${filename}: ${derivedKey} overlaps ${derivedOverlap} (account,total) pair(s), best other class overlaps ${maxOtherOverlap}`,
    };
  }
  return { valid: true, season: parsed.season, slug: realSlug };
}

/** Every structural (non-answer) column the real attendee CSVs carry; anything else on a row is
 *  one of the event's own experience/comments questions and rides the enrollment's audit detail. */
const STRUCTURAL_ATTENDEE_COLUMNS = new Set([
  'Primary', 'Date', 'Account ID', 'Full name', 'First Name', 'Last Name',
  'Address (Full)', 'Address (Street)', 'Address (City)', 'Address (State/Province)',
  'Address (Postal Code)', 'Address (Country)', 'Phone', 'Email',
  'Total', 'Fee', 'Tax', 'Net', 'Due', 'Discount Code', 'Payment ID', 'Note', 'Check In',
]);

/**
 * @typedef {object} MemberForMatch
 * @property {string} id
 * @property {string} householdId
 * @property {string} name
 */
/**
 * @typedef {{ member: MemberForMatch, level: 'household-full-name' | 'household-first-last-initial'
 *   | 'club-wide-unique-name' | 'approximate' }} AttendeeMatch
 */

/**
 * Matches one attendee row to a member: normalized full-name equality within the buyer's
 * household, then first-name + last-initial within the household, then a club-wide unique
 * full-name match, then the household primary with `approximate` provenance -- never inventing a
 * member. Returns `null` only when even the household primary is unavailable.
 * @param {Record<string, string>} attendeeRow
 * @param {MemberForMatch[]} householdMembers
 * @param {MemberForMatch[]} allMembers
 * @param {MemberForMatch | null} householdPrimary
 * @returns {AttendeeMatch | null}
 */
export function matchAttendeeToMember(attendeeRow, householdMembers, allMembers, householdPrimary) {
  const attFirst = attendeeRow['First Name']?.trim() ?? '';
  const attLast = attendeeRow['Last Name']?.trim() ?? '';
  const attendeeKey = normalizeNameCaps(`${attFirst} ${attLast}`.trim()).toLowerCase();

  if (attendeeKey) {
    const householdFullName = householdMembers.find((m) => normalizeNameCaps(m.name).toLowerCase() === attendeeKey);
    if (householdFullName) return { member: householdFullName, level: 'household-full-name' };

    const attFirstNorm = normalizeNameCaps(attFirst).toLowerCase();
    const attLastInitial = attLast[0]?.toLowerCase();
    const householdInitial = householdMembers.find((m) => {
      const parts = m.name.trim().split(/\s+/);
      const mFirst = (parts[0] ?? '').toLowerCase();
      const mLastInitial = (parts[parts.length - 1] ?? '')[0]?.toLowerCase();
      return mFirst === attFirstNorm && Boolean(attLastInitial) && mLastInitial === attLastInitial;
    });
    if (householdInitial) return { member: householdInitial, level: 'household-first-last-initial' };

    const clubMatches = allMembers.filter((m) => normalizeNameCaps(m.name).toLowerCase() === attendeeKey);
    if (clubMatches.length === 1) return { member: clubMatches[0], level: 'club-wide-unique-name' };
  }

  if (householdPrimary) return { member: householdPrimary, level: 'approximate' };
  return null;
}

/**
 * @typedef {object} EnrollmentPlanRow
 * @property {string} classId
 * @property {string} memberId
 * @property {string} accountId the buyer's MW account id, report-only provenance (never written
 *   to `class_enrollments`, which has no such column) -- lets the dry-run/applied report name the
 *   household an `identity=approximate` row belongs to without a second household lookup
 * @property {number} feePaid
 * @property {string | null} enrolledAt
 * @property {string | null} stripeRef
 * @property {AttendeeMatch['level']} identity
 * @property {string} detail audit-row provenance: match level, comped flag, Check In, and every
 *   experience/comments answer column
 */
/**
 * @typedef {object} EnrollmentUpdateRow
 * @property {string} enrollmentId
 * @property {string} classId
 * @property {string} fromMemberId
 * @property {string} toMemberId
 * @property {string} detail
 */
/**
 * @typedef {object} EnrollmentPlan
 * @property {boolean} fileRefused
 * @property {string} [reason]
 * @property {string} filename
 * @property {number} [season] the class instance this file validated against (absent when refused)
 * @property {string} [slug] the real `classes.slug` this file validated against (absent when refused)
 * @property {EnrollmentPlanRow[]} toInsert
 * @property {EnrollmentUpdateRow[]} toUpdate
 * @property {{ reason: string, classId?: string, memberId?: string }[]} skipped
 * @property {{ reason: string, filename?: string, accountId?: string }[]} refusals
 * @property {{ reason: string, filename?: string, accountId?: string }[]} notes
 */

/**
 * Plans every enrollment a roster-driven attendee file implies. Validates the file first
 * ({@link validateAttendeeFile}); a failed validation refuses the whole file (no enrollments
 * planned from it) rather than guessing. Money for a purchase group comes from its matched net
 * Event accounting row(s), divided over its attendee-row count ("seats"); a roster group with no
 * matching accounting row (a comped/manual add -- rosters are supersets of accounting) uses the
 * file's own `Total` instead, noted. A previously `approximate` enrollment (the household primary
 * standing in) is upgraded in place when this run resolves the true attendee.
 * @param {{ filename: string, records: Record<string, string>[] }} file
 * @param {Map<string, { id: string, fee: number }>} classIndex keyed `${season}:${slug}`
 * @param {Record<string, string>[]} netEventRows
 * @param {Map<string, string>} mwAccountIdToHouseholdId
 * @param {Map<string, ExistingHousehold>} householdsById
 * @param {Map<string, MemberForMatch>} allMembersById
 * @param {Map<string, ExistingEnrollment>} enrollmentByPair keyed `${classId}:${memberId}`
 * @param {ExistingEnrollment[]} approxEnrollments
 * @param {Set<string>} [excludedFromComparison] forwarded to {@link validateAttendeeFile}'s round-2 exclusion set
 * @returns {EnrollmentPlan}
 */
export function planEnrollmentsFromFile(
  file,
  classIndex,
  netEventRows,
  mwAccountIdToHouseholdId,
  householdsById,
  allMembersById,
  enrollmentByPair,
  approxEnrollments,
  excludedFromComparison = new Set(),
) {
  const validation = validateAttendeeFile(file.filename, file.records, netEventRows, excludedFromComparison);
  if (!validation.valid) {
    return { fileRefused: true, reason: validation.reason, filename: file.filename, toInsert: [], toUpdate: [], skipped: [], refusals: [], notes: [] };
  }

  const classKey = `${validation.season}:${validation.slug}`;
  const cls = classIndex.get(classKey);
  if (!cls) {
    return {
      fileRefused: true,
      reason: `no class resolved for ${classKey} (unmapped or refused at phase 5)`,
      filename: file.filename,
      toInsert: [],
      toUpdate: [],
      skipped: [],
      refusals: [],
      notes: [],
    };
  }

  const classEventRows = netEventRows.filter((r) => {
    const mapped = HISTORICAL_CLASS_MAP[r.Reference];
    return mapped && `${mapped.season}:${mapped.slug}` === classKey;
  });

  const allMembers = [...allMembersById.values()];
  const groups = parseAttendeeGroups(file.records);
  /** @type {EnrollmentPlan} */
  const result = { fileRefused: false, filename: file.filename, season: validation.season, slug: validation.slug, toInsert: [], toUpdate: [], skipped: [], refusals: [], notes: [] };
  const claimedPairs = new Set();
  // An approxEnrollments entry may match more than one real attendee this file names (both share
  // the household primary as the placeholder); it is CONSUMED by the first attendee that matches
  // it, so a second real attendee never fans an UPDATE onto the same enrollment id (the last
  // UPDATE would otherwise win, silently dropping a real attendee's seat).
  const consumedApproxIds = new Set();

  for (const group of groups) {
    if (!group.accountId) {
      result.refusals.push({ reason: 'buyer row missing Account ID', filename: file.filename });
      continue;
    }
    const householdId = mwAccountIdToHouseholdId.get(group.accountId);
    if (!householdId) {
      result.refusals.push({ reason: `buyer account not found in any household`, filename: file.filename, accountId: group.accountId });
      continue;
    }
    const householdMembers = allMembers.filter((m) => m.householdId === householdId);
    const household = householdsById.get(householdId);
    const householdPrimary = householdMembers.find((m) => m.id === household?.primaryMemberId) ?? householdMembers[0] ?? null;

    const attendees = group.attendeeRows.length > 0 ? group.attendeeRows : [group.primaryRow];
    const matchingAccountingRows = classEventRows.filter((r) => r['Account ID'] === group.accountId);
    const seats = attendees.length;
    const moneyContext = { accountId: group.accountId, accountName: '', email: '' };

    let feePerSeat;
    let stripeRef;
    let comped = false;
    try {
      if (matchingAccountingRows.length > 0) {
        const subtotal = matchingAccountingRows.reduce(
          (sum, r) => sum + parseMoneyToInt(r['Event Sub-Total'], moneyContext, 'Event Sub-Total'),
          0,
        );
        feePerSeat = Math.round(subtotal / seats);
        stripeRef = matchingAccountingRows.map((r) => r['Payment ID']?.trim()).find(Boolean) ?? null;
      } else {
        const rosterTotal = parseMoneyToInt(group.primaryRow.Total || '0', moneyContext, 'Total');
        feePerSeat = Math.round(rosterTotal / seats);
        stripeRef = group.primaryRow['Payment ID']?.trim() || null;
        comped = true;
        result.notes.push({
          reason: "roster group has no matching accounting row (comped/manual add); used the file's own Total",
          filename: file.filename,
          accountId: group.accountId,
        });
      }
    } catch (err) {
      if (err instanceof RowRefusedError) {
        result.refusals.push({ reason: err.reason, filename: file.filename, accountId: group.accountId });
        continue;
      }
      throw err;
    }

    for (const attendeeRow of attendees) {
      const match = matchAttendeeToMember(attendeeRow, householdMembers, allMembers, householdPrimary);
      if (!match) {
        result.refusals.push({ reason: 'no member could be matched (household has no primary either)', filename: file.filename, accountId: group.accountId });
        continue;
      }
      const pairKey = `${cls.id}:${match.member.id}`;
      if (claimedPairs.has(pairKey)) {
        result.skipped.push({ reason: 'duplicate (class, member) pair within this run', classId: cls.id, memberId: match.member.id });
        continue;
      }
      claimedPairs.add(pairKey);

      const dateSource = attendeeRow.Date?.trim() || group.primaryRow.Date?.trim() || matchingAccountingRows[0]?.Date;
      const enrolledAt = dateSource ? parseMwDateToIso(dateSource, { accountId: group.accountId, accountName: '', email: '' }) : null;

      const ticketColumn = Object.keys(attendeeRow).find((k) => k.startsWith('Ticket:'));
      const detailParts = [`match=${match.level}`];
      if (comped) detailParts.push('comped=true');
      if (attendeeRow['Check In']?.trim()) detailParts.push(`check_in=${attendeeRow['Check In'].trim()}`);
      for (const col of Object.keys(attendeeRow)) {
        if (STRUCTURAL_ATTENDEE_COLUMNS.has(col) || col === ticketColumn) continue;
        const value = attendeeRow[col]?.trim();
        if (value) detailParts.push(`${col}=${value}`);
      }
      const detail = detailParts.join('; ');

      if (enrollmentByPair.has(pairKey)) continue; // already imported exactly, idempotent no-op

      const approxMatch =
        match.level !== 'approximate' && householdPrimary
          ? approxEnrollments.find((e) => e.classId === cls.id && e.memberId === householdPrimary?.id && !consumedApproxIds.has(e.id))
          : undefined;
      if (approxMatch) {
        consumedApproxIds.add(approxMatch.id);
        result.toUpdate.push({ enrollmentId: approxMatch.id, classId: cls.id, fromMemberId: approxMatch.memberId, toMemberId: match.member.id, detail });
      } else {
        result.toInsert.push({ classId: cls.id, memberId: match.member.id, accountId: group.accountId, feePaid: feePerSeat, enrolledAt, stripeRef, identity: match.level, detail });
      }
    }
  }

  return result;
}

/**
 * Plans phase 6's roster-driven enrollments across EVERY attendee file at once, resolving overlap
 * ties a single file's own validation cannot see. Two rounds:
 *
 *   1. Every file validates independently, under the strict rule (no exclusions) -- exactly
 *      {@link planEnrollmentsFromFile}'s own single-file behavior.
 *   2. Every file round 1 refused is RE-validated with every class a round-1-validated file
 *      already claimed EXCLUDED from its "best other class" comparison: that class is no longer
 *      a real competitor for this file's own tie (a different file already carries it). A file
 *      whose only competing tie was a now-excluded class can validate decisively in round 2; a
 *      tie that survives even with exclusions still refuses.
 *
 * Finally, a class can only ever be claimed by ONE file: if two files (from either round) end up
 * validated against the identical `(season, slug)`, that is a hard refusal for BOTH -- a real
 * naming collision this run refuses to guess through, never silently keeping the first.
 * @param {{ filename: string, records: Record<string, string>[] }[]} files
 * @param {Map<string, { id: string, fee: number }>} classIndex
 * @param {Record<string, string>[]} netEventRows
 * @param {Map<string, string>} mwAccountIdToHouseholdId
 * @param {Map<string, ExistingHousehold>} householdsById
 * @param {Map<string, MemberForMatch>} allMembersById
 * @param {Map<string, ExistingEnrollment>} enrollmentByPair
 * @param {ExistingEnrollment[]} approxEnrollments
 * @returns {EnrollmentPlan[]} one result per input file, in the same order
 */
export function planPhase6EnrollmentsFromFiles(
  files,
  classIndex,
  netEventRows,
  mwAccountIdToHouseholdId,
  householdsById,
  allMembersById,
  enrollmentByPair,
  approxEnrollments,
) {
  const planOne = (/** @type {{ filename: string, records: Record<string, string>[] }} */ file, /** @type {Set<string>} */ excluded) =>
    planEnrollmentsFromFile(file, classIndex, netEventRows, mwAccountIdToHouseholdId, householdsById, allMembersById, enrollmentByPair, approxEnrollments, excluded);

  // Round 1: every file, no exclusions.
  const round1 = files.map((file) => planOne(file, new Set()));
  const round1ClaimedKeys = new Set(round1.filter((r) => !r.fileRefused).map((r) => `${r.season}:${r.slug}`));

  // Round 2: only the round-1-refused files, with round-1 claims excluded from their comparison.
  const results = round1.map((r, i) => (r.fileRefused ? planOne(files[i], round1ClaimedKeys) : r));

  // Hard refusal: a class claimed by more than one file (from either round).
  /** @type {Map<string, string[]>} */
  const claimedBy = new Map();
  for (const r of results) {
    if (r.fileRefused) continue;
    const key = `${r.season}:${r.slug}`;
    const list = claimedBy.get(key) ?? [];
    list.push(r.filename);
    claimedBy.set(key, list);
  }
  const duplicateKeys = new Set([...claimedBy.entries()].filter(([, filenames]) => filenames.length > 1).map(([key]) => key));
  if (duplicateKeys.size === 0) return results;

  return results.map((r) => {
    if (r.fileRefused || !duplicateKeys.has(`${r.season}:${r.slug}`)) return r;
    const key = `${r.season}:${r.slug}`;
    return {
      fileRefused: true,
      reason: `class ${key} claimed by more than one attendee file (${claimedBy.get(key)?.join(', ')})`,
      filename: r.filename,
      toInsert: [],
      toUpdate: [],
      skipped: [],
      refusals: [],
      notes: [],
    };
  });
}

/**
 * @typedef {object} FallbackEnrollmentPlan
 * @property {EnrollmentPlanRow[]} toInsert
 * @property {{ reason: string, classId: string, memberId: string }[]} skipped
 * @property {{ reason: string }[]} refusals
 * @property {{ reason: string, accountId: string, classId: string }[]} notes
 */

/**
 * The accounting-only enrollment path for a class with no attendee file (the 2024 Intermediate
 * class, today): one enrollment row per net Event purchase, the household primary standing in
 * for the whole purchase (identity `approximate` for a youth-track class or a multi-seat
 * purchase, since which specific person(s) attended is then unknowable from accounting alone).
 * @param {string} classKey `${season}:${slug}`
 * @param {{ id: string, fee: number, track: 'adult-teen' | 'youth' }} cls
 * @param {Record<string, string>[]} netEventRows
 * @param {Map<string, string>} mwAccountIdToHouseholdId
 * @param {Map<string, ExistingHousehold>} householdsById
 * @param {Map<string, ExistingEnrollment>} enrollmentByPair
 * @returns {FallbackEnrollmentPlan}
 */
export function planEnrollmentsFromAccountingOnly(classKey, cls, netEventRows, mwAccountIdToHouseholdId, householdsById, enrollmentByPair) {
  const rows = netEventRows.filter((r) => {
    const mapped = HISTORICAL_CLASS_MAP[r.Reference];
    return mapped && `${mapped.season}:${mapped.slug}` === classKey;
  });

  /** @type {EnrollmentPlanRow[]} */
  const toInsert = [];
  /** @type {{ reason: string, classId: string, memberId: string }[]} */
  const skipped = [];
  /** @type {{ reason: string }[]} */
  const refusals = [];
  /** @type {{ reason: string, accountId: string, classId: string }[]} */
  const notes = [];
  const claimedPairs = new Set();

  for (const row of rows) {
    const accountId = row['Account ID'];
    const householdId = mwAccountIdToHouseholdId.get(accountId);
    if (!householdId) {
      refusals.push({ reason: `buyer account ${accountId} not found in any household` });
      continue;
    }
    const household = householdsById.get(householdId);
    const primaryId = household?.primaryMemberId;
    if (!primaryId) {
      refusals.push({ reason: `household ${householdId} has no primary member` });
      continue;
    }
    const pairKey = `${cls.id}:${primaryId}`;
    if (enrollmentByPair.has(pairKey)) continue; // idempotent no-op
    if (claimedPairs.has(pairKey)) {
      skipped.push({ reason: 'duplicate (class, member) pair within this run', classId: cls.id, memberId: primaryId });
      continue;
    }
    claimedPairs.add(pairKey);

    const moneyContext = { accountId, accountName: '', email: '' };
    let subtotal;
    try {
      subtotal = parseMoneyToInt(row['Event Sub-Total'], moneyContext, 'Event Sub-Total');
    } catch (err) {
      if (err instanceof RowRefusedError) {
        refusals.push({ reason: err.reason });
        continue;
      }
      throw err;
    }
    const seats = subtotal > 0 ? Math.max(1, Math.round(subtotal / cls.fee)) : 1;
    const approximate = cls.track === 'youth' || seats > 1;
    if (approximate) {
      notes.push({
        reason: `enrolled the household primary as an approximation (${cls.track === 'youth' ? 'youth-track class' : 'multi-seat purchase'})`,
        accountId,
        classId: cls.id,
      });
    }
    toInsert.push({
      classId: cls.id,
      memberId: primaryId,
      accountId,
      feePaid: subtotal,
      enrolledAt: parseMwDateToIso(row.Date, { accountId, accountName: '', email: '' }),
      stripeRef: row['Payment ID']?.trim() || null,
      identity: approximate ? 'approximate' : 'household-full-name',
      detail: `accounting-only fallback (no attendee file); seats=${seats}`,
    });
  }

  return { toInsert, skipped, refusals, notes };
}

// ---------------------------------------------------------------------------
// The top-level plan: wires phases 1-6 together over one run's inputs and one snapshot of the
// database's existing state.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MwImportInput
 * @property {Record<string, string>[]} memberRecords
 * @property {Record<string, string>[]} accountingRecords
 * @property {{ filename: string, records: Record<string, string>[] }[]} attendeeFiles
 */

/**
 * Plans the entire six-phase run against one snapshot of `asc-club`'s existing state. Touches no
 * database; every id this run would create is minted here (household/member ids via
 * `randomUUID`, membership ids via `randomUUID`, class ids as `<idBase>_<season>`) so the
 * caller's SQL-generation step is a pure translation of this plan.
 * @param {MwImportInput} input
 * @param {ExistingState} existing
 */
export function planMwImport(input, existing) {
  const memberByMwAccountId = new Map(existing.members.filter((m) => m.mwAccountId).map((m) => [/** @type {string} */ (m.mwAccountId), m]));
  const memberByEmail = new Map(existing.members.filter((m) => m.email).map((m) => [/** @type {string} */ (m.email).toLowerCase(), m]));
  const householdsById = new Map(existing.households.map((h) => [h.id, { ...h }]));
  /** @type {Map<string, ExistingMembership[]>} householdId -> all of its existing rows */
  const membershipsByHousehold = new Map();
  for (const m of existing.memberships) {
    const list = membershipsByHousehold.get(m.householdId) ?? [];
    list.push(m);
    membershipsByHousehold.set(m.householdId, list);
  }
  const classByKey = new Map(existing.classes.map((c) => [`${c.season}:${c.slug}`, c]));
  const enrollmentByPair = new Map(existing.enrollments.map((e) => [`${e.classId}:${e.memberId}`, e]));
  const approxEnrollments = existing.enrollments.filter((e) => e.approximate);

  /** @type {Map<string, string>} mwAccountId -> householdId, grown as phases 1-3 create rows */
  const mwAccountIdToHouseholdId = new Map(existing.members.filter((m) => m.mwAccountId).map((m) => [/** @type {string} */ (m.mwAccountId), m.householdId]));
  /** @type {Map<string, MemberForMatch>} */
  const allMembersById = new Map(existing.members.map((m) => [m.id, { id: m.id, householdId: m.householdId, name: m.name }]));
  const claimedEmails = new Set(existing.members.filter((m) => m.email).map((m) => /** @type {string} */ (m.email).toLowerCase()));

  const primaries = input.memberRecords.filter((r) => !r['Parent Account ID']?.trim());
  const subMembers = input.memberRecords.filter((r) => r['Parent Account ID']?.trim());

  /** @type {Map<string, string>} account id -> ISO renewal date, for the phase-4 update guard */
  const renewalDateByAccountId = new Map();
  for (const record of input.memberRecords) {
    const accountId = record['Account ID']?.trim();
    const raw = record['Renewal Date']?.trim();
    if (!accountId || !raw) continue;
    try {
      renewalDateByAccountId.set(accountId, parseMwDateToIso(raw, { accountId, accountName: '', email: '' }));
    } catch {
      // an unparseable renewal date just means the phase-4 guard can never match for this
      // account (fails closed to "refuse the overwrite", never a crash).
    }
  }

  // ---- Phases 1-2: update pass + new primaries ----
  /** @type {{ entity: 'member' | 'household', id: string, accountId: string, changes: Record<string, PrimaryFieldChange> }[]} */
  const phase1Updates = [];
  /** @type {{ accountId: string, householdId: string, memberId: string, row: NewPrimaryRow }[]} */
  const phase2Creates = [];
  /** @type {{ accountId: string, reason: string }[]} */
  const phase2Refusals = [];

  for (const record of primaries) {
    const accountId = record['Account ID']?.trim() ?? '';
    const existingMatch = memberByMwAccountId.get(accountId) ?? memberByEmail.get(normalizeEmail(record.Email ?? ''));
    const existingHousehold = existingMatch ? householdsById.get(existingMatch.householdId) ?? null : null;
    const rawEmail = record.Email?.trim();
    const emailAlreadyClaimed = Boolean(rawEmail) && claimedEmails.has(normalizeEmail(rawEmail));
    const planned = planPrimaryRow(record, existingMatch ?? null, existingHousehold, emailAlreadyClaimed);

    if (planned.kind === 'refuse') {
      phase2Refusals.push({ accountId: planned.accountId, reason: planned.reason });
      continue;
    }

    if (planned.kind === 'create') {
      const householdId = randomUUID();
      const memberId = randomUUID();
      householdsById.set(householdId, { id: householdId, name: planned.row.householdName, city: planned.row.city, primaryMemberId: memberId });
      allMembersById.set(memberId, { id: memberId, householdId, name: planned.row.memberName });
      if (planned.row.email) claimedEmails.add(planned.row.email.toLowerCase());
      mwAccountIdToHouseholdId.set(accountId, householdId);
      memberByMwAccountId.set(accountId, { id: memberId, householdId, name: planned.row.memberName, email: planned.row.email, mwAccountId: accountId });
      phase2Creates.push({ accountId, householdId, memberId, row: planned.row });
      continue;
    }

    // planned.kind === 'existing'
    mwAccountIdToHouseholdId.set(accountId, planned.householdId);
    if (Object.keys(planned.memberChanges).length) {
      phase1Updates.push({ entity: 'member', id: planned.memberId, accountId, changes: planned.memberChanges });
      const member = allMembersById.get(planned.memberId);
      if (member && planned.memberChanges.name) member.name = planned.memberChanges.name.to;
    }
    if (Object.keys(planned.householdChanges).length) {
      phase1Updates.push({ entity: 'household', id: planned.householdId, accountId, changes: planned.householdChanges });
      const household = householdsById.get(planned.householdId);
      if (household && planned.householdChanges.name) household.name = planned.householdChanges.name.to;
    }
  }

  // ---- Phase 3: household sub-members ----
  /** @type {{ accountId: string, memberId: string, row: NewSubMemberRow }[]} */
  const phase3Creates = [];
  /** @type {{ accountId: string, reason: string }[]} */
  const phase3Refusals = [];

  for (const record of subMembers) {
    const accountId = record['Account ID']?.trim() ?? '';
    if (memberByMwAccountId.has(accountId)) continue; // idempotent no-op on a re-run

    const parentAccountId = record['Parent Account ID']?.trim();
    const parentHouseholdId = parentAccountId ? mwAccountIdToHouseholdId.get(parentAccountId) : undefined;
    const rawEmail = record.Email?.trim();
    const emailClaimed = Boolean(rawEmail) && claimedEmails.has(normalizeEmail(rawEmail ?? ''));
    const planned = planSubMemberRow(record, parentHouseholdId, emailClaimed);

    if (planned.kind === 'refuse') {
      phase3Refusals.push({ accountId: planned.accountId, reason: planned.reason });
      continue;
    }

    const memberId = randomUUID();
    allMembersById.set(memberId, { id: memberId, householdId: planned.row.householdId, name: planned.row.name });
    if (planned.row.email) claimedEmails.add(planned.row.email.toLowerCase());
    mwAccountIdToHouseholdId.set(accountId, planned.row.householdId);
    memberByMwAccountId.set(accountId, { id: memberId, householdId: planned.row.householdId, name: planned.row.name, email: planned.row.email, mwAccountId: accountId });
    phase3Creates.push({ accountId, memberId, row: planned.row });
  }

  // ---- Accounting pre-processing ----
  const pre = preprocessAccounting(input.accountingRecords);
  const netMembershipRows = pre.netRows.filter((r) => r['Transaction Type'] === 'Membership');
  const netEventRows = pre.netRows.filter((r) => r['Transaction Type'] === 'Event');
  const nettedMembershipPairs = pre.nettedPairs.filter((p) => p.type === 'Membership');

  // ---- Phase 4: membership history ----
  const phase4 = planMemberships(netMembershipRows, mwAccountIdToHouseholdId, membershipsByHousehold, renewalDateByAccountId, nettedMembershipPairs);

  // ---- Phase 5: historical classes ----
  const phase5 = planHistoricalClasses(netEventRows, classByKey);
  /** @type {Map<string, { id: string, fee: number, track: 'adult-teen' | 'youth' }>} */
  const classIndex = new Map();
  for (const [key, c] of classByKey) classIndex.set(key, { id: c.id, fee: c.fee, track: c.track });
  for (const c of phase5.toInsert) classIndex.set(`${c.season}:${c.slug}`, { id: c.id, fee: c.fee, track: c.track });

  // ---- Phase 6: enrollments ----
  const phase6FileResults = planPhase6EnrollmentsFromFiles(
    input.attendeeFiles,
    classIndex,
    netEventRows,
    mwAccountIdToHouseholdId,
    householdsById,
    allMembersById,
    enrollmentByPair,
    approxEnrollments,
  );
  // attemptedKeys must live in the same `${season}:${realSlug}` key space `referencedKeys` below
  // uses, AND must only cover a class a file actually VALIDATED against -- a refused file's class
  // is not "attempted" for suppression purposes, so it still falls through to the
  // accounting-only fallback below (an event without a usable roster still gets enrollments).
  const attemptedKeys = new Set(phase6FileResults.filter((r) => !r.fileRefused).map((r) => `${r.season}:${r.slug}`));

  const referencedKeys = new Set(
    netEventRows.map((r) => {
      const mapped = HISTORICAL_CLASS_MAP[r.Reference];
      return mapped ? `${mapped.season}:${mapped.slug}` : null;
    }).filter((k) => k !== null),
  );

  const phase6FallbackResults = [];
  for (const key of referencedKeys) {
    if (attemptedKeys.has(key)) continue;
    const cls = classIndex.get(/** @type {string} */ (key));
    if (!cls) continue;
    phase6FallbackResults.push({
      classKey: key,
      ...planEnrollmentsFromAccountingOnly(/** @type {string} */ (key), cls, netEventRows, mwAccountIdToHouseholdId, householdsById, enrollmentByPair),
    });
  }

  return {
    accounting: { voidedCount: pre.voidedCount, nettedCount: pre.nettedCount, nettedPairs: pre.nettedPairs, donationReports: pre.donationReports, refusals: pre.refusals },
    phase1Updates,
    phase2Creates,
    phase2Refusals,
    phase3Creates,
    phase3Refusals,
    phase4,
    phase5,
    phase6FileResults,
    phase6FallbackResults,
  };
}

// ---------------------------------------------------------------------------
// SQL generation + the wrangler-shelling CLI (guarded so importing this module for tests never
// runs it, the same dual-mode idiom `scripts/verify/real-d1-write-path.mjs` documents). The
// wrangler-shelling parts (`wrangler`, `query`, `main`) stay untested per this pass's own scope
// (network, no network-in-CI); the pure statement builders below (`buildPhase2CreateStatements`,
// `buildEnrollmentInsertStatement`) are exported and unit-tested at the planning layer.
// ---------------------------------------------------------------------------

/** @param {unknown} value */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Builds the household+member INSERT pair (plus the household's `primary_member_id` backfill) for
 * one phase-2 new-primary create. `mw_account_id` is set INLINE on the `members` INSERT, not a
 * trailing `UPDATE` (phase 3's sub-member create has always done this): a trailing `UPDATE` leaves
 * a window, mid-batch, where a member row exists with no `mw_account_id` -- its own stable import
 * key -- which this brings phase 2 in line with phase 3 to close.
 * @param {{ accountId: string, householdId: string, memberId: string, row: NewPrimaryRow }} c
 * @returns {string[]} exactly 3 statements: household insert, member insert, primary-member backfill
 */
export function buildPhase2CreateStatements(c) {
  return [
    `INSERT INTO households (id, name, city) VALUES (${sqlLiteral(c.householdId)}, ${sqlLiteral(c.row.householdName)}, ${sqlLiteral(c.row.city)})`,
    `INSERT INTO members (id, household_id, name, email, phone, directory_visibility, mw_account_id) VALUES (${sqlLiteral(c.memberId)}, ${sqlLiteral(c.householdId)}, ${sqlLiteral(c.row.memberName)}, ${sqlLiteral(c.row.email)}, ${sqlLiteral(c.row.phone)}, ${sqlLiteral(c.row.directoryVisibility)}, ${sqlLiteral(c.accountId)})`,
    `UPDATE households SET primary_member_id = ${sqlLiteral(c.memberId)} WHERE id = ${sqlLiteral(c.householdId)}`,
  ];
}

/**
 * Builds the `class_enrollments` INSERT statement for one planned enrollment row. When
 * `enrolledAt` is `null` (no attendee row, buyer row, or accounting row carried a usable date),
 * the `enrolled_at` column is OMITTED from the column list entirely, letting the schema's own
 * `DEFAULT (datetime('now'))` apply -- the column is `TEXT NOT NULL DEFAULT (...)`, and an
 * explicit `NULL` literal bypasses that default, which real D1 rejects mid-batch.
 * @param {string} id
 * @param {{ classId: string, memberId: string, feePaid: number, enrolledAt: string | null, stripeRef: string | null }} row
 * @returns {string}
 */
export function buildEnrollmentInsertStatement(id, row) {
  const feePaid = sqlInt(row.feePaid);
  const columns = ['id', 'class_id', 'member_id'];
  const values = [sqlLiteral(id), sqlLiteral(row.classId), sqlLiteral(row.memberId)];
  if (row.enrolledAt !== null) {
    columns.push('enrolled_at');
    values.push(sqlLiteral(row.enrolledAt));
  }
  columns.push('fee_paid', 'stripe_ref');
  values.push(feePaid, sqlLiteral(row.stripeRef));
  return `INSERT INTO class_enrollments (${columns.join(', ')}) VALUES (${values.join(', ')})`;
}

/** @param {string[]} args */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** @param {string} sql @returns {Record<string, unknown>[]} */
function query(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--command', sql, '--json']);
  return JSON.parse(out)[0].results;
}

/**
 * Reads the whole current shape of `asc-club`'s member/household/membership/class/enrollment
 * tables into the {@link ExistingState} shape `planMwImport` needs, plus every enrollment this
 * import has ever flagged `identity=approximate` in its own audit trail (the upgrade-in-place
 * detection phase 6 needs).
 * @returns {ExistingState}
 */
function readExistingState() {
  const members = query(`SELECT id, household_id, name, email, mw_account_id FROM members`).map((r) => ({
    id: String(r.id),
    householdId: String(r.household_id),
    name: String(r.name),
    email: r.email === null ? null : String(r.email),
    mwAccountId: r.mw_account_id === null ? null : String(r.mw_account_id),
  }));
  const households = query(`SELECT id, name, city, primary_member_id FROM households`).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    city: r.city === null ? null : String(r.city),
    primaryMemberId: r.primary_member_id === null ? null : String(r.primary_member_id),
  }));
  const memberships = query(`SELECT id, household_id, season, tier, price_paid, paid_at, stripe_ref FROM memberships`).map((r) => ({
    id: String(r.id),
    householdId: String(r.household_id),
    season: Number(r.season),
    tier: String(r.tier),
    pricePaid: Number(r.price_paid),
    paidAt: r.paid_at === null ? null : String(r.paid_at),
    stripeRef: r.stripe_ref === null ? null : String(r.stripe_ref),
  }));
  const classes = query(`SELECT id, season, slug, fee, track FROM classes`).map((r) => ({
    id: String(r.id),
    season: Number(r.season),
    slug: String(r.slug),
    fee: Number(r.fee),
    track: /** @type {'adult-teen' | 'youth'} */ (String(r.track)),
  }));
  const approxRows = query(
    `SELECT ce.id, ce.class_id, ce.member_id FROM class_enrollments ce ` +
      `JOIN audit_log a ON a.entity_id = ce.id ` +
      `WHERE a.actor = 'import:mw' AND a.entity = 'enrollment' AND a.detail LIKE '%identity=approximate%'`,
  );
  const approxIds = new Set(approxRows.map((r) => String(r.id)));
  const enrollments = query(`SELECT id, class_id, member_id FROM class_enrollments`).map((r) => ({
    id: String(r.id),
    classId: String(r.class_id),
    memberId: String(r.member_id),
    approximate: approxIds.has(String(r.id)),
  }));

  return { members, households, memberships, classes, enrollments };
}

/**
 * Reads every `<season>-<slug>.csv` file directly inside `dir` (no recursion; the real
 * `mw-attendees/` directory is flat).
 * @param {string} dir
 * @returns {{ filename: string, records: Record<string, string>[] }[]}
 */
function readAttendeeFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.csv'));
  } catch {
    return [];
  }
  return entries.map((filename) => ({
    filename,
    records: parseMwCsv(readFileSync(path.join(dir, filename), 'utf8')),
  }));
}

/** The four match levels {@link matchAttendeeToMember} can resolve an attendee to, in the order
 *  the report breaks a file's per-fallback-level counts down. */
const MATCH_LEVELS = /** @type {const} */ (['household-full-name', 'household-first-last-initial', 'club-wide-unique-name', 'approximate']);

/**
 * Formats the full before -> after detail the README promises, for both `--dry-run` and the
 * applied-run output: every phase-1 field change, phase 4's refusals/collisions and each update's
 * season/tier/price_paid/paid_at/stripe_ref before -> after, every phase-5 minted class, phase-6
 * per-file stats (matched-by-name counts at each fallback level, comped-group count) plus every
 * `identity=approximate` enrollment, and the accounting pre-processing's netted pairs, donation
 * rows, and refusal. Names may print here (a conductor reads this report locally); every refusal
 * reason that could otherwise carry a raw email is redacted at its own source
 * ({@link planPrimaryRow}'s email-collision message), so this formatter never needs to redact
 * anything itself.
 * @param {ReturnType<typeof planMwImport>} plan
 * @param {string} batchId
 * @returns {string}
 */
export function formatReport(plan, batchId) {
  /** @type {string[]} */
  const lines = [];
  const push = (/** @type {string} */ s) => lines.push(s);

  push(`mw-members: plan for batch ${batchId}`);

  push('');
  push(`accounting: voided=${plan.accounting.voidedCount} netted_pairs=${plan.accounting.nettedCount} donations=${plan.accounting.donationReports.length} refusals=${plan.accounting.refusals.length}`);
  for (const p of plan.accounting.nettedPairs) {
    push(`  netted: ${p.type} account=${p.accountId} amount=${p.amount} (purchased ${p.positiveDate}, refunded ${p.negativeDate})`);
  }
  for (const d of plan.accounting.donationReports) {
    push(`  donation (not imported): account=${d.accountId} date=${d.date} amount=${d.amount}`);
  }
  for (const r of plan.accounting.refusals) {
    const parts = [r.accountId && `account=${r.accountId}`, r.date && `date=${r.date}`, r.reference && `reference=${r.reference}`, r.amount && `amount=${r.amount}`].filter(Boolean);
    push(`  refused: ${r.reason}${parts.length ? ` (${parts.join(', ')})` : ''}`);
  }

  push('');
  push(`phase 1 (update pass): ${plan.phase1Updates.length} field change(s)`);
  for (const u of plan.phase1Updates) {
    for (const [field, change] of Object.entries(u.changes)) {
      push(`  [${u.entity}] ${u.id} (account ${u.accountId}): ${field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
    }
  }

  push('');
  push(`phase 2 (new primaries): ${plan.phase2Creates.length} create(s), ${plan.phase2Refusals.length} refusal(s)`);
  for (const r of plan.phase2Refusals) push(`  refused account=${r.accountId}: ${r.reason}`);

  push('');
  push(`phase 3 (sub-members): ${plan.phase3Creates.length} create(s), ${plan.phase3Refusals.length} refusal(s)`);
  for (const r of plan.phase3Refusals) push(`  refused account=${r.accountId}: ${r.reason}`);

  push('');
  push(
    `phase 4 (memberships): ${plan.phase4.toInsert.length} insert(s), ${plan.phase4.toUpdate.length} update(s), ` +
      `${plan.phase4.toDelete.length} delete(s), ${plan.phase4.refusals.length} refusal(s), ${plan.phase4.collisions.length} collision(s)`,
  );
  for (const u of plan.phase4.toUpdate) {
    push(
      `  update household=${u.householdId} account=${u.accountId}: season ${u.before.season} -> ${u.season}, ` +
        `tier ${u.before.tier} -> ${u.tier}, price_paid ${u.before.pricePaid} -> ${u.pricePaid}, ` +
        `paid_at ${u.before.paidAt} -> ${u.paidAt}, stripe_ref ${u.before.stripeRef} -> ${u.stripeRef}` +
        (u.tierOverride ? ` [mw_tier_ruling=${u.tierOverride.tier}; items=${u.tierOverride.items}]` : ''),
    );
  }
  for (const d of plan.phase4.toDelete) push(`  delete household=${d.householdId} account=${d.accountId}: ${d.reason}`);
  for (const r of plan.phase4.refusals) push(`  refused account=${r.accountId}: ${r.reason}`);
  for (const c of plan.phase4.collisions) push(`  collision season=${c.season} account=${c.accountId} superseded_by=${c.supersededBy}: ${c.reason}`);

  push('');
  push(`phase 5 (historical classes): ${plan.phase5.toInsert.length} insert(s), ${plan.phase5.refusals.length} refusal(s)`);
  for (const c of plan.phase5.toInsert) push(`  mint id=${c.id} season=${c.season} slug=${c.slug} name="${c.name}" start_date=${c.startDate}`);
  for (const r of plan.phase5.refusals) push(`  refused: ${r.reason}`);

  push('');
  const phase6Inserts = plan.phase6FileResults.reduce((s, r) => s + r.toInsert.length, 0) + plan.phase6FallbackResults.reduce((s, r) => s + r.toInsert.length, 0);
  const phase6Updates = plan.phase6FileResults.reduce((s, r) => s + r.toUpdate.length, 0);
  const fileRefusals = plan.phase6FileResults.filter((r) => r.fileRefused);
  push(`phase 6 (enrollments): ${phase6Inserts} insert(s), ${phase6Updates} update(s), ${fileRefusals.length} file refusal(s)`);
  for (const r of fileRefusals) push(`  refused file ${r.filename}: ${r.reason}`);
  for (const r of plan.phase6FileResults) {
    if (r.fileRefused) continue;
    const counts = MATCH_LEVELS.map((level) => `${level}=${r.toInsert.filter((row) => row.identity === level).length}`).join(', ');
    push(`  file ${r.filename}: ${r.toInsert.length} insert(s) [${counts}], ${r.toUpdate.length} update(s), ${r.notes.length} comped group(s), ${r.refusals.length} refusal(s)`);
    for (const refusal of r.refusals) push(`    refused: ${refusal.reason}${refusal.accountId ? ` account=${refusal.accountId}` : ''}`);
  }
  for (const r of plan.phase6FallbackResults) {
    push(`  fallback ${r.classKey}: ${r.toInsert.length} insert(s), ${r.notes.length} note(s), ${r.refusals.length} refusal(s)`);
    for (const refusal of r.refusals) push(`    refused: ${refusal.reason}`);
  }
  const approxRows = [...plan.phase6FileResults.flatMap((r) => r.toInsert), ...plan.phase6FallbackResults.flatMap((r) => r.toInsert)].filter(
    (row) => row.identity === 'approximate',
  );
  if (approxRows.length) {
    push(`  identity=approximate enrollment(s) (${approxRows.length}):`);
    for (const row of approxRows) push(`    class=${row.classId} account=${row.accountId}`);
  }

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  /** @param {string} flag @param {string} fallback */
  const argValue = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : fallback;
  };
  const sourcePath = argValue('--source', path.join(os.homedir(), '.local', 'asc-data', 'mw-export-2026-07-13.csv'));
  const accountingPath = argValue('--accounting', path.join(os.homedir(), '.local', 'asc-data', 'mw-accounting-2026-07-13.csv'));
  const attendeesDir = argValue('--attendees', path.join(os.homedir(), '.local', 'asc-data', 'mw-attendees'));

  const existing = readExistingState();
  console.log(`mw-members: ${existing.members.length} member(s), ${existing.households.length} household(s), ${existing.memberships.length} membership(s), ${existing.classes.length} class(es) already in ${DB_NAME}`);

  const memberRecords = parseMwCsv(readFileSync(sourcePath, 'utf8'));
  const accountingRecords = parseMwCsv(readFileSync(accountingPath, 'utf8'));
  const attendeeFiles = readAttendeeFiles(attendeesDir);
  console.log(`mw-members: ${memberRecords.length} member row(s), ${accountingRecords.length} accounting row(s), ${attendeeFiles.length} attendee file(s)`);

  const plan = planMwImport({ memberRecords, accountingRecords, attendeeFiles }, existing);
  const batchId = `mw-members-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const phase6Inserts = plan.phase6FileResults.reduce((s, r) => s + r.toInsert.length, 0) + plan.phase6FallbackResults.reduce((s, r) => s + r.toInsert.length, 0);
  const phase6Updates = plan.phase6FileResults.reduce((s, r) => s + r.toUpdate.length, 0);

  console.log(`\n${formatReport(plan, batchId)}`);

  if (dryRun) {
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  // No cross-statement transaction wraps this batch (D1 rejects an explicit BEGIN/COMMIT in a
  // `--file`); the recovery model for a mid-run failure is a plain re-run (see the README's own
  // "Partial-failure recovery" section). That model depends on every entity's own statements
  // being CONTIGUOUS (an insert immediately followed by its own audit row, never interleaved with
  // another entity's) and each phase's statements completing before the next phase's begin,
  // exactly the loop order below -- phase 1, then 2, then 3, ... 6, then the one closing
  // `import.batch` row.
  /** @type {string[]} */
  const statements = [];

  for (const u of plan.phase1Updates) {
    const table = u.entity === 'member' ? 'members' : 'households';
    const setClauses = Object.entries(u.changes)
      .map(([field, change]) => `${field} = ${sqlLiteral(change.to)}`)
      .join(', ');
    const detail = Object.entries(u.changes).map(([field, change]) => `${field}: ${sqlLiteral(change.from)} -> ${sqlLiteral(change.to)}`).join('; ');
    statements.push(`UPDATE ${table} SET ${setClauses} WHERE id = ${sqlLiteral(u.id)}`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.update', ${sqlLiteral(u.entity)}, ${sqlLiteral(u.id)}, ${sqlLiteral(`import_batch=${batchId}; account=${u.accountId}; ${detail}`)})`);
  }

  for (const c of plan.phase2Creates) {
    const detail = `import_batch=${batchId}; source_account=${c.accountId}`;
    statements.push(...buildPhase2CreateStatements(c));
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'household', ${sqlLiteral(c.householdId)}, ${sqlLiteral(detail)})`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'member', ${sqlLiteral(c.memberId)}, ${sqlLiteral(detail)})`);
  }

  for (const c of plan.phase3Creates) {
    const detail = `import_batch=${batchId}; source_account=${c.accountId}; relation=${c.row.relation ?? 'none'}${c.row.emailNote ? `; ${c.row.emailNote}` : ''}`;
    statements.push(`INSERT INTO members (id, household_id, name, email, phone, directory_visibility, mw_account_id) VALUES (${sqlLiteral(c.memberId)}, ${sqlLiteral(c.row.householdId)}, ${sqlLiteral(c.row.name)}, ${sqlLiteral(c.row.email)}, ${sqlLiteral(c.row.phone)}, ${sqlLiteral(c.row.directoryVisibility)}, ${sqlLiteral(c.accountId)})`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'member', ${sqlLiteral(c.memberId)}, ${sqlLiteral(detail)})`);
  }

  /** @param {MembershipPlanRow} m */
  const tierOverrideDetail = (m) => (m.tierOverride ? `; mw_tier_ruling=${m.tierOverride.tier}; items=${m.tierOverride.items}` : '');

  for (const m of plan.phase4.toInsert) {
    const membershipId = randomUUID();
    const detail = `import_batch=${batchId}; source_account=${m.accountId}${m.mwTier ? `; mw_tier=${m.mwTier}` : ''}${tierOverrideDetail(m)}`;
    statements.push(`INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, stripe_ref) VALUES (${sqlLiteral(membershipId)}, ${sqlLiteral(m.householdId)}, ${sqlInt(m.season)}, ${sqlLiteral(m.tier)}, ${sqlInt(m.pricePaid)}, ${sqlLiteral(m.paidAt)}, ${sqlLiteral(m.stripeRef)})`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'membership', ${sqlLiteral(membershipId)}, ${sqlLiteral(detail)})`);
  }
  for (const m of plan.phase4.toUpdate) {
    const detail = `import_batch=${batchId}; source_account=${m.accountId}${m.mwTier ? `; mw_tier=${m.mwTier}` : ''}${tierOverrideDetail(m)}; season ${m.before.season} -> ${m.season}`;
    statements.push(`UPDATE memberships SET season = ${sqlInt(m.season)}, tier = ${sqlLiteral(m.tier)}, price_paid = ${sqlInt(m.pricePaid)}, paid_at = ${sqlLiteral(m.paidAt)}, stripe_ref = ${sqlLiteral(m.stripeRef)} WHERE id = ${sqlLiteral(m.membershipId)}`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.update', 'membership', ${sqlLiteral(m.membershipId)}, ${sqlLiteral(detail)})`);
  }
  for (const m of plan.phase4.toDelete) {
    const detail = `import_batch=${batchId}; source_account=${m.accountId}; ${m.reason}`;
    statements.push(`DELETE FROM memberships WHERE id = ${sqlLiteral(m.membershipId)}`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.delete', 'membership', ${sqlLiteral(m.membershipId)}, ${sqlLiteral(detail)})`);
  }

  for (const c of plan.phase5.toInsert) {
    const detail = `import_batch=${batchId}; minted from accounting history; capacity/fee are today's convention, not a historical fact`;
    statements.push(`INSERT INTO classes (id, season, name, slug, track, capacity, fee, start_date, visible, drop_in) VALUES (${sqlLiteral(c.id)}, ${sqlInt(c.season)}, ${sqlLiteral(c.name)}, ${sqlLiteral(c.slug)}, ${sqlLiteral(c.track)}, ${sqlInt(c.capacity)}, ${sqlInt(c.fee)}, ${sqlLiteral(c.startDate)}, 1, 0)`);
    statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'class', ${sqlLiteral(c.id)}, ${sqlLiteral(detail)})`);
  }

  for (const fileResult of plan.phase6FileResults) {
    for (const row of fileResult.toInsert) {
      const enrollmentId = randomUUID();
      statements.push(buildEnrollmentInsertStatement(enrollmentId, row));
      statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'enrollment', ${sqlLiteral(enrollmentId)}, ${sqlLiteral(`import_batch=${batchId}; identity=${row.identity}; ${row.detail}`)})`);
    }
    for (const u of fileResult.toUpdate) {
      statements.push(`UPDATE class_enrollments SET member_id = ${sqlLiteral(u.toMemberId)} WHERE id = ${sqlLiteral(u.enrollmentId)}`);
      statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.update', 'enrollment', ${sqlLiteral(u.enrollmentId)}, ${sqlLiteral(`import_batch=${batchId}; identity upgraded from approximate; ${u.fromMemberId} -> ${u.toMemberId}; ${u.detail}`)})`);
    }
  }
  for (const fallbackResult of plan.phase6FallbackResults) {
    for (const row of fallbackResult.toInsert) {
      const enrollmentId = randomUUID();
      statements.push(buildEnrollmentInsertStatement(enrollmentId, row));
      statements.push(`INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.insert', 'enrollment', ${sqlLiteral(enrollmentId)}, ${sqlLiteral(`import_batch=${batchId}; identity=${row.identity}; ${row.detail}`)})`);
    }
  }

  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:mw', 'import.batch', 'member', NULL, ${sqlLiteral(
      `import_batch=${batchId}; phase1_updates=${plan.phase1Updates.length}; phase2_creates=${plan.phase2Creates.length}; ` +
        `phase3_creates=${plan.phase3Creates.length}; phase4_inserts=${plan.phase4.toInsert.length}; phase4_updates=${plan.phase4.toUpdate.length}; ` +
        `phase4_deletes=${plan.phase4.toDelete.length}; phase5_inserts=${plan.phase5.toInsert.length}; phase6_inserts=${phase6Inserts}; phase6_updates=${phase6Updates}`,
    )})`,
  );

  if (statements.length === 1) {
    console.log('\nmw-members: nothing to write (idempotent no-op run).');
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mw-members-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join(';\n'));
  try {
    wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`\nmw-members: applied ${statements.length} statement(s) to ${DB_NAME}`);
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
