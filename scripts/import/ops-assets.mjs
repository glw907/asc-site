#!/usr/bin/env node
/**
 * Import script: asc-ops's asset domain (asset_types, assignments, the per-assignment
 * payment fields, the non-class waitlist rows) -> asc-club's asset_types / asset_assignments
 * / asset_payments / asset_waitlist. asc-ops is never altered; this only ever SELECTs from
 * it. asc-club is the write target, upserted by natural key, idempotent: re-running never
 * duplicates a row, it only updates one whose mapped columns actually changed.
 *
 * ASSETS ATTACH TO MEMBERSHIPS, NOT PEOPLE (the redesign's own correction of asc-ops's
 * workaround model, the ratified schema's own header comment): every ops person is matched to
 * an asc-club `members` row BY EMAIL, and a matched assignment lands on that member's
 * household's CURRENT membership -- resolved as the household's MOST RECENT PAID row (max
 * `paid_at`, `paid_at IS NOT NULL`), never `season = settings.current_season` ({@link
 * resolveCurrentMembershipByHousehold}'s own header carries the full rolling-renewal reasoning,
 * 2026-07-14). A person with no matching `members.email` (a real club member never captured in
 * the MembershipWorks import, or one of ops's own leftover QA-seed rows) is never invented into a
 * new member here; their assignments stay unimported, listed in the machine-local unmatched
 * report (`~/.local/asc-data/ops-assets-unmatched.md`, real names and emails, never committed)
 * for manual resolution.
 *
 * A SMALL EXPLICIT OVERRIDE MAP RECONCILES THE TWO HOLDERS EMAIL COULD NOT: `OVERRIDES` below
 * maps an ops `person_id` straight to the MembershipWorks account id the 2026-07-13 member
 * import gave that same person under a different email than asc-ops held for them (see
 * `ops-assets.README.md`'s "Override map" section for the reason). An override is consulted
 * AHEAD of the email match, resolved through `members.mw_account_id`; when the override's
 * account id has no matching member row yet, resolution falls through to the ordinary email
 * match and, failing that, the unmatched report -- an override is never itself a refusal.
 *
 * FULL ASSIGNMENT HISTORY CARRIES OVER, ACTIVE AND RELEASED ALIKE: asc-ops's own
 * `status IN ('active','cancelled')` maps onto asc-club's `status IN ('active','released')`
 * verbatim (cancelled -> released), because asc-club's schema was designed from the start to
 * hold a released assignment as history rather than delete it (the ratified DDL's own comment:
 * "per-season fee state lives in payments rows, NOT as a mutable flag"). The admin screens
 * (Part 2) read only `status = 'active'` for the two "who holds what now" lenses; a released
 * row is imported, but not surfaced there, by design.
 *
 * PAYMENTS: asc-ops's own `payments` ledger table is the dead table the ratified schema's own
 * comment names ("the ledger ops's dead payments table intended") -- it is empty on the real
 * database and this script never reads it. The real payment state ops actually carries lives on
 * `assignments` itself (`payment_status`/`payment_sent_at`/`stripe_payment_id`), all dated the
 * current season (2026) on the live data checked before this script was written. One
 * `asset_payments` row is created per imported assignment whose `payment_status` is `'paid'` or
 * `'sent'` (`'not_requested'` means never billed, nothing to import): `season` is asc-club's own
 * `current_season`, `stripe_ref` carries the checkout/payment session id verbatim, and `paid_at`
 * is set only for `'paid'` rows (`'sent'` means invoiced/outstanding, matching the schema's own
 * NULL convention). `amount` is a DOCUMENTED APPROXIMATION: asc-ops never snapshotted the fee an
 * individual assignment was actually billed at, so this script snapshots the asset type's
 * CURRENT fee at import time instead (mirroring the MW import's own paid-at-from-renewal-date
 * approximation); every payment row's own audit line and the batch summary both say so.
 *
 * WAITLIST: asc-ops's `waitlist_type = 'class'` rows are the class-signup queue pass 2.1 already
 * imports through its own public forms; this script skips them entirely and imports every OTHER
 * `waitlist_type` row as an asset-queue entry. Asset queues are the continuous, multi-year
 * physical lists the ratified schema's own comment names (never reset, unlike the seasonal class
 * waitlist), so `position` carries straight over. asc-ops's own `item` column plays the same role
 * for an asset row that it plays for a class row (the specific target the entry is queued for,
 * `waitlist_type` naming only the broad category): this script reads `item` as the target
 * `asset_types.id`, a documented judgment call made with zero live asset-waitlist rows to check
 * it against (the real database carries none as of this import).
 *
 * Usage:
 *   node scripts/import/ops-assets.mjs --dry-run [--club-db-name NAME] [--ops-db-name NAME]
 *   node scripts/import/ops-assets.mjs [--club-db-name NAME] [--ops-db-name NAME]
 *
 * `--club-db-name` and `--ops-db-name` override the real write target and read source; only ever
 * used together to scratch-prove this script (including its rollback file) against a disposable
 * pair of databases, never for a real run. Needs `CLOUDFLARE_API_TOKEN` in the environment
 * (wrangler picks it up automatically) and network access to both databases.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const clubDbFlagIndex = process.argv.indexOf('--club-db-name');
const CLUB_DB_NAME = clubDbFlagIndex !== -1 ? process.argv[clubDbFlagIndex + 1] : 'asc-club';
/** `--ops-db-name` overrides the real, read-only `asc-ops` source; only ever used to
 *  scratch-prove this script against a disposable pair of databases, never for a real run. */
