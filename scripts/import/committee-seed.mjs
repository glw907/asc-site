#!/usr/bin/env node
/**
 * Import script: the published `/committees` At-a-Glance table -> asc-club's
 * `committees`/`committee_members`/`member_positions` tables (migration `0027_directory_domain`;
 * `docs/plans/2026-07-17-member-directory.md`'s T2b, executing
 * `docs/2026-07-17-roles-committees-design.md`'s decision 8: "the first seed is the published
 * committees page").
 *
 * TWO KINDS OF SEED DATA, both hardcoded below (no external source file, unlike the MW-driven
 * seeders): the seven committees (`SEED_COMMITTEES`, name/kind/sort_order/description drawn from
 * the committees page's own summary paragraphs, the "(chaired by ...)" parenthetical and every
 * chair name trimmed out -- a description describes the committee, not its people), the four
 * officers (`SEED_OFFICERS`, kind `'officer'`), and the chairs/co-chair (`SEED_CHAIRS`,
 * `committee_members` rows, `status = 'active'`). ALL FOUR OFFICERS HOLD BOARD SEATS BY
 * CONSTRUCTION (kind `'officer'` already satisfies "is a board member"); this script never seeds
 * a plain `'director'` row on its own. `committee-seed.resolutions.json`'s `directors` array is
 * where Geoff supplies any current director without an office, at import review -- see the
 * README for the exact shape.
 *
 * NAME NOTE: the roles spec's own decision 8 spells the fourth established committee "Membership
 * & Events" where the published page still calls it "Membership Committee". Geoff CONFIRMED
 * "Membership & Events" at the 2026-07-18 import review; `MEMBERSHIP_EVENTS_NAME` stays the one
 * place the name lives (the published page's hand table catches up when T6b's live directive
 * replaces it).
 *
 * NAME MATCHING IS EXACT AND CASE-INSENSITIVE, NEVER GUESSED: {@link matchMemberByName} compares
 * against the (non-archived) `members.name` column only. A name matching nobody, or matching more
 * than one member, lands in the audit as a miss or an ambiguity. Nothing here invents a match.
 * Where the published page uses a nickname, the seed carries the member's STORED name instead
 * ("David Johnson" for the page's "Dave Johnson", "Matthew Flickinger" for "Matt Flickinger") --
 * the seed name is a lookup key, not display text. The one word-reversed member row ("Stanbro
 * TL") was fixed live to "TL Stanbro" (audit actor 'admin:member-name-fix', 2026-07-18).
 *
 * CHAIR TITLES ARE NEVER STORED: `committee_members.role` (`'chair'`/`'co-chair'`/`'member'`) is
 * all this script writes; "Site Committee Chair" derives at render (T3), per the roles spec's
 * decision 2. This script never writes a `title` column on a committee_members row (there is
 * none).
 *
 * SKIP-IF-EXISTS, CONVERGENT: a `committees` row skips by `slug` (its own natural key), a
 * `committee_members` row skips by the (committee_id, member_id) pair (the table's own UNIQUE
 * constraint), and a `member_positions` row skips by the (member_id, title) pair. A re-run with
 * no new resolutions converges to a no-op.
 *
 * Usage:
 *   node scripts/import/committee-seed.mjs --dry-run [--club-db-name NAME]
 *   node scripts/import/committee-seed.mjs [--club-db-name NAME]
 *
 * `--club-db-name` overrides the real write target; only ever used to scratch-prove this script
 * (including its rollback file) against a disposable database, never for a real run. Needs
 * `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
 * access to `asc-club`; always `--remote`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const clubDbFlagIndex = process.argv.indexOf('--club-db-name');
const CLUB_DB_NAME = clubDbFlagIndex !== -1 ? process.argv[clubDbFlagIndex + 1] : 'asc-club';

const RESOLUTIONS_PATH = path.join(ROOT_DIR, 'scripts', 'import', 'committee-seed.resolutions.json');
const WORKSHEET_PATH = path.join(os.homedir(), '.local', 'asc-data', 'committee-seed-worksheet.md');

/** The seed name for the fourth established committee, confirmed by Geoff 2026-07-18 (see the
 * header note). The single place this string lives, so a rename is a one-line edit. */
