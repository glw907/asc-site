#!/usr/bin/env node
/**
 * Import script: asc-club's own asset-assignment free text (already imported by
 * `ops-assets.mjs`) -> asc-club's `boats` table (migration `0027_directory_domain`, reshaped
 * to a single `model` column by `0028_boats_model`; `docs/plans/2026-07-17-member-directory.md`'s
 * T2). This reads `asc-club` ONLY; `asc-ops` has nothing to do with this seeder, its
 * assignments are already imported.
 *
 * BOATS ATTACH TO A MEMBER, NOT A HOUSEHOLD (the ratified roles-and-committees model,
 * migration 0027's own header comment): every active boat-related asset assignment
 * (`asset_type IN ('boat_parking','small_boat','mooring')`, `status = 'active'`) plans one
 * `boats` row on its household's OWNER. A solo household (exactly one non-archived member)
 * resolves on its own; a multi-member household is genuinely ambiguous from free text alone
 * and is HELD, never guessed -- Geoff resolves it through `boat-seed.resolutions.json` at
 * import review, the same shape `ops-assets.mjs`'s unmatched-holder report already uses for a
 * human-in-the-loop resolution.
 *
 * ACTIVE ONLY: a released assignment is a historical parking record, not current boat
 * ownership, so it is never seeded (counted and reported as excluded, never silently dropped).
 *
 * MODEL NORMALIZES, NEVER INVENTS: free text matching `/bucc/i` or `/laser/i` (including
 * casual "LASER II" -- the picker has no Laser II, so this normalizes to Laser and the
 * dry-run flags the raw text for Geoff to override if he wants) becomes the fixed picker
 * value (`'Buccaneer 18'` or `'Laser'`); everything else becomes the raw trimmed text stored
 * verbatim as `model` (migration `0028_boats_model`'s single required `model` column holds
 * either the picker value or the free-typed "Other" text). This is an honest "we do not
 * know", never a guess dressed as data.
 *
 * NAME NEVER BACKFILLS FROM FREE TEXT: every seeded boat's `name` is NULL, even where a name
 * is visible in the raw description (e.g. "Dionysus"). Name capture is required going
 * forward, not retroactively; the raw description survives in the audit `detail` so Geoff can
 * hand-add a name later.
 *
 * INSERT-IF-ABSENT ONLY, NEVER UPDATE: unlike `ops-assets.mjs`'s natural-key upsert, boats
 * will receive real member edits once T5 ships an edit surface, so a re-run of this seeder
 * must never clobber one. The `boat-<assignment id>` id is the idempotency key; a row that
 * id already covers is left untouched on every later run.
 *
 * RESOLUTIONS FILE (`boat-seed.resolutions.json`, committed, git-reviewable): `owners` maps an
 * ambiguous assignment id to the member id Geoff picked; `drop` lists an assignment id that is
 * not a real boat (or a duplicate) and should never seed; `model` overrides a parsed model
 * call with a plain string. Member ids are opaque UUIDs with no PII, so this file is safe to
 * commit. The dry-run reads it fresh every run, so the loop is: dry-run, Geoff fills the file
 * from the report, dry-run again, apply.
 *
 * Usage:
 *   node scripts/import/boat-seed.mjs --dry-run [--club-db-name NAME]
 *   node scripts/import/boat-seed.mjs [--club-db-name NAME]
 *
 * `--club-db-name` overrides the real write target; only ever used to scratch-prove this
 * script (including its rollback file) against a disposable database, never for a real run.
 * Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and
 * network access to `asc-club`; always `--remote`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const clubDbFlagIndex = process.argv.indexOf('--club-db-name');
const CLUB_DB_NAME = clubDbFlagIndex !== -1 ? process.argv[clubDbFlagIndex + 1] : 'asc-club';

const RESOLUTIONS_PATH = path.join(ROOT_DIR, 'scripts', 'import', 'boat-seed.resolutions.json');
const WORKSHEET_PATH = path.join(os.homedir(), '.local', 'asc-data', 'boat-seed-owner-worksheet.md');

const BOAT_ASSET_TYPES = ['boat_parking', 'small_boat', 'mooring'];

// ---------------------------------------------------------------------------
// Pure transforms (exported for the test suite; touch no filesystem or network).
// ---------------------------------------------------------------------------

/**
 * Normalizes one assignment's free-text description into a single `model` string (migration
 * `0028_boats_model`'s single required `model` column). Matching is case-insensitive and
 * deliberately loose: `/bucc/` catches every "BUCC"/"Buccaneer"/"Bucc 18" spelling seen in the
 * real data, `/laser/` catches "Laser" and casual "LASER II" alike (the picker has no Laser
 * II; this normalizes it to Laser and the dry-run flags the raw text for Geoff to override if
 * he wants). Anything else is the raw trimmed text, unchanged: the free-typed "Other" model.
 * @param {string | null | undefined} description
 * @returns {string | null} `null` signals a skip (empty/whitespace-only/missing description;
 *   audited as `skipped: 'empty-description'`).
 */
