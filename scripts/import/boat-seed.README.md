# boat-seed: seed boats from asset-assignment free text

## What this does

Reads `asc-club`'s own asset-assignment free text (already imported by `ops-assets.mjs`; this
script never touches `asc-ops`) and plans one `boats` row (migration `0027_directory_domain`,
reshaped to a single `model` column by `0028_boats_model`) for each active boat-related
assignment: `asset_type IN ('boat_parking', 'small_boat', 'mooring')` and `status = 'active'`.
A released assignment is a historical parking record, not current ownership, so it is excluded
from seeding and reported as an excluded count, never silently dropped.

**Boats attach to a member, not a household.** The ratified roles-and-committees model lets a
household with several members say who owns which boat. A solo household (exactly one
non-archived member) resolves the owner on its own. A multi-member household is genuinely
ambiguous from free text alone: this script never guesses it, it holds the row and reports it
for Geoff to resolve.

**Insert-if-absent only, this script never updates an existing `boats` row.** Unlike
`ops-assets.mjs`'s natural-key upsert, boats will receive real member edits once a later pass
ships an edit surface, so a re-run of this seeder must never clobber one. The id
`boat-<source assignment id>` is the idempotency key.

## Normalization rules

| Raw description matches | `model` |
|---|---|
| `/bucc/i` (BUCC, Buccaneer, Bucc 18, ...) | `Buccaneer 18` |
| `/laser/i` (Laser, Yellow laser, LASER II, ...) | `Laser` |
| anything else, non-empty | the raw trimmed text |
| empty, whitespace-only, or missing | skipped (`skipped: 'empty-description'`) |

`LASER II` normalizes to `Laser`: the picker has no Laser II model, and casual usage dominates
the real data. The dry-run worksheet still shows the raw text next to every seed row, so Geoff
can override a specific row through the resolutions file's `model` map if he wants a different
call.

`kept_on` follows the source asset type: `'mooring'` for a mooring assignment, `'trailer'` for
everything else (`boat_parking`, `small_boat`).

**Every seeded boat's `name` is `NULL`**, even where a name is visible in the raw text (for
example `Purple Buccaneer 18 "Dionysus"`). Name capture starts going forward, not
retroactively; the raw description survives in the audit `detail` so a name can be hand-added
later. `sail_number` is always `NULL`; there is no reliable way to extract one from free text.

## Owner resolution and the resolutions file

Every active row resolves one of four ways:

1. **Solo household**: exactly one non-archived member in the household. Seeded automatically,
   `ownerBasis: 'solo'`.
2. **Resolved from file**: `boat-seed.resolutions.json`'s `owners` map names a member id for
   this assignment, and that id belongs to the household. Seeded, `ownerBasis: 'resolved'`.
3. **Ambiguous, held**: a multi-member household with no matching `owners` entry. Never seeded.
   The dry-run worksheet lists every candidate member plus a name-hint suggestion when one
   exists (for example `'BUCC Gabe'` in a household that includes `'Gabe Black'` suggests Gabe
   Black; the suggestion is offered, never applied automatically).
4. **Dropped**: the assignment id appears in `resolutions.drop`. Geoff judged the row is not a
   real boat, or a duplicate. Never seeded, never reported as held again.

`scripts/import/boat-seed.resolutions.json` (committed, git-reviewable) starts empty:

```json
{ "owners": {}, "drop": [], "model": {} }
```

- `owners`: `{ "<assignment id>": "<member id>" }`, resolves an ambiguous household.
- `drop`: `["<assignment id>", ...]`, rows to exclude entirely.
- `model`: `{ "<assignment id>": "<model string>" }`, overrides a parsed model call for one
  row with a plain string.

Member ids are opaque UUIDs carrying no name or email, so this file is safe to commit. The
workflow is: run `--dry-run`, read the worksheet, add entries to the resolutions file, run
`--dry-run` again to confirm the plan, then apply. The script converges over as many rounds as
Geoff needs; nothing is guessed to force a row through early.

## Dry-run worksheet

`--dry-run` prints a summary to the console and writes a machine-local worksheet to
`~/.local/asc-data/boat-seed-owner-worksheet.md` (never committed, since it carries member
names). The worksheet lists every seed row (raw description, model, `kept_on`, owner and
basis), a `typed models, verify` callout of every row whose model is not a known picker value
(`Buccaneer 18` or `Laser`) so Geoff can eyeball the free-typed models and add a `model`
override or a `drop` entry, and the held-for-owner section (raw description, model, household
name, every candidate member with their opaque id, and the name-hint suggestion when one
exists) that `owners` gets filled from.

## Audit trail

Each inserted boat gets an `audit_log` row: `actor = 'import:boat-seed'`, `action =
'import.insert'`, `entity = 'boat'`, `entity_id` the boat id, `detail` a JSON object
`{ batchId, sourceAssignmentId, rawDescription, ownerBasis, model, keptOn }`. Every run, even a
complete no-op, also writes one `action = 'import.batch'` summary row (`entity = 'boat'`,
`entity_id = NULL`), `detail` a JSON object `{ inserted, held, dropped, skipped,
releasedExcluded, sourceActive }`.

## How to run

```sh
node scripts/import/boat-seed.mjs --dry-run   # prints the plan and worksheet, writes nothing
node scripts/import/boat-seed.mjs             # applies the resolvable subset to asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and
network access to the real `asc-club` database; always `--remote`, there is no local-D1 mode
for this script.

`--club-db-name NAME` overrides the write target; only ever used to scratch-prove this script
(including its rollback file) against a disposable database, never for a real run.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/boat-seed.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/boat-seed.rollback.sql
```

Removes every boat this seeder has ever created (matched by the `boat-ops-assignment-%` id
prefix) and its audit trail. Safe even after a later pass adds member-captured boats: those
carry a different id scheme entirely, so this rollback can never remove a real member's own
boat.
