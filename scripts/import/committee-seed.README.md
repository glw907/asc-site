# committee-seed: seed committees and people from the published /committees page

## What this does

Seeds asc-club's `committees`, `committee_members`, and `member_positions` tables (migration
`0027_directory_domain`) from the seven committees and the officers/chairs published on the
`/committees` At-a-Glance table (`docs/plans/2026-07-17-member-directory.md`'s T2b, executing
`docs/2026-07-17-roles-committees-design.md`'s decision 8). There is no external source file:
`SEED_COMMITTEES`, `SEED_OFFICERS`, and `SEED_CHAIRS` in `committee-seed.mjs` carry the seed data
directly, drawn from `src/content/pages/committees.md`.

**Officers hold board seats by construction.** All four officer positions (`kind: 'officer'`)
already satisfy "is a board member" per the roles spec's own authorization rule
(`kind IN ('officer','director')`), so this script never seeds a plain `'director'` row on its
own initiative. A current director who holds no office is Geoff's call, supplied through the
resolutions file (below) at import review.

**Chair titles are never stored.** `committee_members.role` (`'chair'` / `'co-chair'` /
`'member'`) is all this script writes; a title like "Site Committee Chair" derives at render
(T3, per the roles spec's decision 2). There is no `title` column on `committee_members`.

## Committee names, kinds, and descriptions

The seven committees seed in the published At-a-Glance order, `sort_order` 1-7:

| Name | Kind | Sort |
|---|---|---|
| Finance Committee | standing | 1 |
| Board Development Committee | standing | 2 |
| Program Committee | established | 3 |
| Membership & Events | established | 4 |
| Site Committee | established | 5 |
| Harbor Committee | established | 6 |
| Fleet Committee | established | 7 |

Each `description` is drawn from that committee's own summary paragraph on the committees page,
with the "(chaired by ...)" parenthetical and any specific chair name trimmed out (a description
describes the committee, not its current people). A structural sentence naming an *office*
rather than a person (Finance's "Chaired by the Treasurer per bylaws...") stays, since it
describes the committee's bylaws-defined structure, not who currently holds the seat.

**NAME**: the roles spec's decision 8 spells the fourth established committee "Membership &
Events", and Geoff confirmed that name at the 2026-07-18 import review; the published page's
hand table says "Membership Committee" until T6b's live directive replaces it.
`MEMBERSHIP_EVENTS_NAME` in `committee-seed.mjs` is the one place this name lives.
Slugs derive from each committee's `name` via a plain kebab-case `slugify` (lowercase,
non-alphanumeric runs collapse to one hyphen); a name change here changes the slug too.

## Name matching

Every person name (an officer, a chair, a resolutions-file director) matches against `members`
(non-archived rows only) **exactly, case-insensitively, on the `name` column, and never
guessed**: a name matching nobody is a miss, a name matching more than one member is an
ambiguity carrying every candidate. Both land in the audit and the dry-run worksheet; neither is
silently resolved.

The dry-run against the real `asc-club` data (2026-07-18) found three genuine misses this way,
none of them bugs:

- `Dave Johnson` -> no exact match (`David Johnson` exists; a nickname, not a match)
- `Matt Flickinger` -> no exact match (`Matthew Flickinger` exists; a nickname, not a match)
- `TL Stanbro` -> no exact match (`Stanbro TL` exists; the words are in the other order)

These were correct audit misses, not something this script should paper over. Resolved at the
2026-07-18 import review: the two nicknames became stored-name lookup keys in the seed data
(`David Johnson`, `Matthew Flickinger` -- the seed name is a lookup key, not display text), and
the word-reversed `Stanbro TL` member row was corrected live to `TL Stanbro` (audit actor
`admin:member-name-fix`), so the published-page spelling matches.

## Idempotent, convergent

Every row skips-if-already-present, so a re-run with no new resolutions is a no-op:

- **`committees`**: skips by `slug` (its own natural key).
- **`committee_members`**: skips by the (`committee_id`, `member_id`) pair (the table's own
  UNIQUE constraint).
- **`member_positions`**: skips by the (`member_id`, `title`) pair.

Row ids are freshly generated (`crypto.randomUUID()`) at insert time; idempotency comes from the
natural-key check against freshly queried existing rows, not from a fixed id scheme, since these
seed rows have no natural source-id the way `boat-seed.mjs`'s assignment ids do.

## The resolutions file: plain-director rows

`committee-seed.resolutions.json` (committed, git-reviewable) is where Geoff supplies any current
director who holds no office, at import review:

```json
{ "directors": [] }
```

- `directors`: an array of member names (e.g. `["Alex Rivera", "Sam Choi"]`). Each becomes a
  `member_positions` row, `kind: 'director'`, `title: 'Director'`, `sort_order` continuing at 5
  after the four officers (1-4). Every name matches against `members` the same exact,
  case-insensitive way as everyone else; a miss or an ambiguity lands in the audit, never guessed.

The file is absent-tolerant (a missing file defaults to `{ "directors": [] }`), and member names
carry no PII beyond what the published page already exposes publicly, so it is safe to commit
either empty or filled.

## Dry-run worksheet

`--dry-run` prints a summary to the console and writes a machine-local worksheet to
`~/.local/asc-data/committee-seed-worksheet.md` (never committed): every committee's insert/skip
decision, every officer/director/chair's insert/skip/miss decision (misses and ambiguities list
every candidate), the committee-name note, and a prompt to fill the resolutions
file's `directors` list when it is empty.

## Audit trail

Each inserted row gets an `audit_log` row: `actor = 'import:committee-seed'`, `action =
'import.insert'`, `entity` one of `'committee'` / `'committee_member'` / `'member_position'`,
`entity_id` the row's id, `detail` a JSON object naming the row's own fields (matching
`boat-seed.mjs`'s JSON-detail convention for this seeder family). Every run, even a complete
no-op, also writes one `action = 'import.batch'` summary row (`entity = 'committee-seed'`,
`entity_id = NULL`), `detail` a JSON object with insert/skip/miss counts for each of the three
tables.

## How to run

```sh
node scripts/import/committee-seed.mjs --dry-run   # prints the plan and worksheet, writes nothing
node scripts/import/committee-seed.mjs             # applies the resolvable subset to asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
access to the real `asc-club` database; always `--remote`, there is no local-D1 mode for this
script.

`--club-db-name NAME` overrides the write target; only ever used to scratch-prove this script
(including its rollback file) against a disposable database, never for a real run.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/committee-seed.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/committee-seed.rollback.sql
```

Scoped by audit-log lookup (this seeder's row ids are freshly generated `randomUUID()` values,
not a fixed prefix like `boat-seed.mjs`'s `boat-<assignment id>` scheme): removes every
`committees` / `committee_members` / `member_positions` row this seeder has ever inserted, and
its own audit trail. Safe only before a later admin edit (T6) has touched a seeded row -- once a
real edit exists, this rollback would discard it too, the same caveat every seeder's rollback in
this family carries.