const opsDbFlagIndex = process.argv.indexOf('--ops-db-name');
const OPS_DB_NAME = opsDbFlagIndex !== -1 ? process.argv[opsDbFlagIndex + 1] : 'asc-ops';

const UNMATCHED_REPORT_PATH = path.join(os.homedir(), '.local', 'asc-data', 'ops-assets-unmatched.md');

// ---------------------------------------------------------------------------
// Pure transforms (exported for the test suite; touch no filesystem or network).
// ---------------------------------------------------------------------------

/**
 * Convert asc-ops's whole-cents fee (its own column comment: "current fee in cents") to
 * asc-club's whole-dollar convention.
 * @param {number} cents
 * @returns {number}
 */
export function centsToDollars(cents) {
  return Math.round(cents / 100);
}

/**
 * One asc-ops `asset_types` row -> one asc-club `asset_types` row. The id carries straight over
 * (asc-ops's own stable text id, e.g. `mooring`), the same natural-key reuse
 * `scripts/import/ops-classes.mjs` already established.
 * @param {{ id: string, name: string, fee: number, capacity: number | null, sort_order: number }} src
 * @returns {{ id: string, name: string, fee: number, capacity: number | null, sortOrder: number }}
 */
export function toAssetTypeRow(src) {
  return { id: src.id, name: src.name, fee: centsToDollars(src.fee), capacity: src.capacity, sortOrder: src.sort_order };
}

/**
 * Resolve one asc-ops person's real `members.id` (and household) by email, or `null` if this
 * import declines to match them. Case-insensitively, matching every other email-keyed match this
 * repo's imports already make (`mw-members.mjs`'s own `context.email` normalization).
 * @param {string | null} email
 * @param {Map<string, { id: string, householdId: string }>} memberByEmail lowercased email -> member
 * @returns {{ id: string, householdId: string } | null}
 */
export function resolveMemberByEmail(email, memberByEmail) {
  if (!email) return null;
  return memberByEmail.get(email.trim().toLowerCase()) ?? null;
}

/**
 * Explicit reconciliation overrides for holders the email match cannot reach on its own: ops
 * `person_id` -> the MembershipWorks account id the 2026-07-13 member import gave that same
 * person under an email different from the one asc-ops holds (module header and
 * `ops-assets.README.md`'s "Override map" section carry the full reason). Opaque MW account
 * ids, safe to commit; no name or email appears here.
 * @type {Record<string, string>}
 */
export const OVERRIDES = {
  '18': '661f6b677abbb920560b306b',
  '120': '662f056a120ba1f321076c25',
};

/**
 * Resolve one asc-ops person's real `members.id` (and household), consulting `OVERRIDES` ahead
 * of the email match. An override id with no matching `members.mw_account_id` row yet (the
 * import hasn't landed, or the id was mistyped) is not a refusal on its own: resolution falls
 * through to the ordinary email match, and from there to the unmatched report like any other
 * holder.
 * @param {number | string} personId the ops `people.id`
 * @param {string | null} email
 * @param {Map<string, { id: string, householdId: string }>} memberByEmail lowercased email -> member
 * @param {Map<string, { id: string, householdId: string }>} memberByMwAccountId mw_account_id -> member
 * @returns {{ id: string, householdId: string } | null}
 */
