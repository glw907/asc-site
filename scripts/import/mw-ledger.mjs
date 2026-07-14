#!/usr/bin/env node
/**
 * Import script: the 401-row MembershipWorks (MW) canon accounting export -> asc-club's money
 * ledger (`transactions` / `transaction_lines`, migration `0021_money_ledger`,
 * `docs/2026-07-13-money-ledger-design.md`). Every accounting row becomes exactly one
 * `transactions` row (a `charge`, `refund`, or `void`), broken into `transaction_lines` from the
 * export's own sub-total columns (`Membership Sub-Total` -> `dues`, `Event Sub-Total` ->
 * `class-fee`, `Donation Sub-Total` -> `donation`, `Cart Sub-Total` -> `asset-fee`, `Other
 * Sub-Total` plus `Handling`/`Total Tax` -> `other`) -- the export's own header-plus-lines shape,
 * not a guess.
 *
 * Categorization is structural, read straight off the row, never inferred:
 *   - `Items = 'Voided'`                     -> kind = 'void'
 *   - a negative `Transaction Total`          -> kind = 'refund'
 *   - everything else                        -> kind = 'charge'
 * A comped seat (`Discount Code` set, `Transaction Total = 0`) carries no real sub-total to build
 * a line from -- {@link buildListPriceIndex} derives a "list price" per tier (Membership rows) or
 * per `Reference` (Event rows) from the SAME export's own highest non-comped charge for that key,
 * and the comp gets a positive item line at that price plus a matching negative `discount` line,
 * netting to the row's real zero total. A comped EVENT row whose key has no such paid-row price
 * (every seat for that event happened to be comped) falls back to the class it resolves to via
 * `mw-members.mjs`'s `HISTORICAL_CLASS_MAP` and that class's own `fee`, and, failing that too,
 * plans the item line at 0 cents with no discount line and a memo noting the price is unknown --
 * never refused. A comped MEMBERSHIP row with no list price still refuses; there is no analogous
 * class to fall back to.
 *
 * Domain linking is best-effort, never a hard requirement of writing the row: a `dues` line links
 * to the already-imported `memberships` row matching the transaction's household, date, and price
 * (the same three columns `mw-members.mjs` wrote them from); a `class-fee` line links to the
 * `class_enrollments` row sharing the transaction's `Payment ID` as `stripe_ref`, when exactly one
 * such row exists for the household (a multi-seat group purchase is left unlinked, never guessed
 * at). A transaction whose `Account ID` is NON-BLANK but resolves to NO household is refused
 * loudly (Membership/Event rows only -- `mw-members.mjs` resolved every real account, so a miss
 * here is a defect to surface). A BLANK `Account ID` never refuses, for any Transaction Type: it
 * plans with `household_id` null, `payer_name`/`payer_email` snapshotted from the row's own
 * `Name`/`Email`, and a memo noting the blank account (the row's `Discount Code`, when set, rides
 * along in that memo). A refund is linked to its original charge by matching, within the same
 * account/type(/`Reference`-for-Event) key, the most recent prior unconsumed charge of the
 * IDENTICAL absolute amount first, or -- for a PARTIAL refund -- the most recent prior unconsumed
 * charge whose `Items` text matches (normalized), occurred on or before the refund, and whose
 * amount is at least the refund's ({@link linkRefunds}). Unlinkable under either preference (no
 * such charge exists in the database OR this run's own inserts) leaves the link null and reports
 * a loud warning. A charge already imported in a prior run carries its REAL database id here, so a
 * refund arriving for the first time in a LATER run still links correctly.
 *
 * Every amount this script writes is CENTS end to end ({@link parseMoneyToCents}): the real
 * export carries genuine fractional-dollar fees a whole-dollars-only parser would refuse outright.
 *
 * Idempotency key: `mw_ref`, a stable hash of each row's own identifying columns (the export
 * carries no transaction-id column of its own) -- see {@link deriveMwRef}. A re-run against
 * unchanged input plans zero changes: every row's `mw_ref` is checked against the database before
 * planning a write. A partial prior apply -- a header row committed with no lines, this single-
 * `--file`-batch import's own known risk -- self-heals: {@link planRepairs} finds any such header
 * and plans its lines as a line-only repair, reported separately from an ordinary insert.
 *
 * Usage:
 *   node scripts/import/mw-ledger.mjs                    # dry run (default), prints the plan
 *   node scripts/import/mw-ledger.mjs --apply             # applies it to the real asc-club
 *   node scripts/import/mw-ledger.mjs --accounting /path --db asc-club
 *
 * Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and
 * network access to the real `asc-club` database; always `--remote`, there is no local-D1 mode.
 *
 * SAFETY -- take a backup before `--apply`: this import applies as ONE `wrangler d1 execute
 * --remote --file` call with no cross-statement transaction. See `mw-ledger.README.md`.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEmail, normalizeNameCaps } from '../../src/admin-club/lib/member-normalize.js';
import { HISTORICAL_CLASS_MAP, RowRefusedError, deriveMembershipTier, parseMwCsv, parseMwDateToIso, sqlInt } from './mw-members.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// SQL literal helper (mw-members.mjs's own `sqlLiteral` is a module-private four-liner; kept
// duplicated here rather than exported across scripts for one function, the same call
// `redactEmail` makes there).
// ---------------------------------------------------------------------------

/** @param {unknown} value @returns {string} */
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** @param {Record<string, string>} row @returns {{ accountId: string, accountName: string, email: string }} */
function rowContext(row) {
  return { accountId: row['Account ID']?.trim() ?? '', accountName: row.Name?.trim() ?? '', email: row.Email?.trim() ?? '' };
}