export const MEMBERSHIP_EVENTS_NAME = 'Membership & Events';

// ---------------------------------------------------------------------------
// Seed data, drawn from src/content/pages/committees.md (the published At-a-Glance table and
// each committee's own summary paragraph, chair names and "(chaired by ...)" parentheticals
// trimmed out -- a description describes the committee, not its current people).
// ---------------------------------------------------------------------------

/** A minimal, dependency-free slug: lowercase, non-alphanumeric runs collapse to one hyphen,
 * leading/trailing hyphens trimmed (the same idiom `src/theme/markdown/components.ts`'s
 * `slugifyForId` uses for a heading id).
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @typedef {object} CommitteeSeed
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {'standing'|'established'} kind
 * @property {number} sort_order
 */

/** @type {Omit<CommitteeSeed, 'slug'>[]} */
const RAW_SEED_COMMITTEES = [
  {
    name: 'Finance Committee',
    kind: 'standing',
    sort_order: 1,
    description:
      'Oversees the financial health of the corporation. Chaired by the Treasurer per bylaws, ' +
      'with at least two additional members including at least one with accounting expertise. ' +
      'Reports on financial condition at each regular board meeting and periodically assesses ' +
      'internal controls.',
  },
  {
    name: 'Board Development Committee',
    kind: 'standing',
    sort_order: 2,
    description:
      'Ensures the health and effectiveness of the board. Consults the board on organizational ' +
      'needs and skills gaps, then independently determines and recommends a candidate slate ' +
      'for director elections. Also oversees board training and periodically reviews the ' +
      "bylaws. The BDC's independence in assembling the candidate slate follows 501(c)(3) best " +
      'practice.',
  },
  {
    name: 'Program Committee',
    kind: 'established',
    sort_order: 3,
    description:
      'Plans and instructs sailing courses, coordinates public sailing events, and manages ' +
      'racing. This includes setting the race schedule, issuing sailing instructions, scoring ' +
      'races, and managing race awards.',
  },
  {
    name: MEMBERSHIP_EVENTS_NAME,
    kind: 'established',
    sort_order: 4,
    description:
      'Reviews membership applications, maintains member information, and assists with new ' +
      'member orientation. Also coordinates social programs including regatta potlucks, Summer ' +
      'Sailstice, the annual membership meeting, and other club gatherings.',
  },
  {
    name: 'Site Committee',
    kind: 'established',
    sort_order: 5,
    description:
      'Creates and executes property development plans, oversees maintenance of club grounds ' +
      'and facilities, and coordinates work parties.',
  },
  {
    name: 'Harbor Committee',
    kind: 'established',
    sort_order: 6,
    description:
      'Maintains and improves docks and moorings. Builds and installs dock sections each ' +
      'spring, removes them each fall, and keeps the hoist operational.',
  },
  {
    name: 'Fleet Committee',
    kind: 'established',
    sort_order: 7,
    description: 'Maintains the club fleet, manages boat maintenance schedules, and oversees the qualification process.',
  },
];

/** @type {CommitteeSeed[]} */
export const SEED_COMMITTEES = RAW_SEED_COMMITTEES.map((c) => ({ ...c, slug: slugify(c.name) }));

/**
 * @typedef {object} OfficerSeed
 * @property {string} name
 * @property {string} title
 * @property {number} sort_order
 */

/** @type {OfficerSeed[]} */
export const SEED_OFFICERS = [
  { name: 'Nancy Black', title: 'Commodore', sort_order: 1 },
  { name: 'David Johnson', title: 'Vice Commodore', sort_order: 2 },
  { name: 'Angie Oberlitner', title: 'Secretary', sort_order: 3 },
  { name: 'Matthew Flickinger', title: 'Treasurer', sort_order: 4 },
];