export function normalizeModel(description) {
  if (description == null) return null;
  const trimmed = description.trim();
  if (trimmed === '') return null;
  if (/bucc/i.test(trimmed)) return 'Buccaneer 18';
  if (/laser/i.test(trimmed)) return 'Laser';
  return trimmed;
}

/**
 * A mooring assignment keeps its boat on the water; every other boat-related asset type
 * (boat/trailer parking, a small-boat rack slot) keeps it on a trailer.
 * @param {string} assetType
 * @returns {'mooring' | 'trailer'}
 */
export function keptOnFor(assetType) {
  return assetType === 'mooring' ? 'mooring' : 'trailer';
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A SUGGESTION only, never auto-applied: if any household member's first name (the first
 * whitespace-delimited token of their `name`) appears as a whole-word, case-insensitive token
 * in the raw description, that member is offered as a hint (e.g. `'BUCC Gabe'` in a household
 * that includes `'Gabe Black'` suggests Gabe Black). Ambiguity is still resolved by Geoff, via
 * `boat-seed.resolutions.json`, never by this hint alone.
 * @param {string | null | undefined} description
 * @param {{ id: string, name: string }[]} householdMembers
 * @returns {{ id: string, name: string } | null}
 */
export function nameHintOwner(description, householdMembers) {
  if (!description) return null;
  for (const member of householdMembers) {
    const firstName = member.name.trim().split(/\s+/)[0];
    if (!firstName) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(firstName)}\\b`, 'i');
    if (pattern.test(description)) return member;
  }
  return null;
}

/**
 * @typedef {object} ResolvedOwner
 * @property {string} memberId
 * @property {'solo' | 'resolved'} basis
 */

/**
 * @typedef {object} AmbiguousOwner
 * @property {null} memberId
 * @property {'ambiguous'} basis
 * @property {{ id: string, name: string }[]} candidates
 * @property {{ id: string, name: string } | null} suggestion
 */

/**
 * Resolves one assignment's boat to its owning member, never guessing across a multi-member
 * household: a SOLO household (exactly one non-archived member) resolves on its own; an
 * AMBIGUOUS household resolves only through a prior `resolutions.owners` entry Geoff supplied
 * for this exact assignment id, and otherwise is held, reporting every candidate plus
 * {@link nameHintOwner}'s suggestion for Geoff to pick from.
 * @param {string} assignmentId
 * @param {string} householdId
 * @param {Map<string, { id: string, name: string }[]>} membersByHousehold householdId -> its
 *   non-archived members
 * @param {{ owners?: Record<string, string> }} resolutions
 * @param {string | null | undefined} description the raw assignment description, for the
 *   name-hint suggestion on an ambiguous row
 * @returns {ResolvedOwner | AmbiguousOwner}
 */
export function resolveOwner(assignmentId, householdId, membersByHousehold, resolutions, description) {
  const members = membersByHousehold.get(householdId) ?? [];
  if (members.length === 1) {
    return { memberId: members[0].id, basis: 'solo' };
  }
  const resolvedId = resolutions.owners?.[assignmentId];
  if (resolvedId && members.some((m) => m.id === resolvedId)) {
    return { memberId: resolvedId, basis: 'resolved' };
  }
  return {
    memberId: null,
    basis: 'ambiguous',
    candidates: members,
    suggestion: nameHintOwner(description, members),
  };
}

/**
 * @typedef {object} BoatAssignmentSrc
 * @property {string} id the asc-club `asset_assignments.id`, already `ops-assignment-<n>`
 * @property {string} asset_type
 * @property {string | null} description
 * @property {string} household_id
 */

/**
 * @typedef {object} BoatSeedRow
 * @property {string} id `boat-<assignmentId>`, the idempotency key
 * @property {string} member_id
 * @property {null} name always null; see the module header
 * @property {string} model
 * @property {null} sail_number
 * @property {'mooring' | 'trailer'} kept_on
 * @property {string} sourceAssignmentId
 * @property {string | null} rawDescription
 * @property {'solo' | 'resolved'} ownerBasis
 */

/**
 * @typedef {object} HeldRow
 * @property {string} sourceAssignmentId
 * @property {string | null} rawDescription
 * @property {string} assetType
 * @property {string} model
 * @property {string} householdId
 * @property {string | null} primaryMemberId
 * @property {{ id: string, name: string }[]} candidates
 * @property {{ id: string, name: string } | null} suggestion
 */

/**
 * @typedef {object} DroppedRow
 * @property {'dropped-by-review'} dropped
 * @property {string} sourceAssignmentId
 * @property {string | null} rawDescription
 */

/**
 * @typedef {object} SkippedRow
 * @property {'empty-description'} skipped
 * @property {string} sourceAssignmentId
 * @property {string | null} rawDescription
 */

/**
 * Plans the whole seed run against already-fetched, plain-object source and lookup data (no
 * database or filesystem access here, so this stays unit-testable against a small synthetic
 * fixture). Every active boat-related assignment lands in exactly one bucket: `skipped` (empty
 * description), `dropped` (Geoff judged it not a real boat, via `resolutions.drop`), `held`
 * (ambiguous owner, awaiting `resolutions.owners`), or `seed` (a resolvable `boats` row).
 * @param {BoatAssignmentSrc[]} assignments already filtered to active, boat-related rows
 * @param {{
 *   membersByHousehold: Map<string, { id: string, name: string }[]>,
 *   primaryByHousehold?: Map<string, string>,
 *   resolutions: { owners?: Record<string, string>, drop?: string[], model?: Record<string, string> },
 * }} context
 * @returns {{ seed: BoatSeedRow[], held: HeldRow[], dropped: DroppedRow[], skipped: SkippedRow[] }}
 */
export function planBoatSeed(assignments, { membersByHousehold, primaryByHousehold = new Map(), resolutions }) {
  /** @type {BoatSeedRow[]} */
  const seed = [];
  /** @type {HeldRow[]} */
  const held = [];
  /** @type {DroppedRow[]} */
  const dropped = [];
  /** @type {SkippedRow[]} */
  const skipped = [];

  for (const src of assignments) {
    const normalized = normalizeModel(src.description);
    if (!normalized) {
      skipped.push({ skipped: 'empty-description', sourceAssignmentId: src.id, rawDescription: src.description });
      continue;
    }

    if (resolutions.drop?.includes(src.id)) {
      dropped.push({ dropped: 'dropped-by-review', sourceAssignmentId: src.id, rawDescription: src.description });
      continue;
    }

    const modelValue = resolutions.model?.[src.id] ?? normalized;

    const owner = resolveOwner(src.id, src.household_id, membersByHousehold, resolutions, src.description);
    if (owner.basis === 'ambiguous') {
      held.push({
        sourceAssignmentId: src.id,
        rawDescription: src.description,
        assetType: src.asset_type,
        model: modelValue,
        householdId: src.household_id,
        primaryMemberId: primaryByHousehold.get(src.household_id) ?? null,
        candidates: owner.candidates,
        suggestion: owner.suggestion,
      });
      continue;
    }

    seed.push({
      id: `boat-${src.id}`,
      member_id: owner.memberId,
      name: null,
      model: modelValue,
      sail_number: null,
      kept_on: keptOnFor(src.asset_type),
      sourceAssignmentId: src.id,
      rawDescription: src.description,
      ownerBasis: owner.basis,
    });
  }

  return { seed, held, dropped, skipped };
}

// ---------------------------------------------------------------------------
// The wrangler-shelling CLI (guarded so importing this module for tests never runs it, the same
// dual-mode idiom `ops-assets.mjs` and `mw-members.mjs` document).
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

/** Reads the committed resolutions file fresh every run.
 * @returns {{ owners: Record<string, string>, drop: string[], model: Record<string, string> }} */
function readResolutions() {
  const raw = readFileSync(RESOLUTIONS_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Renders the machine-local review worksheet Geoff fills `resolutions.owners`/`drop`/`model`
 * from. Never committed (member names appear in it).
 * @param {{ seed: BoatSeedRow[], held: HeldRow[], dropped: DroppedRow[], skipped: SkippedRow[] }} plan
 * @param {Map<string, string>} memberNameById
 * @param {Map<string, string>} householdNameById
 * @param {number} releasedExcluded
 */
function renderWorksheet(plan, memberNameById, householdNameById, releasedExcluded) {
  const sourceActive = plan.seed.length + plan.held.length + plan.dropped.length + plan.skipped.length;
  const lines = [
    '# boat-seed: owner-resolution worksheet (machine-local; never committed)',
    '',
    `Generated by scripts/import/boat-seed.mjs, ${new Date().toISOString()}.`,
    '',
    `${sourceActive} active source row(s); ${plan.seed.length} to seed (solo + resolved); ` +
      `${plan.held.length} held for owner; ${plan.dropped.length} dropped; ${plan.skipped.length} skipped; ` +
      `${releasedExcluded} released (excluded, historical only).`,
    '',
    '## Seed rows',
    '',
  ];
  for (const row of plan.seed) {
    lines.push(
      `- ${row.sourceAssignmentId}: "${row.rawDescription ?? ''}" -> ${row.model}, ` +
        `kept_on=${row.kept_on}, owner=${memberNameById.get(row.member_id) ?? row.member_id} (${row.ownerBasis})`,
    );
  }
  if (plan.seed.length === 0) lines.push('(none)');

  lines.push('', '## typed models, verify', '');
  const knownModels = ['Buccaneer 18', 'Laser'];
  const typedRows = [...plan.seed, ...plan.held].filter((r) => !knownModels.includes(r.model));
  for (const row of typedRows) {
    const bucket = 'member_id' in row ? 'seeded' : 'held for owner';
    lines.push(`- ${row.sourceAssignmentId}: "${row.rawDescription ?? ''}" -> ${row.model} (${bucket})`);
  }
  if (typedRows.length === 0) lines.push('(none)');

  lines.push('', '## Held for owner', '');
  for (const row of plan.held) {
    const householdName = householdNameById.get(row.householdId) ?? row.householdId;
    const candidateList = row.candidates.map((c) => `${c.name} <${c.id}>`).join(', ');
    const suggestionLine = row.suggestion ? `suggest ${row.suggestion.name} <${row.suggestion.id}>` : 'no suggestion';
    lines.push(
      `- ${row.sourceAssignmentId}: "${row.rawDescription ?? ''}" -> ${row.model}, household "${householdName}"; ` +
        `candidates: ${candidateList}; ${suggestionLine}`,
    );
  }
  if (plan.held.length === 0) lines.push('(none)');

  lines.push('', '## Dropped', '');
  for (const row of plan.dropped) lines.push(`- ${row.sourceAssignmentId}: "${row.rawDescription ?? ''}"`);
  if (plan.dropped.length === 0) lines.push('(none)');

  lines.push('', '## Skipped (empty description)', '');
  for (const row of plan.skipped) lines.push(`- ${row.sourceAssignmentId}`);
  if (plan.skipped.length === 0) lines.push('(none)');

  return lines.join('\n') + '\n';
}

async function main() {
  const boatTypesIn = BOAT_ASSET_TYPES.map((t) => sqlLiteral(t)).join(', ');
  const opsAssignments = /** @type {BoatAssignmentSrc[]} */ (
    query(
      CLUB_DB_NAME,
      `SELECT aa.id, aa.asset_type, aa.description, ms.household_id FROM asset_assignments aa ` +
        `JOIN memberships ms ON ms.id = aa.membership_id ` +
        `WHERE aa.asset_type IN (${boatTypesIn}) AND aa.status = 'active' ORDER BY aa.id`,
    )
  );
  const releasedExcludedRow = query(
    CLUB_DB_NAME,
    `SELECT COUNT(*) AS n FROM asset_assignments WHERE asset_type IN (${boatTypesIn}) AND status = 'released'`,
  )[0];
  const releasedExcluded = Number(releasedExcludedRow.n);

  const households = query(CLUB_DB_NAME, `SELECT id, name, primary_member_id FROM households`);
  const members = query(CLUB_DB_NAME, `SELECT id, household_id, name, archived_at FROM members`);

  /** @type {Map<string, { id: string, name: string }[]>} */
  const membersByHousehold = new Map();
  for (const m of members) {
    if (m.archived_at) continue;
    const list = membersByHousehold.get(String(m.household_id)) ?? [];
    list.push({ id: String(m.id), name: String(m.name) });
    membersByHousehold.set(String(m.household_id), list);
  }
  /** @type {Map<string, string>} */
  const primaryByHousehold = new Map(households.filter((h) => h.primary_member_id).map((h) => [String(h.id), String(h.primary_member_id)]));
  /** @type {Map<string, string>} */
  const memberNameById = new Map(members.map((m) => [String(m.id), String(m.name)]));
  /** @type {Map<string, string>} */
  const householdNameById = new Map(households.map((h) => [String(h.id), String(h.name)]));

  const resolutions = readResolutions();

  const plan = planBoatSeed(opsAssignments, { membersByHousehold, primaryByHousehold, resolutions });
  const sourceActive = opsAssignments.length;

  console.log(`boat-seed: ${sourceActive} active source row(s), ${releasedExcluded} released (excluded)`);
  console.log(
    `boat-seed: ${plan.seed.length} to seed, ${plan.held.length} held for owner, ` +
      `${plan.dropped.length} dropped, ${plan.skipped.length} skipped`,
  );
  /** @type {Record<string, number>} */
  const modelCounts = {};
  for (const row of plan.seed) modelCounts[row.model] = (modelCounts[row.model] ?? 0) + 1;
  console.log(`boat-seed: seed model split ${JSON.stringify(modelCounts)}`);

  if (DRY_RUN) {
    mkdirSync(path.dirname(WORKSHEET_PATH), { recursive: true });
    const worksheet = renderWorksheet(plan, memberNameById, householdNameById, releasedExcluded);
    writeFileSync(WORKSHEET_PATH, worksheet);
    console.log(`boat-seed: owner-resolution worksheet written to ${WORKSHEET_PATH}`);
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  const existingBoats = new Map(query(CLUB_DB_NAME, `SELECT id FROM boats`).map((r) => [String(r.id), r]));

  const statements = [];
  let inserted = 0;
  let alreadyPresent = 0;
  const batchId = `boat-seed-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  for (const row of plan.seed) {
    if (existingBoats.has(row.id)) {
      alreadyPresent += 1;
      continue;
    }
    statements.push(
      `INSERT INTO boats (id, member_id, name, model, sail_number, kept_on) VALUES ` +
        `(${sqlLiteral(row.id)}, ${sqlLiteral(row.member_id)}, ${sqlLiteral(row.name)}, ${sqlLiteral(row.model)}, ${sqlLiteral(row.sail_number)}, ${sqlLiteral(row.kept_on)});`,
    );
    const detail = JSON.stringify({
      batchId,
      sourceAssignmentId: row.sourceAssignmentId,
      rawDescription: row.rawDescription,
      ownerBasis: row.ownerBasis,
      model: row.model,
      keptOn: row.kept_on,
    });
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:boat-seed', 'import.insert', 'boat', ${sqlLiteral(row.id)}, ${sqlLiteral(detail)});`,
    );
    inserted += 1;
  }

  const batchDetail = JSON.stringify({
    inserted,
    held: plan.held.length,
    dropped: plan.dropped.length,
    skipped: plan.skipped.length,
    releasedExcluded,
    sourceActive,
  });
  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:boat-seed', 'import.batch', 'boat', NULL, ${sqlLiteral(batchDetail)});`,
  );

  console.log(`\nboat-seed: batch ${batchId} -- ${inserted} to insert, ${alreadyPresent} already present (no-op)`);

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'boat-seed-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join('\n'));
  try {
    wrangler(['d1', 'execute', CLUB_DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`boat-seed: applied to ${CLUB_DB_NAME}`);
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