/** Normalizes a row's `Items` text for the {@link linkRefunds} same-description match: trimmed
 *  and lowercased, so a refund and its originating charge compare equal despite incidental case
 *  drift the export itself never guarantees stays consistent.
 * @param {string | undefined} raw
 * @returns {string}
 */
function normalizeItemsText(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Money parsing -- cents, not dollars, throughout this script.
// ---------------------------------------------------------------------------

/**
 * Parses a money-shaped CSV cell (`'$1,200.50'`, `'250'`, `'3.20'`, `''`) to integer cents,
 * stripping a leading `$` and thousands commas first. A local cents-native replacement for
 * `mw-members.mjs`'s own `parseMoneyToInt` (that function's integer-DOLLARS contract fits its own
 * caller, `memberships.price_paid`, but every amount this script ever touches is a
 * `transaction_lines.amount_cents`/`transactions.amount_total_cents` cents column, and the real
 * accounting export carries genuine fractional-dollar fees the dollars-only parser refused
 * outright). Digit parts are combined without floating-point multiplication (`Number(whole) *
 * 100 + Number(fraction)`, fraction padded to two digits) so no cell can round to the wrong cent.
 * Throws {@link RowRefusedError} when the cleaned value is not numeric or carries more than two
 * decimal places -- refusing the source row rather than letting a malformed or over-precise token
 * survive into a plan object and, eventually, a generated SQL statement.
 * @param {string} raw
 * @param {{ accountId: string, accountName: string, email: string }} context
 * @param {string} fieldLabel
 * @returns {number} integer cents
 */
export function parseMoneyToCents(raw, context, fieldLabel) {
  const cleaned = String(raw ?? '').trim().replace(/^\$/, '').replace(/,/g, '');
  if (cleaned === '') return 0;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    throw new RowRefusedError(`non-numeric ${fieldLabel}: ${raw}`, context);
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

// ---------------------------------------------------------------------------
// Idempotency key.
// ---------------------------------------------------------------------------

/** The columns that identify a row: everything else (address, contact info) is either
 *  reconstructible from these or irrelevant to what transaction the row describes. */
const MW_REF_COLUMNS = ['Date', 'Account ID', 'Transaction Type', 'Reference', 'Items', 'Transaction Total', 'Payment ID', 'Discount Code', 'Note'];

/**
 * Derives a stable `mw_ref` from a row's own identifying columns: the export carries no explicit
 * transaction-id column, so the row's own content stands in for one. Two rows with identical
 * values in every {@link MW_REF_COLUMNS} column collide (a real possibility -- two same-day,
 * same-amount comped seats for one account, say); {@link planMwLedgerImport} disambiguates a
 * collision within one run by appending a `#n` suffix, deterministic as long as the export's row
 * order stays stable across runs.
 * @param {Record<string, string>} row
 * @returns {string}
 */
export function deriveMwRef(row) {
  const canonical = MW_REF_COLUMNS.map((c) => `${c}=${(row[c] ?? '').trim()}`).join('|');
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
  return `mw-ledger:${hash}`;
}

/**
 * The row's `kind`, read straight off its own columns: `Items = 'Voided'` always wins (a voided
 * row's `Transaction Total` can still be negative or positive), then a negative total is a
 * refund, and everything else is a charge.
 * @param {Record<string, string>} row
 * @param {{ accountId: string, accountName: string, email: string }} ctx
 * @returns {'charge' | 'refund' | 'void'}
 */
export function classifyKind(row, ctx) {
  if (row.Items?.trim() === 'Voided') return 'void';
  const totalCents = parseMoneyToCents(row['Transaction Total'], ctx, 'Transaction Total');
  return totalCents < 0 ? 'refund' : 'charge';
}

// ---------------------------------------------------------------------------
// Line-item breakdown from the export's own sub-total columns.
// ---------------------------------------------------------------------------

const SUBTOTAL_COLUMNS = /** @type {const} */ ([
  { column: 'Membership Sub-Total', item: 'dues', description: 'Membership dues' },
  { column: 'Event Sub-Total', item: 'class-fee', description: 'Class fee' },
  { column: 'Donation Sub-Total', item: 'donation', description: 'Donation' },
  { column: 'Cart Sub-Total', item: 'asset-fee', description: 'Asset add-on' },
  { column: 'Other Sub-Total', item: 'other', description: 'Other charge' },
]);

/**
 * Builds one line per non-zero export sub-total column, in `SUBTOTAL_COLUMNS` order, plus one
 * combined `other` line for `Handling` + `Total Tax` when their sum is non-zero. Every amount is
 * taken as its absolute value in cents: the sign of the transaction (charge/refund/void) lives on
 * the header's `kind`, never on an individual line (the spec's "everything else positive" rule).
 * @param {Record<string, string>} row
 * @param {{ accountId: string, accountName: string, email: string }} ctx
 * @returns {{ item: string, description: string, amountCents: number }[]}
 */
export function buildSubtotalLines(row, ctx) {
  const lines = [];
  for (const { column, item, description } of SUBTOTAL_COLUMNS) {
    const cents = parseMoneyToCents(row[column] ?? '', ctx, column);
    if (cents !== 0) lines.push({ item, description, amountCents: Math.abs(cents) });
  }
  const handlingCents = parseMoneyToCents(row.Handling ?? '', ctx, 'Handling');
  const taxCents = parseMoneyToCents(row['Total Tax'] ?? '', ctx, 'Total Tax');
  const extraCents = handlingCents + taxCents;
  if (extraCents !== 0) lines.push({ item: 'other', description: 'Handling & tax', amountCents: Math.abs(extraCents) });
  return lines;
}

/**
 * @typedef {object} ListPriceIndex
 * @property {Map<string, number>} membershipCentsByTier the highest non-comped `Membership
 *   Sub-Total` seen for a tier, in cents
 * @property {Map<string, number>} eventCentsByReference the highest non-comped `Event Sub-Total`
 *   seen for an event `Reference`, in cents
 */

/**
 * Derives the "list price" a comped Membership or Event row's own sub-total (always zero) cannot
 * carry: the highest real, non-zero sub-total this SAME export shows for that tier (Membership)
 * or `Reference` (Event) -- the file's own going rate, not an external assumption. A tier this
 * export never charges anyone a real price for (every row for it happens to be comped) has no
 * entry; {@link planMwLedgerImport} refuses that comp rather than guessing.
 * @param {Record<string, string>[]} rows every accounting row (voided rows excluded up front --
 *   they never establish a real price)
 * @returns {ListPriceIndex}
 */
export function buildListPriceIndex(rows) {
  /** @type {Map<string, number>} */
  const membershipCentsByTier = new Map();
  /** @type {Map<string, number>} */
  const eventCentsByReference = new Map();

  for (const row of rows) {
    if (row.Items?.trim() === 'Voided') continue;
    const ctx = rowContext(row);
    const type = row['Transaction Type'];
    if (type === 'Membership') {
      let tier;
      try {
        tier = deriveMembershipTier(row.Items, ctx).tier;
      } catch {
        continue; // unrecognized tier text; not a usable price source
      }
      const cents = parseMoneyToCents(row['Membership Sub-Total'] ?? '', ctx, 'Membership Sub-Total');
      if (cents > 0) {
        if ((membershipCentsByTier.get(tier) ?? 0) < cents) membershipCentsByTier.set(tier, cents);
      }
    } else if (type === 'Event') {
      const reference = row.Reference?.trim();
      const cents = parseMoneyToCents(row['Event Sub-Total'] ?? '', ctx, 'Event Sub-Total');
      if (reference && cents > 0) {
        if ((eventCentsByReference.get(reference) ?? 0) < cents) eventCentsByReference.set(reference, cents);
      }
    }
  }
  return { membershipCentsByTier, eventCentsByReference };
}

// ---------------------------------------------------------------------------
// Per-row planning.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ExistingHouseholdMembership
 * @property {string} id
 * @property {string} householdId
 * @property {string | null} paidAt
 * @property {number} pricePaid dollars, `memberships.price_paid`'s own unit
 */
/**
 * @typedef {object} ExistingEnrollment
 * @property {string} id
 * @property {string} householdId
 * @property {string | null} stripeRef
 */
/**
 * @typedef {object} ExistingHeaderMissingLines a prior run's partial apply: a `transactions`
 *   header row that committed with zero `transaction_lines` rows (the single-`--file` batch's own
 *   no-cross-statement-transaction risk, `mw-ledger.README.md`'s "Partial-failure recovery")
 * @property {string} id the header's own real database id
 * @property {string} mwRef
 */
/**
 * @typedef {object} ExistingLedgerState
 * @property {Map<string, string>} householdIdByMwAccountId
 * @property {ExistingHouseholdMembership[]} memberships
 * @property {ExistingEnrollment[]} enrollments
 * @property {Set<string>} existingMwRefs every `transactions.mw_ref` already in the database
 * @property {Map<string, string>} existingIdByMwRef every already-imported row's REAL database
 *   `id`, keyed by its `mw_ref` -- {@link planMwLedgerImport}'s id-assignment step reuses this id
 *   for a row it re-plans (rather than minting a fresh one) so a same-run refund linking against
 *   that row (see {@link linkRefunds}) points at the id the row actually has in the database, not
 *   a throwaway one this run happens to generate
 * @property {ExistingHeaderMissingLines[]} headersMissingLines
 * @property {Map<string, number>} classFeeCentsBySeasonSlug every `classes.fee` (dollars in the
 *   database, converted here to cents), keyed `${season}:${slug}` -- the comped-Event list-price
 *   fallback's second preference (see {@link planTransactionRow})
 */

/**
 * @typedef {object} PlannedLine
 * @property {string} item
 * @property {string} description
 * @property {number} amountCents
 * @property {string | null} membershipId
 * @property {string | null} enrollmentId
 * @property {string | null} assignmentId
 */
/**
 * @typedef {object} PlannedTransaction
 * @property {string} mwRef
 * @property {'charge' | 'refund' | 'void'} kind
 * @property {'stripe' | 'comp' | 'other'} source
 * @property {string} occurredAt
 * @property {number} amountTotalCents
 * @property {number | null} feeCents
 * @property {string | null} processorRef
 * @property {string | null} householdId
 * @property {string | null} payerName
 * @property {string | null} payerEmail
 * @property {string | null} memo free-text import note (a blank-Account-ID row, a comped row
 *   whose list price could not be derived) -- null when this row carries none
 * @property {PlannedLine[]} lines
 * @property {string | null} refundLinkKey netting key for refund->charge linking, null for
 *   non-refund/non-charge rows that never participate
 * @property {string} itemsText this row's own `Items` text, normalized ({@link
 *   normalizeItemsText}) -- {@link linkRefunds}'s second-preference match compares this between a
 *   refund and a candidate charge
 * @property {string} transactionType the row's own `Transaction Type` column (`Membership`,
 *   `Event`, `Donation`) -- {@link linkRefunds}'s second-preference match groups by this and
 *   `accountId` alone, WITHOUT `Reference`: the real export's own `2st`/`2nd` typo'd-vs-correct
 *   Event Reference variants for the identical class instance means a charge and its own refund
 *   can carry two different Reference strings, which {@link refundLinkKey} (Reference-scoped for
 *   an Event) would never bridge
 * @property {string | null} accountId `Account ID`, kept for the report
 */

/**
 * Plans one accounting row into a {@link PlannedTransaction}, or throws {@link RowRefusedError}
 * for a row this import declines to write (no household resolves for a Membership/Event
 * transaction's account; a comp row with no list-price source; the lines-sum-to-total invariant
 * fails). Does NOT resolve domain FKs (`membership_id`/`enrollment_id`) or
 * `refunds_transaction_id` -- {@link linkDomainRows} and {@link linkRefunds} do that in a second
 * pass, once every row in the file has been planned.
 * @param {Record<string, string>} row
 * @param {ExistingLedgerState} existing
 * @param {ListPriceIndex} listPrices
 * @returns {PlannedTransaction}
 */
export function planTransactionRow(row, existing, listPrices) {
  const ctx = rowContext(row);
  const type = row['Transaction Type'];
  const kind = classifyKind(row, ctx);
  const totalCents = parseMoneyToCents(row['Transaction Total'], ctx, 'Transaction Total');
  const amountTotalCents = Math.abs(totalCents);
  const occurredAt = parseMwDateToIso(row.Date, ctx);
  const processorRef = row['Payment ID']?.trim() || null;
  const feeCentsRaw = parseMoneyToCents(row['Transaction Fee'] ?? '', ctx, 'Transaction Fee');
  const feeCents = feeCentsRaw !== 0 ? Math.abs(feeCentsRaw) : null;
  const discountCode = row['Discount Code']?.trim();
  const isComp = kind === 'charge' && amountTotalCents === 0 && Boolean(discountCode);
  const source = isComp ? 'comp' : processorRef ? 'stripe' : 'other';

  const accountId = ctx.accountId || null;
  const householdId = accountId ? (existing.householdIdByMwAccountId.get(accountId) ?? null) : null;
  // A BLANK Account ID never refuses, for any Transaction Type: it plans with household_id null
  // and a payer snapshot below, same shape a Donation row already gets. A NON-blank account that
  // fails to resolve a household is a real defect (`mw-members.mjs` resolved every real account)
  // and still refuses, Donation rows exempted as before.
  if (accountId && type !== 'Donation' && !householdId) {
    throw new RowRefusedError(`no household resolves for account ${accountId}`, ctx);
  }

  const payerName = !householdId && row.Name?.trim() ? normalizeNameCaps(row.Name.trim()) : null;
  const payerEmail = !householdId && row.Email?.trim() ? normalizeEmail(row.Email.trim()) : null;

  /** @type {string[]} */
  const memoNotes = [];
  if (!accountId) {
    memoNotes.push(discountCode ? `blank Account ID (discount code: ${discountCode})` : 'blank Account ID');
  }

  /** @type {PlannedLine[]} */
  let lines;
  if (isComp) {
    const compItem = type === 'Membership' ? 'dues' : type === 'Event' ? 'class-fee' : null;
    if (!compItem) throw new RowRefusedError(`comp row of unsupported transaction type: ${type}`, ctx);
    const key = type === 'Membership' ? deriveMembershipTier(row.Items, ctx).tier : row.Reference?.trim();
    let listPriceCents = type === 'Membership' ? listPrices.membershipCentsByTier.get(key) : listPrices.eventCentsByReference.get(key);

    // The comped-Event fallback chain: no paid row for this event key established a list price
    // (every seat for it happened to be comped), so fall back to the class this Event Reference
    // resolves to (the same {@link HISTORICAL_CLASS_MAP} `mw-members.mjs` mints historical
    // classes from) and its own `classes.fee`. A Membership comp with no list price still
    // refuses outright below -- there is no analogous "class" to fall back to.
    if (!listPriceCents && type === 'Event') {
      const mapped = HISTORICAL_CLASS_MAP[row.Reference];
      const classKey = mapped ? `${mapped.season}:${mapped.slug}` : null;
      listPriceCents = classKey ? existing.classFeeCentsBySeasonSlug.get(classKey) : undefined;
    }

    if (listPriceCents) {
      lines = [
        { item: compItem, description: compItem === 'dues' ? 'Membership dues (comp)' : 'Class fee (comp)', amountCents: listPriceCents, membershipId: null, enrollmentId: null, assignmentId: null },
        { item: 'discount', description: 'Comp discount', amountCents: -listPriceCents, membershipId: null, enrollmentId: null, assignmentId: null },
      ];
    } else if (type === 'Event') {
      // Second fallback: no class fee either. Plan the item line at 0 cents with no discount
      // line (the invariant below still holds: 0 sums to the row's own 0 total) and note why.
      lines = [{ item: compItem, description: 'Class fee (comp)', amountCents: 0, membershipId: null, enrollmentId: null, assignmentId: null }];
      memoNotes.push('list price unknown; comped');
    } else {
      throw new RowRefusedError(`no list price found for comped ${type.toLowerCase()} (key: ${key})`, ctx);
    }
  } else {
    lines = buildSubtotalLines(row, ctx).map((l) => ({ ...l, membershipId: null, enrollmentId: null, assignmentId: null }));
  }

  const lineSum = lines.reduce((s, l) => s + l.amountCents, 0);
  if (lineSum !== amountTotalCents) {
    throw new RowRefusedError(`lines sum to ${lineSum} cents but Transaction Total is ${amountTotalCents} cents`, ctx);
  }

  const refundLinkKey = accountId ? `${type}:${accountId}:${type === 'Event' ? (row.Reference?.trim() ?? '') : ''}` : null;

  return {
    mwRef: deriveMwRef(row),
    kind,
    source,
    occurredAt,
    amountTotalCents,
    feeCents,
    processorRef,
    householdId,
    payerName,
    payerEmail,
    memo: memoNotes.length > 0 ? memoNotes.join('; ') : null,
    lines,
    refundLinkKey,
    itemsText: normalizeItemsText(row.Items),
    transactionType: type,
    accountId,
  };
}

// ---------------------------------------------------------------------------
// Second pass: refund linking and domain-row linking.
// ---------------------------------------------------------------------------

/**
 * Links every `refund`-kind planned transaction to its originating `charge`, in place. Two
 * preferences, in order, sharing one CONSUMED flag per charge (a match under either preference
 * takes the charge out of consideration for every other refund):
 *   1. EXACT match: within the refund's own `refundLinkKey` (account + type, plus `Reference` for
 *      an Event -- the same netting key `mw-members.mjs`'s `preprocessAccounting` uses), the most
 *      recent prior UNCONSUMED charge of the IDENTICAL absolute amount (a full refund).
 *   2. PARTIAL match: failing that, within the WIDER `accountId` + `transactionType` group ONLY
 *      (no `Reference` restriction -- the real export carries a `2st`/`2nd` typo'd-vs-correct
 *      Event Reference pair for the identical class instance, so a charge and its own partial
 *      refund can legitimately disagree on `Reference` alone), the most recent prior UNCONSUMED
 *      charge whose own `Items` text matches (normalized), occurred on or before the refund's own
 *      date, and whose amount is at least the refund's (the refund can never exceed what it
 *      refunds).
 * Unlike `mw-members.mjs`'s own (destructive) netting, both rows stay in the ledger here -- this
 * only records the link, never drops either row. A charge already imported in a prior run carries
 * its REAL database id here (`planMwLedgerImport`'s id-assignment step), so a refund arriving for
 * the first time in a LATER run still links to the id the charge actually has in the database,
 * not a throwaway id this run would otherwise mint for a row it never re-inserts.
 *
 * A refund with no matching charge under either preference -- in the database or in this run's
 * own inserts (its charge predates this export, say) -- is left with `refundsTransactionId: null`,
 * never refused (the spec marks the FK "when identifiable", not mandatory), but is reported back
 * as a loud warning: a dangling refund is worth a human's look even though it never blocks the
 * write.
 * @param {(PlannedTransaction & { id: string, refundsTransactionId: string | null })[]} planned
 *   every planned row, IN ORIGINAL FILE ORDER, already assigned an `id` (a real database id when
 *   the row is already imported, a fresh one otherwise)
 * @returns {string[]} one human-readable warning per unlinkable refund
 */
export function linkRefunds(planned) {
  /** @typedef {{ id: string; amountCents: number; occurredAt: string; itemsText: string; consumed: boolean }} ChargeCandidate */
  /** @type {Map<string, ChargeCandidate[]>} */
  const chargesByKey = new Map();
  /** @type {Map<string, ChargeCandidate[]>} */
  const chargesByAccountType = new Map();
  for (const t of planned) {
    if (t.kind === 'charge' && t.refundLinkKey) {
      // ONE candidate object shared by both indices, so consuming it under either preference
      // removes it from consideration under the other.
      /** @type {ChargeCandidate} */
      const candidate = { id: t.id, amountCents: t.amountTotalCents, occurredAt: t.occurredAt, itemsText: t.itemsText, consumed: false };

      const keyList = chargesByKey.get(t.refundLinkKey) ?? [];
      keyList.push(candidate);
      chargesByKey.set(t.refundLinkKey, keyList);

      const accountTypeKey = `${t.transactionType}:${t.accountId}`;
      const accountTypeList = chargesByAccountType.get(accountTypeKey) ?? [];
      accountTypeList.push(candidate);
      chargesByAccountType.set(accountTypeKey, accountTypeList);
    }
  }
  /** @type {string[]} */
  const warnings = [];
  for (const t of planned) {
    if (t.kind !== 'refund' || !t.refundLinkKey) continue;

    const exactCandidates = chargesByKey.get(t.refundLinkKey) ?? [];
    let match = [...exactCandidates].reverse().find((c) => !c.consumed && c.amountCents === t.amountTotalCents);

    if (!match) {
      const accountTypeKey = `${t.transactionType}:${t.accountId}`;
      const partialCandidates = (chargesByAccountType.get(accountTypeKey) ?? [])
        .filter((c) => !c.consumed && c.itemsText === t.itemsText && c.occurredAt <= t.occurredAt && c.amountCents >= t.amountTotalCents)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)); // most recent first
      match = partialCandidates[0];
    }

    if (match) {
      match.consumed = true;
      t.refundsTransactionId = match.id;
    } else {
      t.refundsTransactionId = null;
      warnings.push(`refund mw_ref=${t.mwRef} account=${t.accountId ?? '(blank)'} amount=${t.amountTotalCents}c: no matching charge found -- refunds_transaction_id left null`);
    }
  }
  return warnings;
}