/**
 * @typedef {object} ChairSeed
 * @property {string} committeeName
 * @property {string} memberName
 * @property {'chair'|'co-chair'} role
 */

/** @type {ChairSeed[]} */
export const SEED_CHAIRS = [
  { committeeName: 'Finance Committee', memberName: 'Matthew Flickinger', role: 'chair' },
  { committeeName: 'Board Development Committee', memberName: 'Geoff Wright', role: 'chair' },
  { committeeName: 'Program Committee', memberName: 'Christopher Cryan', role: 'chair' },
  { committeeName: MEMBERSHIP_EVENTS_NAME, memberName: 'Jonathan Ramirez', role: 'chair' },
  { committeeName: MEMBERSHIP_EVENTS_NAME, memberName: 'Emily Ramirez', role: 'co-chair' },
  { committeeName: 'Site Committee', memberName: 'Geoff Wright', role: 'chair' },
  { committeeName: 'Harbor Committee', memberName: 'TL Stanbro', role: 'chair' },
  { committeeName: 'Fleet Committee', memberName: 'Steve Ryan', role: 'chair' },
];

// ---------------------------------------------------------------------------
// Pure transforms (exported for the test suite; touch no filesystem or network).
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MemberRow
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {{ status: 'matched', member: MemberRow }
 *   | { status: 'missed' }
 *   | { status: 'ambiguous', candidates: MemberRow[] }} MatchResult
 */

/**
 * Exact, case-insensitive match of a person's name against the `members` table's own `name`
 * column. Never guesses: a name matching nobody is a `'missed'` result, a name matching more
 * than one member is an `'ambiguous'` result carrying every candidate, and only a single exact
 * match is `'matched'`.
 * @param {string} name
 * @param {MemberRow[]} members
 * @returns {MatchResult}
 */
export function matchMemberByName(name, members) {
  const needle = name.trim().toLowerCase();
  const candidates = members.filter((m) => m.name.trim().toLowerCase() === needle);
  if (candidates.length === 0) return { status: 'missed' };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'matched', member: candidates[0] };
}

/**
 * Plans the committee-row seed: every `SEED_COMMITTEES` entry whose `slug` is not already in
 * `existingSlugs` inserts; everything else skips (already present, converging to a no-op).
 * @param {CommitteeSeed[]} seedCommittees
 * @param {Set<string>} existingSlugs
 * @returns {{ insert: CommitteeSeed[], skip: CommitteeSeed[] }}
 */
export function planCommitteeInserts(seedCommittees, existingSlugs) {
  /** @type {CommitteeSeed[]} */
  const insert = [];
  /** @type {CommitteeSeed[]} */
  const skip = [];
  for (const committee of seedCommittees) {
    (existingSlugs.has(committee.slug) ? skip : insert).push(committee);
  }
  return { insert, skip };
}

/**
 * @typedef {object} PositionEntry
 * @property {string} name
 * @property {string} title
 * @property {'officer'|'director'} kind
 * @property {number} sort_order
 */

/**
 * @typedef {object} PositionSeedRow
 * @property {string} member_id
 * @property {string} memberName
 * @property {'officer'|'director'} kind
 * @property {string} title
 * @property {number} sort_order
 */

/**
 * @typedef {object} PositionMiss
 * @property {string} memberName
 * @property {string} title
 * @property {'missed'|'ambiguous'} reason
 * @property {MemberRow[]} [candidates]
 */

/**
 * Plans `member_positions` rows: matches each entry's name against `members`, holding a miss or
 * an ambiguity for the audit, then skips a resolved (member_id, title) pair already present in
 * `existingPairs` (never inserting it twice).
 * @param {PositionEntry[]} entries
 * @param {MemberRow[]} members
 * @param {Set<string>} existingPairs `<memberId>|<title>` strings already in `member_positions`
 * @returns {{ insert: PositionSeedRow[], skip: PositionSeedRow[], miss: PositionMiss[] }}
 */