export function resolveMember(personId, email, memberByEmail, memberByMwAccountId) {
  const overrideAccountId = OVERRIDES[String(personId)];
  if (overrideAccountId) {
    const overridden = memberByMwAccountId.get(overrideAccountId);
    if (overridden) return overridden;
  }
  return resolveMemberByEmail(email, memberByEmail);
}

/**
 * @typedef {object} OpsAssignmentSrc
 * @property {number} id
 * @property {number} person_id
 * @property {string} asset_type
 * @property {string | null} description
 * @property {string} status
 * @property {string} created_at
 * @property {string} payment_status
 * @property {string | null} payment_sent_at
 * @property {string | null} stripe_payment_id
 */

/**
 * @typedef {object} AssetAssignmentRow
 * @property {string} id
 * @property {string} assetType
 * @property {string} membershipId
 * @property {string | null} description
 * @property {'active' | 'released'} status
 * @property {string} createdAt
 * @property {number} sourceId
 */

/**
 * @typedef {object} SkippedRow
 * @property {string} skipped
 * @property {number} sourceId
 * @property {string | null} email
 */

/** @param {AssetAssignmentRow | SkippedRow} value @returns {value is AssetAssignmentRow} */
function isAssignmentRow(value) {
  return !('skipped' in value);
}

/** @param {AssetAssignmentRow | SkippedRow} value @returns {value is SkippedRow} */
function isAssignmentSkip(value) {
  return 'skipped' in value;
}

/** Heuristic staleness threshold for a household's most-recent-paid membership: this script has
 *  no access to the club's actual grace-period setting, so ~400 days (a year plus generous
 *  slack) stands in for "paid_at + 1 year + grace, clearly past". A household this far past its
 *  last real payment is genuinely lapsed, not merely season-mislabeled -- attaching an asset to
 *  it is the real "unexpected" case this import still warns about. */
export const STALE_MEMBERSHIP_DAYS = 400;

/**
 * Resolves each household's CURRENT membership as its MOST RECENT PAID row (max `paid_at`,
 * `paid_at IS NOT NULL`) -- never `season = settings.current_season`. The rolling-renewal
 * doctrine (migration 0009's own ruling: a household is current through `paid_at + 1 year`;
 * `season` is purely a period label, never itself the currency test) means a household paid
 * recently can still carry its latest row labeled a PRIOR season: the mw-members import's own
 * season-rewrite (2026-07-14 correction) lands a membership row at the season its real
 * transaction actually computed to, which is not always `settings.current_season`. Resolving by
 * season alone silently misses that household's assignments entirely (root cause of the
 * ops-assets dry-run's own false "no current-season membership" warnings, 2026-07-14).
 *
 * A household whose most-recent-paid row is itself stale ({@link STALE_MEMBERSHIP_DAYS} days or
 * more before `asOf`) is excluded from the result, so its assignments still report as skipped --
 * a long-lapsed membership is the genuinely unexpected case worth a human's look.
 * @param {{ householdId: string, id: string, paidAt: string | null }[]} memberships every
 *   membership row (paid_at may be null; those are simply never a household's own "most recent
 *   paid" candidate)
 * @param {Date} [asOf] defaults to the real current time; a fixed date makes the staleness check testable
 * @returns {Map<string, string>} householdId -> its most-recent-paid, non-stale membership id
 */