/**
 * Fills in `membership_id`/`enrollment_id` on the `dues`/`class-fee` lines of every planned
 * charge, in place, matching against rows `mw-members.mjs` already wrote:
 *   - a `dues` line matches the `memberships` row sharing this transaction's household, date
 *     (`paid_at`), and price (`price_paid`) -- the exact three columns that row was built from.
 *   - a `class-fee` line matches a `class_enrollments` row sharing this transaction's
 *     `processor_ref` as `stripe_ref`, but ONLY when exactly one such enrollment exists for this
 *     household: a group purchase can seat more than one member under the same shared `stripe_ref`,
 *     and a single line can reference at most one domain row (the ledger's own invariant), so a
 *     multi-seat match is left unlinked rather than guessed at.
 * Neither link is required: a membership that was later deleted (a full-refund household, per
 * the accounting-is-canon ruling) or an enrollment with no unambiguous match leaves the line's FK
 * null, never a refusal -- the line still records the money fact.
 * @param {(PlannedTransaction & { id: string })[]} planned
 * @param {ExistingLedgerState} existing
 */
export function linkDomainRows(planned, existing) {
  for (const t of planned) {
    if (t.kind !== 'charge' || !t.householdId) continue;
    for (const line of t.lines) {
      if (line.item === 'dues') {
        const priceDollars = line.amountCents / 100;
        const match = existing.memberships.find((m) => m.householdId === t.householdId && m.paidAt === t.occurredAt && m.pricePaid === priceDollars);
        if (match) line.membershipId = match.id;
      } else if (line.item === 'class-fee' && t.processorRef) {
        const matches = existing.enrollments.filter((e) => e.householdId === t.householdId && e.stripeRef === t.processorRef);
        if (matches.length === 1) line.enrollmentId = matches[0].id;
      }
    }
  }
}