export function planPositionSeed(entries, members, existingPairs) {
  /** @type {PositionSeedRow[]} */
  const insert = [];
  /** @type {PositionSeedRow[]} */
  const skip = [];
  /** @type {PositionMiss[]} */
  const miss = [];

  for (const entry of entries) {
    const result = matchMemberByName(entry.name, members);
    if (result.status !== 'matched') {
      miss.push({
        memberName: entry.name,
        title: entry.title,
        reason: result.status,
        candidates: result.status === 'ambiguous' ? result.candidates : undefined,
      });
      continue;
    }
    /** @type {PositionSeedRow} */
    const row = {
      member_id: result.member.id,
      memberName: entry.name,
      kind: entry.kind,
      title: entry.title,
      sort_order: entry.sort_order,
    };
    (existingPairs.has(`${row.member_id}|${row.title}`) ? skip : insert).push(row);
  }

  return { insert, skip, miss };
}

/**
 * @typedef {object} CommitteeMemberSeedRow
 * @property {string} committee_id
 * @property {string} committeeName
 * @property {string} member_id
 * @property {string} memberName
 * @property {'chair'|'co-chair'} role
 */

/**
 * @typedef {object} CommitteeMemberMiss
 * @property {string} memberName
 * @property {string} committeeName
 * @property {'missed'|'ambiguous'|'missing-committee'} reason
 * @property {MemberRow[]} [candidates]
 */

/**
 * Plans `committee_members` rows: matches each chair entry's name against `members`, resolves
 * its committee id from `committeeIdByName` (a miss here means the committee itself failed to
 * seed or resolve, reported as `'missing-committee'`), then skips a (committee_id, member_id)
 * pair already present in `existingPairs` (the table's own UNIQUE constraint).
 * @param {ChairSeed[]} entries
 * @param {MemberRow[]} members
 * @param {Map<string, string>} committeeIdByName
 * @param {Set<string>} existingPairs `<committeeId>|<memberId>` strings already present
 * @returns {{ insert: CommitteeMemberSeedRow[], skip: CommitteeMemberSeedRow[], miss: CommitteeMemberMiss[] }}
 */
export function planCommitteeMemberSeed(entries, members, committeeIdByName, existingPairs) {
  /** @type {CommitteeMemberSeedRow[]} */
  const insert = [];
  /** @type {CommitteeMemberSeedRow[]} */
  const skip = [];
  /** @type {CommitteeMemberMiss[]} */
  const miss = [];

  for (const entry of entries) {
    const result = matchMemberByName(entry.memberName, members);
    if (result.status !== 'matched') {
      miss.push({
        memberName: entry.memberName,
        committeeName: entry.committeeName,
        reason: result.status,
        candidates: result.status === 'ambiguous' ? result.candidates : undefined,
      });
      continue;
    }
    const committeeId = committeeIdByName.get(entry.committeeName);
    if (!committeeId) {
      miss.push({ memberName: entry.memberName, committeeName: entry.committeeName, reason: 'missing-committee' });
      continue;
    }
    /** @type {CommitteeMemberSeedRow} */
    const row = {
      committee_id: committeeId,
      committeeName: entry.committeeName,
      member_id: result.member.id,
      memberName: entry.memberName,
      role: entry.role,
    };
    (existingPairs.has(`${row.committee_id}|${row.member_id}`) ? skip : insert).push(row);
  }

  return { insert, skip, miss };
}

/**
 * Turns `committee-seed.resolutions.json`'s plain `directors` name list into `member_positions`
 * entries (`kind: 'director'`, `title: 'Director'`). Sort order continues after the four
 * officers (1-4), starting at 5 in file order -- ballot order among directors is Geoff's call,
 * this only avoids colliding with the officer rows.
 * @param {{ directors?: string[] }} resolutions
 * @returns {PositionEntry[]}
 */