export function resolveCurrentMembershipByHousehold(memberships, asOf = new Date()) {
  /** @type {Map<string, { id: string, paidAt: string }>} */
  const latestByHousehold = new Map();
  for (const m of memberships) {
    if (!m.paidAt) continue;
    const current = latestByHousehold.get(m.householdId);
    if (!current || m.paidAt > current.paidAt) latestByHousehold.set(m.householdId, { id: m.id, paidAt: m.paidAt });
  }

  /** @type {Map<string, string>} */
  const result = new Map();
  for (const [householdId, m] of latestByHousehold) {
    const ageDays = (asOf.getTime() - new Date(m.paidAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= STALE_MEMBERSHIP_DAYS) continue; // genuinely lapsed; the household reports as skipped instead
    result.set(householdId, m.id);
  }
  return result;
}

/**
 * One asc-ops `assignments` row -> one asc-club `asset_assignments` row, or a refusal reason if
 * this row cannot be imported (no matching member, or a matched member whose household has no
 * current -- most-recently-paid, non-stale -- membership, per
 * {@link resolveCurrentMembershipByHousehold}; should be rare post-MW-import, but answered
 * honestly rather than assumed away).
 * @param {Pick<OpsAssignmentSrc, 'id' | 'person_id' | 'asset_type' | 'description' | 'status' | 'created_at'>} src
 * @param {string | null} email the ops person's email (already looked up by `person_id`)
 * @param {Map<string, { id: string, householdId: string }>} memberByEmail
 * @param {Map<string, string>} currentMembershipByHousehold householdId -> its most-recent-paid,
 *   non-stale membership id, per {@link resolveCurrentMembershipByHousehold}
 * @param {Map<string, { id: string, householdId: string }>} [memberByMwAccountId] mw_account_id -> member; consulted for `src.person_id` via `OVERRIDES` ahead of the email match
 * @returns {AssetAssignmentRow | SkippedRow}
 */
export function toAssetAssignmentRow(src, email, memberByEmail, currentMembershipByHousehold, memberByMwAccountId = new Map()) {
  const member = resolveMember(src.person_id, email, memberByEmail, memberByMwAccountId);
  if (!member) return { skipped: 'unmatched', sourceId: src.id, email };
  const membershipId = currentMembershipByHousehold.get(member.householdId);
  if (!membershipId) return { skipped: 'no-current-membership', sourceId: src.id, email };
  return {
    id: `ops-assignment-${src.id}`,
    assetType: src.asset_type,
    membershipId,
    description: src.description,
    status: src.status === 'active' ? 'active' : 'released',
    createdAt: src.created_at,
    sourceId: src.id,
  };
}

/**
 * @typedef {object} AssetPaymentRow
 * @property {string} id
 * @property {string} assignmentId
 * @property {number} season
 * @property {number} amount
 * @property {string | null} stripeRef
 * @property {string | null} paidAt
 */

/**
 * One asc-ops `assignments` row's own payment fields -> one asc-club `asset_payments` row, or
 * `null` when nothing was ever billed (`payment_status = 'not_requested'`). `amount` is the
 * imported asset type's CURRENT fee, a documented approximation (this module's own header): ops
 * never snapshotted the fee an individual assignment was billed at.
 * @param {{ id: number, payment_status: string, payment_sent_at: string | null, stripe_payment_id: string | null }} src
 * @param {number} currentSeason
 * @param {number} feeForType whole dollars, the asset type's current fee
 * @returns {AssetPaymentRow | null}
 */
export function toAssetPaymentRow(src, currentSeason, feeForType) {
  if (src.payment_status !== 'paid' && src.payment_status !== 'sent') return null;
  return {
    id: `ops-payment-${src.id}`,
    assignmentId: `ops-assignment-${src.id}`,
    season: currentSeason,
    amount: feeForType,
    stripeRef: src.stripe_payment_id,
    paidAt: src.payment_status === 'paid' ? src.payment_sent_at : null,
  };
}

/**
 * @typedef {object} OpsWaitlistSrc
 * @property {number} id
 * @property {number} person_id
 * @property {string} item
 * @property {number | null} position
 * @property {string} requested_at
 * @property {string | null} notes
 */

/**
 * @typedef {object} AssetWaitlistRow
 * @property {string} id
 * @property {string} assetType
 * @property {string} memberId
 * @property {number} position
 * @property {string} requestedAt
 * @property {string | null} notes
 * @property {number} sourceId
 */

/** @param {AssetWaitlistRow | SkippedRow} value @returns {value is AssetWaitlistRow} */
function isWaitlistRow(value) {
  return !('skipped' in value);
}

/** @param {AssetWaitlistRow | SkippedRow} value @returns {value is SkippedRow} */
function isWaitlistSkip(value) {
  return 'skipped' in value;
}

/**
 * One asc-ops `waitlist` row (already filtered to `waitlist_type != 'class'`) -> one asc-club
 * `asset_waitlist` row, or a refusal reason. `item` reads as the target `asset_types.id` (this
 * module's own header, a documented judgment call).
 * @param {Pick<OpsWaitlistSrc, 'id' | 'person_id' | 'item' | 'position' | 'requested_at' | 'notes'>} src
 * @param {string | null} email
 * @param {Map<string, { id: string, householdId: string }>} memberByEmail
 * @param {Map<string, { id: string, householdId: string }>} [memberByMwAccountId] mw_account_id -> member; consulted for `src.person_id` via `OVERRIDES` ahead of the email match
 * @returns {AssetWaitlistRow | SkippedRow}
 */
export function toAssetWaitlistRow(src, email, memberByEmail, memberByMwAccountId = new Map()) {
  const member = resolveMember(src.person_id, email, memberByEmail, memberByMwAccountId);
  if (!member) return { skipped: 'unmatched', sourceId: src.id, email };
  if (src.position == null) return { skipped: 'no-position', sourceId: src.id, email };
  return {
    id: `ops-waitlist-${src.id}`,
    assetType: src.item,
    memberId: member.id,
    position: src.position,
    requestedAt: src.requested_at,
    notes: src.notes,
    sourceId: src.id,
  };
}

/**
 * Plans the whole run against already-fetched, plain-object source and lookup data (no database
 * or filesystem access here, so this stays unit-testable against a small synthetic fixture):
 * asset types, every mapped-and-refused assignment, its derived payment (if any), and every
 * mapped-and-refused waitlist row. `club.currentMembershipByHousehold` is the caller's job to
 * build (householdId -> its most-recent-paid, non-stale membership id, per
 * {@link resolveCurrentMembershipByHousehold}); `planImport` itself only ever reads the finished
 * map.
 * @param {{
 *   assetTypes: Parameters<typeof toAssetTypeRow>[0][],
 *   assignments: OpsAssignmentSrc[],
 *   waitlist: OpsWaitlistSrc[],
 *   emailByPersonId: Map<number, string>,
 * }} ops
 * @param {{
 *   memberByEmail: Map<string, { id: string, householdId: string }>,
 *   memberByMwAccountId?: Map<string, { id: string, householdId: string }>,
 *   currentMembershipByHousehold: Map<string, string>,
 *   currentSeason: number,
 * }} club
 */
export function planImport(ops, club) {
  const assetTypeRows = ops.assetTypes.map(toAssetTypeRow);
  const feeByType = new Map(assetTypeRows.map((t) => [t.id, t.fee]));

  const assignmentResults = ops.assignments.map((src) => {
    const email = ops.emailByPersonId.get(src.person_id) ?? null;
    return toAssetAssignmentRow(src, email, club.memberByEmail, club.currentMembershipByHousehold, club.memberByMwAccountId);
  });
  const assignmentRows = assignmentResults.filter(isAssignmentRow);
  const assignmentSkips = assignmentResults.filter(isAssignmentSkip);

  /** @type {AssetPaymentRow[]} */
  const paymentRows = [];
  for (const src of ops.assignments) {
    const imported = assignmentRows.find((r) => r.sourceId === src.id);
    if (!imported) continue;
    const fee = feeByType.get(src.asset_type) ?? 0;
    const payment = toAssetPaymentRow(src, club.currentSeason, fee);
    if (payment) paymentRows.push(payment);
  }

  const waitlistResults = ops.waitlist.map((src) => {
    const email = ops.emailByPersonId.get(src.person_id) ?? null;
    return toAssetWaitlistRow(src, email, club.memberByEmail, club.memberByMwAccountId);
  });
  const waitlistRows = waitlistResults.filter(isWaitlistRow);
  const waitlistSkips = waitlistResults.filter(isWaitlistSkip);

  return { assetTypeRows, assignmentRows, assignmentSkips, paymentRows, waitlistRows, waitlistSkips };
}

// ---------------------------------------------------------------------------
// The wrangler-shelling CLI (guarded so importing this module for tests never runs it, the same
// dual-mode idiom `scripts/verify/real-d1-write-path.mjs` and `mw-members.mjs` document).
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

/** @param {string} email */
function redactEmail(email) {
  const [local, domain] = email.split('@');
  return `${(local ?? '').slice(0, 3)}***@${domain ?? '?'}`;
}

const ASSET_TYPE_COLUMNS = ['name', 'fee', 'capacity', 'sort_order'];
const ASSIGNMENT_COLUMNS = ['asset_type', 'membership_id', 'description', 'status'];
const WAITLIST_COLUMNS = ['asset_type', 'member_id', 'position', 'notes'];

/**
 * @param {Record<string, unknown> | undefined} existing
 * @param {Record<string, unknown>} incoming
 * @param {string[]} columns
 */
function changedColumns(existing, incoming, columns) {
  if (!existing) return columns;
  return columns.filter((col) => String(existing[col] ?? '') !== String(incoming[col] ?? ''));
}

async function main() {
  mkdirSync(path.dirname(UNMATCHED_REPORT_PATH), { recursive: true });

  const currentSeasonRow = query(CLUB_DB_NAME, `SELECT value FROM settings WHERE key = 'current_season'`)[0];
  const currentSeason = Number(currentSeasonRow.value);
  console.log(`ops-assets: current_season=${currentSeason}`);

  const opsAssetTypes = /** @type {Parameters<typeof toAssetTypeRow>[0][]} */ (
    query(OPS_DB_NAME, `SELECT id, name, fee, capacity, sort_order FROM asset_types ORDER BY sort_order`)
  );
  const opsAssignments = /** @type {OpsAssignmentSrc[]} */ (
    query(
      OPS_DB_NAME,
      `SELECT id, person_id, asset_type, description, status, created_at, payment_status, payment_sent_at, stripe_payment_id
       FROM assignments ORDER BY id`,
    )
  );
  const opsWaitlist = /** @type {OpsWaitlistSrc[]} */ (
    query(
      OPS_DB_NAME,
      `SELECT id, person_id, item, position, requested_at, notes FROM waitlist WHERE waitlist_type != 'class' ORDER BY item, position`,
    )
  );
  const opsPeople = query(OPS_DB_NAME, `SELECT id, name, email FROM people`);
  /** @type {Map<number, string>} */
  const emailByPersonId = new Map(opsPeople.map((p) => [Number(p.id), String(p.email)]));
  /** @type {Map<number, string>} */
  const nameByPersonId = new Map(opsPeople.map((p) => [Number(p.id), String(p.name)]));

  const clubMembers = query(CLUB_DB_NAME, `SELECT id, email, household_id, mw_account_id FROM members`);
  /** @type {Map<string, { id: string, householdId: string }>} */
  const memberByEmail = new Map(
    clubMembers
      .filter((m) => m.email)
      .map((m) => [String(m.email).trim().toLowerCase(), { id: String(m.id), householdId: String(m.household_id) }]),
  );
  /** @type {Map<string, { id: string, householdId: string }>} mw_account_id -> member, for `OVERRIDES` */
  const memberByMwAccountId = new Map(
    clubMembers
      .filter((m) => m.mw_account_id)
      .map((m) => [String(m.mw_account_id), { id: String(m.id), householdId: String(m.household_id) }]),
  );
  // Resolved by MOST RECENT PAID row, never by `season = currentSeason`: see
  // `resolveCurrentMembershipByHousehold`'s own header for the rolling-renewal reasoning.
  const clubMemberships = query(CLUB_DB_NAME, `SELECT household_id, id, paid_at FROM memberships WHERE paid_at IS NOT NULL`);
  const currentMembershipByHousehold = resolveCurrentMembershipByHousehold(
    clubMemberships.map((m) => ({ householdId: String(m.household_id), id: String(m.id), paidAt: String(m.paid_at) })),
  );

  const plan = planImport(
    { assetTypes: opsAssetTypes, assignments: opsAssignments, waitlist: opsWaitlist, emailByPersonId },
    { memberByEmail, memberByMwAccountId, currentMembershipByHousehold, currentSeason },
  );

  // Every ops person with zero matched-and-unmatched assignments/waitlist entries above is not
  // itself a refusal (most of ops's own QA-seed rows carry no assignment at all); the unmatched
  // report only ever lists a person this import actually declined to bring an assignment or
  // waitlist entry over for. Processed as two separate passes, never merged into one lookup by
  // `sourceId`: `assignments.id` and `waitlist.id` are independent autoincrement sequences in
  // asc-ops and can (and do) collide, so a single combined id-keyed lookup would silently
  // attribute one domain's skip to the other domain's person.
  const unmatchedByPerson = new Map();
  for (const src of opsAssignments) {
    const skip = plan.assignmentSkips.find((s) => s.skipped === 'unmatched' && s.sourceId === src.id);
    if (!skip || !skip.email) continue;
    if (!unmatchedByPerson.has(src.person_id)) {
      unmatchedByPerson.set(src.person_id, { name: nameByPersonId.get(src.person_id), email: skip.email, assignments: 0, waitlist: 0 });
    }
    unmatchedByPerson.get(src.person_id).assignments += 1;
  }
  for (const src of opsWaitlist) {
    const skip = plan.waitlistSkips.find((s) => s.skipped === 'unmatched' && s.sourceId === src.id);
    if (!skip || !skip.email) continue;
    if (!unmatchedByPerson.has(src.person_id)) {
      unmatchedByPerson.set(src.person_id, { name: nameByPersonId.get(src.person_id), email: skip.email, assignments: 0, waitlist: 0 });
    }
    unmatchedByPerson.get(src.person_id).waitlist += 1;
  }

  const reportLines = [
    '# ops-assets: unmatched holders (machine-local; never committed)',
    '',
    `Generated by scripts/import/ops-assets.mjs, ${new Date().toISOString()}.`,
    '',
    'An ops `people` row whose email has no matching asc-club `members` row: its assignments',
    'and/or waitlist entries stayed unimported. Resolve manually (confirm the real email, add',
    'the member by hand, or accept the gap) then re-run the import.',
    '',
  ];
  for (const [personId, entry] of unmatchedByPerson) {
    reportLines.push(`- ops person ${personId}: ${entry.name} <${entry.email}> -- ${entry.assignments} assignment(s), ${entry.waitlist} waitlist entr(y/ies)`);
  }
  if (unmatchedByPerson.size === 0) reportLines.push('(none this run)');
  writeFileSync(UNMATCHED_REPORT_PATH, reportLines.join('\n') + '\n');

  const noCurrentMembership = [...plan.assignmentSkips, ...plan.waitlistSkips].filter((s) => s.skipped === 'no-current-membership');

  console.log(`ops-assets: ${opsAssetTypes.length} asset type(s), ${opsAssignments.length} ops assignment(s), ${opsWaitlist.length} ops asset-waitlist row(s)`);
  console.log(
    `ops-assets: matched ${plan.assignmentRows.length} assignment(s) (${plan.paymentRows.length} with billed payment state), ` +
      `unmatched ${plan.assignmentSkips.filter((s) => s.skipped === 'unmatched').length} assignment(s) across ${unmatchedByPerson.size} holder(s)`,
  );
  if (noCurrentMembership.length > 0) {
    console.log(
      `ops-assets: WARNING ${noCurrentMembership.length} row(s) matched a member whose household has no current (most-recently-paid, ` +
        `non-stale) membership -- missing, or last paid ${STALE_MEMBERSHIP_DAYS}+ days ago (unexpected, skipped)`,
    );
  }
  console.log(`ops-assets: ${plan.waitlistRows.length} asset-waitlist row(s) to import, ${plan.waitlistSkips.length} skipped`);
  console.log(`ops-assets: unmatched-holders report written to ${UNMATCHED_REPORT_PATH}`);
  console.log(`ops-assets: recurring holder(s) skipped (redacted): ${[...unmatchedByPerson.values()].map((e) => redactEmail(e.email)).join(', ') || '(none)'}`);

  const batchId = `ops-assets-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  const existingAssetTypes = new Map(query(CLUB_DB_NAME, `SELECT * FROM asset_types`).map((r) => [String(r.id), r]));
  const existingAssignments = new Map(query(CLUB_DB_NAME, `SELECT * FROM asset_assignments`).map((r) => [String(r.id), r]));
  const existingPayments = new Map(query(CLUB_DB_NAME, `SELECT * FROM asset_payments`).map((r) => [String(r.id), r]));
  const existingWaitlist = new Map(query(CLUB_DB_NAME, `SELECT * FROM asset_waitlist`).map((r) => [String(r.id), r]));

  const statements = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of plan.assetTypeRows) {
    const existing = existingAssetTypes.get(row.id);
    /** @type {Record<string, unknown>} */
    const incoming = { name: row.name, fee: row.fee, capacity: row.capacity, sort_order: row.sortOrder };
    const diff = changedColumns(existing, incoming, ASSET_TYPE_COLUMNS);
    if (!existing) {
      statements.push(
        `INSERT INTO asset_types (id, name, fee, capacity, sort_order) VALUES (${sqlLiteral(row.id)}, ${sqlLiteral(row.name)}, ${row.fee}, ${sqlLiteral(row.capacity)}, ${row.sortOrder});`,
      );
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.insert', 'asset-type', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; source=asc-ops.asset_types.id=${row.id}`)});`,
      );
      inserted += 1;
    } else if (diff.length > 0) {
      const sets = diff.map((c) => `${c} = ${sqlLiteral(incoming[c])}`).join(', ');
      statements.push(`UPDATE asset_types SET ${sets} WHERE id = ${sqlLiteral(row.id)};`);
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.update', 'asset-type', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; changed=${diff.join(',')}`)});`,
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  for (const row of plan.assignmentRows) {
    const existing = existingAssignments.get(row.id);
    /** @type {Record<string, unknown>} */
    const incoming = { asset_type: row.assetType, membership_id: row.membershipId, description: row.description, status: row.status };
    const diff = changedColumns(existing, incoming, ASSIGNMENT_COLUMNS);
    if (!existing) {
      statements.push(
        `INSERT INTO asset_assignments (id, asset_type, membership_id, description, status, created_at) VALUES (${sqlLiteral(row.id)}, ${sqlLiteral(row.assetType)}, ${sqlLiteral(row.membershipId)}, ${sqlLiteral(row.description)}, ${sqlLiteral(row.status)}, ${sqlLiteral(row.createdAt)});`,
      );
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.insert', 'asset-assignment', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; source=asc-ops.assignments.id=${row.sourceId}`)});`,
      );
      inserted += 1;
    } else if (diff.length > 0) {
      const sets = diff.map((c) => `${c} = ${sqlLiteral(incoming[c])}`).join(', ');
      statements.push(`UPDATE asset_assignments SET ${sets} WHERE id = ${sqlLiteral(row.id)};`);
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.update', 'asset-assignment', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; changed=${diff.join(',')}`)});`,
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  for (const row of plan.paymentRows) {
    const existing = existingPayments.get(row.id);
    if (existing) {
      unchanged += 1;
      continue;
    }
    statements.push(
      `INSERT INTO asset_payments (id, assignment_id, season, amount, stripe_ref, paid_at) VALUES (${sqlLiteral(row.id)}, ${sqlLiteral(row.assignmentId)}, ${row.season}, ${row.amount}, ${sqlLiteral(row.stripeRef)}, ${sqlLiteral(row.paidAt)});`,
    );
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.insert', 'asset-payment', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; source=asc-ops.assignments (payment fields); amount inferred from current asset-type fee, not a per-billing snapshot; reconcile on accounting export`)});`,
    );
    inserted += 1;
  }

  for (const row of plan.waitlistRows) {
    const existing = existingWaitlist.get(row.id);
    /** @type {Record<string, unknown>} */
    const incoming = { asset_type: row.assetType, member_id: row.memberId, position: row.position, notes: row.notes };
    const diff = changedColumns(existing, incoming, WAITLIST_COLUMNS);
    if (!existing) {
      statements.push(
        `INSERT INTO asset_waitlist (id, asset_type, member_id, position, requested_at, notes) VALUES (${sqlLiteral(row.id)}, ${sqlLiteral(row.assetType)}, ${sqlLiteral(row.memberId)}, ${row.position}, ${sqlLiteral(row.requestedAt)}, ${sqlLiteral(row.notes)});`,
      );
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.insert', 'asset-waitlist', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; source=asc-ops.waitlist.id=${row.sourceId}`)});`,
      );
      inserted += 1;
    } else if (diff.length > 0) {
      const sets = diff.map((c) => `${c} = ${sqlLiteral(incoming[c])}`).join(', ');
      statements.push(`UPDATE asset_waitlist SET ${sets} WHERE id = ${sqlLiteral(row.id)};`);
      statements.push(
        `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.update', 'asset-waitlist', ${sqlLiteral(row.id)}, ${sqlLiteral(`import_batch=${batchId}; changed=${diff.join(',')}`)});`,
      );
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:ops', 'import.batch', 'asset', NULL, ` +
      `${sqlLiteral(
        `import_batch=${batchId}; inserted=${inserted}; updated=${updated}; unchanged=${unchanged}; ` +
          `assignments_matched=${plan.assignmentRows.length}; assignments_unmatched=${plan.assignmentSkips.filter((s) => s.skipped === 'unmatched').length}; ` +
          `waitlist_matched=${plan.waitlistRows.length}; waitlist_unmatched=${plan.waitlistSkips.filter((s) => s.skipped === 'unmatched').length}`,
      )});`,
  );

  console.log(`\nops-assets: batch ${batchId} -- ${inserted} to insert, ${updated} to update, ${unchanged} unchanged`);

  if (DRY_RUN) {
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  if (inserted === 0 && updated === 0) {
    console.log('\nops-assets: nothing to write (idempotent no-op run).');
    return;
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'ops-assets-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join('\n'));
  try {
    wrangler(['d1', 'execute', CLUB_DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`ops-assets: applied to ${CLUB_DB_NAME}`);
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