/**
 * @typedef {object} PlannedRepair
 * @property {string} transactionId the existing header's REAL database id -- no `transactions`
 *   INSERT is planned for a repair, only its `transaction_lines`
 * @property {string} mwRef
 * @property {PlannedLine[]} lines re-derived from this run's own planning pass, domain-linked the
 *   same as any other planned row's lines
 * @property {number} lineCount
 */

/**
 * Self-heals a prior run's partial apply: finds every already-imported `transactions` header
 * with zero `transaction_lines` rows (`existing.headersMissingLines`, the signature of a batch
 * that committed its header INSERT but not its line INSERTs) and re-derives that header's lines
 * from THIS run's own planning pass, keyed by the header's own `mw_ref`. A header no longer
 * represented in this export (a row removed from the source since the partial apply) is left
 * alone -- there is nothing to repair it FROM -- rather than refused, since a repair is
 * self-healing, not a fresh import decision.
 * @param {(PlannedTransaction & { id: string })[]} planned every planned row this run, already
 *   carrying the real database id for any row whose `mw_ref` already exists
 *   ({@link planMwLedgerImport}'s id-assignment step)
 * @param {ExistingLedgerState} existing
 * @returns {PlannedRepair[]}
 */
export function planRepairs(planned, existing) {
  const byMwRef = new Map(planned.map((t) => [t.mwRef, t]));
  /** @type {PlannedRepair[]} */
  const repairs = [];
  for (const header of existing.headersMissingLines) {
    const match = byMwRef.get(header.mwRef);
    if (!match) continue;
    repairs.push({ transactionId: header.id, mwRef: header.mwRef, lines: match.lines, lineCount: match.lines.length });
  }
  return repairs;
}