export function directorEntriesFromResolutions(resolutions) {
  const names = resolutions.directors ?? [];
  return names.map((name, index) => ({ name, title: 'Director', kind: 'director', sort_order: 5 + index }));
}

// ---------------------------------------------------------------------------
// The wrangler-shelling CLI (guarded so importing this module for tests never runs it, the same
// dual-mode idiom `boat-seed.mjs` and `household-address-seed.mjs` document).
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

/** Reads the committed resolutions file, tolerating a missing file (defaults to no directors).
 * @returns {{ directors: string[] }} */
function readResolutions() {
  try {
    return JSON.parse(readFileSync(RESOLUTIONS_PATH, 'utf8'));
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { directors: [] };
    throw err;
  }
}

/**
 * Renders the machine-local review worksheet (never committed; carries member names). Lists
 * every committee/officer/chair decision (insert, skip, or a miss/ambiguity for a human to
 * resolve) plus the director-supply prompt.
 * @param {{ insert: CommitteeSeed[], skip: CommitteeSeed[] }} committeePlan
 * @param {{ insert: PositionSeedRow[], skip: PositionSeedRow[], miss: PositionMiss[] }} positionPlan
 * @param {{ insert: CommitteeMemberSeedRow[], skip: CommitteeMemberSeedRow[], miss: CommitteeMemberMiss[] }} chairPlan
 * @param {string[]} directorNames the resolutions file's current `directors` list
 */
function renderWorksheet(committeePlan, positionPlan, chairPlan, directorNames) {
  const lines = [
    '# committee-seed: worksheet (machine-local; never committed)',
    '',
    `Generated by scripts/import/committee-seed.mjs, ${new Date().toISOString()}.`,
    '',
    `NAME NOTE: the fourth established committee seeds as "${MEMBERSHIP_EVENTS_NAME}" (the roles ` +
      "spec's decision 8, confirmed by Geoff 2026-07-18); the published /committees page's hand " +
      'table catches up when the T6b live directive replaces it.',
    '',
    '## Committees', '',
  ];
  for (const c of committeePlan.insert) lines.push(`- INSERT ${c.name} (${c.slug}, ${c.kind}, sort ${c.sort_order})`);
  for (const c of committeePlan.skip) lines.push(`- skip (already present) ${c.name} (${c.slug})`);
  if (committeePlan.insert.length === 0 && committeePlan.skip.length === 0) lines.push('(none)');

  lines.push('', '## Officers and directors (member_positions)', '');
  for (const r of positionPlan.insert) lines.push(`- INSERT ${r.memberName} -> ${r.title} (${r.kind}, sort ${r.sort_order})`);
  for (const r of positionPlan.skip) lines.push(`- skip (already present) ${r.memberName} -> ${r.title}`);
  for (const m of positionPlan.miss) {
    const candidateList = m.candidates ? ` candidates: ${m.candidates.map((c) => `${c.name} <${c.id}>`).join(', ')}` : '';
    lines.push(`- ${m.reason.toUpperCase()}: "${m.memberName}" -> ${m.title}.${candidateList}`);
  }
  if (directorNames.length === 0) {
    lines.push('', '(No director rows in the resolutions file. Geoff: add plain-director names, without an office, ' +
      'to committee-seed.resolutions.json\'s "directors" array, then re-run --dry-run to confirm.)');
  }

  lines.push('', '## Chairs and co-chairs (committee_members)', '');
  for (const r of chairPlan.insert) lines.push(`- INSERT ${r.memberName} -> ${r.committeeName} (${r.role})`);
  for (const r of chairPlan.skip) lines.push(`- skip (already present) ${r.memberName} -> ${r.committeeName} (${r.role})`);
  for (const m of chairPlan.miss) {
    const candidateList = m.candidates ? ` candidates: ${m.candidates.map((c) => `${c.name} <${c.id}>`).join(', ')}` : '';
    lines.push(`- ${m.reason.toUpperCase()}: "${m.memberName}" -> ${m.committeeName}.${candidateList}`);
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const memberRows = query(CLUB_DB_NAME, `SELECT id, name FROM members WHERE archived_at IS NULL`);
  /** @type {MemberRow[]} */
  const members = memberRows.map((m) => ({ id: String(m.id), name: String(m.name) }));

  const existingCommittees = query(CLUB_DB_NAME, `SELECT id, slug FROM committees`);
  const existingSlugs = new Set(existingCommittees.map((c) => String(c.slug)));

  const resolutions = readResolutions();

  const committeePlan = planCommitteeInserts(SEED_COMMITTEES, existingSlugs);
  /** @type {(CommitteeSeed & { id: string })[]} */
  const committeeInserts = committeePlan.insert.map((c) => ({ ...c, id: randomUUID() }));

  /** @type {Map<string, string>} committee name -> id, covering both already-present and newly planned rows */
  const committeeIdByName = new Map();
  const slugToName = new Map(SEED_COMMITTEES.map((c) => [c.slug, c.name]));
  for (const row of existingCommittees) {
    const name = slugToName.get(String(row.slug));
    if (name) committeeIdByName.set(name, String(row.id));
  }
  for (const c of committeeInserts) committeeIdByName.set(c.name, c.id);

  const existingPositionPairs = new Set(
    query(CLUB_DB_NAME, `SELECT member_id, title FROM member_positions`).map((r) => `${r.member_id}|${r.title}`),
  );
  const officerEntries = SEED_OFFICERS.map((o) => ({ name: o.name, title: o.title, kind: /** @type {const} */ ('officer'), sort_order: o.sort_order }));
  const directorEntries = directorEntriesFromResolutions(resolutions);
  const positionPlan = planPositionSeed([...officerEntries, ...directorEntries], members, existingPositionPairs);

  const existingCommitteeMemberPairs = new Set(
    query(CLUB_DB_NAME, `SELECT committee_id, member_id FROM committee_members`).map((r) => `${r.committee_id}|${r.member_id}`),
  );
  const chairPlan = planCommitteeMemberSeed(SEED_CHAIRS, members, committeeIdByName, existingCommitteeMemberPairs);

  console.log(
    `committee-seed: committees ${committeePlan.insert.length} to insert, ${committeePlan.skip.length} already present`,
  );
  console.log(
    `committee-seed: NOTE - seeding the fourth established committee as "${MEMBERSHIP_EVENTS_NAME}" ` +
      '(confirmed 2026-07-18; the published page\'s hand table says "Membership Committee" until ' +
      "T6b's live directive replaces it).",
  );
  console.log(
    `committee-seed: officers+directors ${positionPlan.insert.length} to insert, ${positionPlan.skip.length} ` +
      `already present, ${positionPlan.miss.length} missed/ambiguous (${directorEntries.length} director row(s) ` +
      'from the resolutions file)',
  );
  console.log(
    `committee-seed: chairs/co-chairs ${chairPlan.insert.length} to insert, ${chairPlan.skip.length} already ` +
      `present, ${chairPlan.miss.length} missed/ambiguous`,
  );
  if (positionPlan.miss.length > 0 || chairPlan.miss.length > 0) {
    console.log('committee-seed: misses/ambiguities (never guessed):');
    for (const m of positionPlan.miss) console.log(`  - position ${m.reason}: "${m.memberName}" -> ${m.title}`);
    for (const m of chairPlan.miss) console.log(`  - chair ${m.reason}: "${m.memberName}" -> ${m.committeeName}`);
  }

  if (DRY_RUN) {
    mkdirSync(path.dirname(WORKSHEET_PATH), { recursive: true });
    writeFileSync(WORKSHEET_PATH, renderWorksheet(committeePlan, positionPlan, chairPlan, resolutions.directors ?? []));
    console.log(`committee-seed: worksheet written to ${WORKSHEET_PATH}`);
    console.log('\n--dry-run: no statements executed.');
    return;
  }

  const batchId = `committee-seed-${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const statements = [];

  for (const c of committeeInserts) {
    statements.push(
      `INSERT INTO committees (id, slug, name, description, kind, sort_order) VALUES ` +
        `(${sqlLiteral(c.id)}, ${sqlLiteral(c.slug)}, ${sqlLiteral(c.name)}, ${sqlLiteral(c.description)}, ${sqlLiteral(c.kind)}, ${sqlLiteral(c.sort_order)});`,
    );
    const detail = JSON.stringify({ batchId, slug: c.slug, name: c.name, kind: c.kind, sortOrder: c.sort_order });
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:committee-seed', 'import.insert', 'committee', ${sqlLiteral(c.id)}, ${sqlLiteral(detail)});`,
    );
  }

  for (const r of positionPlan.insert) {
    const id = randomUUID();
    statements.push(
      `INSERT INTO member_positions (id, member_id, kind, title, sort_order) VALUES ` +
        `(${sqlLiteral(id)}, ${sqlLiteral(r.member_id)}, ${sqlLiteral(r.kind)}, ${sqlLiteral(r.title)}, ${sqlLiteral(r.sort_order)});`,
    );
    const detail = JSON.stringify({
      batchId,
      memberId: r.member_id,
      memberName: r.memberName,
      kind: r.kind,
      title: r.title,
      sortOrder: r.sort_order,
    });
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:committee-seed', 'import.insert', 'member_position', ${sqlLiteral(id)}, ${sqlLiteral(detail)});`,
    );
  }

  for (const r of chairPlan.insert) {
    const id = randomUUID();
    statements.push(
      `INSERT INTO committee_members (id, committee_id, member_id, role, status) VALUES ` +
        `(${sqlLiteral(id)}, ${sqlLiteral(r.committee_id)}, ${sqlLiteral(r.member_id)}, ${sqlLiteral(r.role)}, 'active');`,
    );
    const detail = JSON.stringify({
      batchId,
      committeeId: r.committee_id,
      committeeName: r.committeeName,
      memberId: r.member_id,
      memberName: r.memberName,
      role: r.role,
    });
    statements.push(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:committee-seed', 'import.insert', 'committee_member', ${sqlLiteral(id)}, ${sqlLiteral(detail)});`,
    );
  }

  const batchDetail = JSON.stringify({
    committeesInserted: committeePlan.insert.length,
    committeesSkipped: committeePlan.skip.length,
    positionsInserted: positionPlan.insert.length,
    positionsSkipped: positionPlan.skip.length,
    positionsMissed: positionPlan.miss.length,
    committeeMembersInserted: chairPlan.insert.length,
    committeeMembersSkipped: chairPlan.skip.length,
    committeeMembersMissed: chairPlan.miss.length,
  });
  statements.push(
    `INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES ('import:committee-seed', 'import.batch', 'committee-seed', NULL, ${sqlLiteral(batchDetail)});`,
  );

  console.log(
    `\ncommittee-seed: batch ${batchId} -- ${committeeInserts.length} committee(s), ` +
      `${positionPlan.insert.length} position(s), ${chairPlan.insert.length} committee-member row(s) to insert`,
  );

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'committee-seed-'));
  const tmpFile = path.join(tmpDir, 'import.sql');
  writeFileSync(tmpFile, statements.join('\n'));
  try {
    wrangler(['d1', 'execute', CLUB_DB_NAME, '--remote', '--file', tmpFile]);
    console.log(`committee-seed: applied to ${CLUB_DB_NAME}`);
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