// ---------------------------------------------------------------------------
// Top-level plan.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MwLedgerPlan
 * @property {(PlannedTransaction & { id: string, refundsTransactionId: string | null })[]} toInsert
 * @property {{ mwRef: string }[]} alreadyImported rows whose `mw_ref` is already in the database
 *   (the idempotent no-op path)
 * @property {{ reason: string, accountId: string }[]} refusals
 * @property {{ kind: string, source: string, count: number }[]} categoryCounts
 * @property {string[]} warnings loud, human-readable warnings that never block a write -- an
 *   unlinkable refund, currently the only source (see {@link linkRefunds})
 * @property {PlannedRepair[]} repairs partial-apply self-heals: an existing header with zero
 *   lines, whose lines this run plans as line-only inserts (see {@link planRepairs})
 */

/**
 * Plans the whole import: classifies every row, links refunds and domain rows, and separates
 * already-imported rows (matched by `mw_ref`) from real work. Never writes anything -- `main()`'s
 * own statement-building step does that, gated on `--apply`.
 * @param {Record<string, string>[]} accountingRows every row of the accounting export, in file
 *   order
 * @param {ExistingLedgerState} existing
 * @returns {MwLedgerPlan}
 */
export function planMwLedgerImport(accountingRows, existing) {
  const listPrices = buildListPriceIndex(accountingRows);
  /** @type {{ reason: string, accountId: string }[]} */
  const refusals = [];
  /** @type {(PlannedTransaction & { id: string, refundsTransactionId: string | null })[]} */
  const planned = [];
  /** @type {Map<string, number>} */
  const seenRefs = new Map();

  for (const row of accountingRows) {
    let t;
    try {
      t = planTransactionRow(row, existing, listPrices);
    } catch (err) {
      if (err instanceof RowRefusedError) {
        refusals.push({ reason: err.reason, accountId: err.context.accountId || '(blank)' });
        continue;
      }
      throw err;
    }
    const seenCount = seenRefs.get(t.mwRef) ?? 0;
    seenRefs.set(t.mwRef, seenCount + 1);
    const mwRef = seenCount === 0 ? t.mwRef : `${t.mwRef}#${seenCount}`;
    // A row already imported keeps its REAL database id rather than minting a fresh one: a
    // same-run or cross-run refund linking against this row (linkRefunds, below) must point at
    // the id the row actually has in the database, never a throwaway id this run generates for a
    // row it never re-inserts.
    const id = existing.existingIdByMwRef.get(mwRef) ?? randomUUID();
    planned.push({ ...t, mwRef, id, refundsTransactionId: null });
  }

  const warnings = linkRefunds(planned);
  linkDomainRows(planned, existing);
  const repairs = planRepairs(planned, existing);

  const toInsert = planned.filter((t) => !existing.existingMwRefs.has(t.mwRef));
  const alreadyImported = planned.filter((t) => existing.existingMwRefs.has(t.mwRef)).map((t) => ({ mwRef: t.mwRef }));

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const t of toInsert) {
    const key = `${t.kind}:${t.source}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const categoryCounts = [...counts.entries()].map(([key, count]) => {
    const [kind, source] = key.split(':');
    return { kind, source, count };
  });

  return { toInsert, alreadyImported, refusals, categoryCounts, warnings, repairs };
}

// ---------------------------------------------------------------------------
// Statement building.
// ---------------------------------------------------------------------------

/**
 * One `transaction_lines` INSERT for a line under a given transaction id -- the single source both
 * the fresh-import and the repair path share, so the eight-column shape never drifts between them.
 * @param {string} transactionId
 * @param {PlannedLine} line
 * @returns {string}
 */
function buildLineInsertStatement(transactionId, line) {
  return `INSERT INTO transaction_lines (id, transaction_id, item, description, amount_cents, membership_id, enrollment_id, assignment_id) VALUES (${sqlLiteral(randomUUID())}, ${sqlLiteral(transactionId)}, ${sqlLiteral(line.item)}, ${sqlLiteral(line.description)}, ${sqlInt(line.amountCents)}, ${sqlLiteral(line.membershipId)}, ${sqlLiteral(line.enrollmentId)}, ${sqlLiteral(line.assignmentId)})`;
}

/**
 * Builds the `transactions` INSERT plus one `transaction_lines` INSERT per line for one planned
 * row -- the same shape `src/admin-club/lib/ledger.ts`'s `buildTransactionStatements` enforces at
 * the live write seam, expressed as raw SQL text (this script has no `D1Database` object; it
 * shells out through `wrangler d1 execute`, exactly like `mw-members.mjs`).
 * @param {PlannedTransaction & { id: string, refundsTransactionId: string | null }} t
 * @returns {string[]}
 */
export function buildTransactionInsertStatements(t) {
  return [
    `INSERT INTO transactions (id, kind, source, occurred_at, amount_total_cents, fee_cents, processor_ref, refunds_transaction_id, household_id, payer_name, payer_email, memo, mw_ref) VALUES (${sqlLiteral(t.id)}, ${sqlLiteral(t.kind)}, ${sqlLiteral(t.source)}, ${sqlLiteral(t.occurredAt)}, ${sqlInt(t.amountTotalCents)}, ${t.feeCents === null ? 'NULL' : sqlInt(t.feeCents)}, ${sqlLiteral(t.processorRef)}, ${sqlLiteral(t.refundsTransactionId)}, ${sqlLiteral(t.householdId)}, ${sqlLiteral(t.payerName)}, ${sqlLiteral(t.payerEmail)}, ${sqlLiteral(t.memo ?? null)}, ${sqlLiteral(t.mwRef)})`,
    ...t.lines.map((line) => buildLineInsertStatement(t.id, line)),
  ];
}

/**
 * Builds the `transaction_lines` INSERT statements for one repair: an existing `transactions`
 * header whose lines this run re-derives from the export (see {@link planRepairs}). No
 * `transactions` INSERT -- the header row already exists in the database.
 * @param {PlannedRepair} repair
 * @returns {string[]}
 */
export function buildRepairLineStatements(repair) {
  return repair.lines.map((line) => buildLineInsertStatement(repair.transactionId, line));
}

/**
 * Formats the plan for a human read: category counts, repairs, refusals (account id + reason, no
 * name or email -- names/emails never print from this script), the already-imported count, and
 * any warning (an unlinkable refund, currently the only source). Printed under `--dry-run` and on
 * a real applied run alike.
 * @param {MwLedgerPlan} plan
 * @returns {string}
 */
export function formatReport(plan) {
  const lines = ['mw-ledger plan:'];
  lines.push(`  to insert: ${plan.toInsert.length}`);
  for (const c of plan.categoryCounts) lines.push(`    ${c.kind}/${c.source}: ${c.count}`);
  lines.push(`  already imported (no-op): ${plan.alreadyImported.length}`);
  lines.push(`  repairs (existing header, missing lines): ${plan.repairs.length}`);
  for (const r of plan.repairs) lines.push(`    mw_ref=${r.mwRef}: ${r.lineCount} line(s)`);
  lines.push(`  refused: ${plan.refusals.length}`);
  for (const r of plan.refusals) lines.push(`    account=${r.accountId}: ${r.reason}`);
  if (plan.warnings.length > 0) {
    lines.push(`  warnings: ${plan.warnings.length}`);
    for (const w of plan.warnings) lines.push(`    ${w}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Real-database plumbing (mirrors `mw-members.mjs`'s own `wrangler`/`query` helpers).
// ---------------------------------------------------------------------------

const dbNameFlagIndex = process.argv.indexOf('--db');
const DB_NAME = dbNameFlagIndex !== -1 ? process.argv[dbNameFlagIndex + 1] : 'asc-club';

/** @param {string[]} args */
function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { cwd: ROOT_DIR, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** @param {string} sql @returns {Record<string, unknown>[]} */
function query(sql) {
  const out = wrangler(['d1', 'execute', DB_NAME, '--remote', '--command', sql, '--json']);
  return JSON.parse(out)[0].results;
}

/** @returns {ExistingLedgerState} */
function readExistingState() {
  const members = query(`SELECT household_id, mw_account_id FROM members WHERE mw_account_id IS NOT NULL`);
  const householdIdByMwAccountId = new Map(members.map((r) => [String(r.mw_account_id), String(r.household_id)]));

  const memberships = query(`SELECT id, household_id, price_paid, paid_at FROM memberships`).map((r) => ({
    id: String(r.id),
    householdId: String(r.household_id),
    paidAt: r.paid_at === null ? null : String(r.paid_at),
    pricePaid: Number(r.price_paid),
  }));

  const enrollmentRows = query(
    `SELECT ce.id, ce.stripe_ref, m.household_id FROM class_enrollments ce JOIN members m ON m.id = ce.member_id WHERE ce.stripe_ref IS NOT NULL`,
  );
  const enrollments = enrollmentRows.map((r) => ({ id: String(r.id), householdId: String(r.household_id), stripeRef: String(r.stripe_ref) }));

  const transactionRows = query(`SELECT id, mw_ref FROM transactions WHERE mw_ref IS NOT NULL`);
  const existingIdByMwRef = new Map(transactionRows.map((r) => [String(r.mw_ref), String(r.id)]));
  const existingMwRefs = new Set(existingIdByMwRef.keys());

  const headersMissingLines = query(
    `SELECT t.id, t.mw_ref FROM transactions t LEFT JOIN transaction_lines tl ON tl.transaction_id = t.id WHERE t.mw_ref IS NOT NULL AND tl.id IS NULL`,
  ).map((r) => ({ id: String(r.id), mwRef: String(r.mw_ref) }));

  // classes.fee is whole DOLLARS (mw-members.mjs's own HISTORICAL_CLASS_FEE convention);
  // converted to cents here, this script's own unit throughout.
  const classRows = query(`SELECT season, slug, fee FROM classes`);
  const classFeeCentsBySeasonSlug = new Map(classRows.map((r) => [`${r.season}:${r.slug}`, Number(r.fee) * 100]));

  return { householdIdByMwAccountId, memberships, enrollments, existingMwRefs, existingIdByMwRef, headersMissingLines, classFeeCentsBySeasonSlug };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const argValue = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : fallback;
  };
  const accountingPath = argValue('--accounting', path.join(os.homedir(), '.local', 'asc-data', 'mw-accounting-2026-07-13.csv'));

  const existing = readExistingState();
  console.log(`mw-ledger: ${existing.memberships.length} membership(s), ${existing.enrollments.length} stripe-linked enrollment(s), ${existing.existingMwRefs.size} transaction(s) already in ${DB_NAME} (${existing.headersMissingLines.length} missing their lines)`);

  const accountingRows = parseMwCsv(readFileSync(accountingPath, 'utf8'));
  console.log(`mw-ledger: ${accountingRows.length} accounting row(s) read`);

  const plan = planMwLedgerImport(accountingRows, existing);
  console.log(`\n${formatReport(plan)}`);

  if (!apply) {
    console.log('\ndry run (default): no statements executed. Pass --apply to write to the real database.');
    return;
  }
  if (plan.toInsert.length === 0 && plan.repairs.length === 0) {
    console.log('\nmw-ledger: nothing to write (idempotent no-op run).');
    return;
  }

  const statements = [
    ...plan.toInsert.flatMap((t) => buildTransactionInsertStatements(t)),
    ...plan.repairs.flatMap((r) => buildRepairLineStatements(r)),
  ];
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mw-ledger-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join(';\n'));
  try {
    wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`\nmw-ledger: applied ${statements.length} statement(s) to ${DB_NAME}`);
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
