# household-address-seed: seed household street addresses from the MW export

## What this does

Reads `asc-club`'s households and members, and the MembershipWorks (MW) member export, and
fills each household's `address_line1`, `state`, and `postal_code` (migration
`0027_directory_domain`) from its **primary member's** export row.

**One roof, one address.** A household's address comes from the account holder, not from every
member in it: `households.primary_member_id` resolves a member, whose `mw_account_id` matches
the export's `Account ID` column. There is no separate street-line-2 column in the export, so
`address_line2` is never set by this script.

**`city` is not this importer's column.** `households.city` already exists and is already
populated by `mw-members.mjs`. This script only ever touches `address_line1`, `state`, and
`postal_code`.

## Update-if-null only

This seeder never overwrites a value that is already set. Each column update runs as `UPDATE
households SET address_line1 = ? WHERE id = ? AND address_line1 IS NULL` (and likewise for
`state` and `postal_code`), so:

- A later member edit is never clobbered by a re-run.
- Re-running this script once every column is filled is a no-op.
- A household that already has a street but is missing, say, only `postal_code` gets an update
  touching just that one column.

Address text is stored **verbatim** from the export. Some rows are ALL CAPS; re-casing free-typed
street text is error-prone and is left to a later polish pass, not this importer.

## Skip reasons

A household lands in `skipped`, never `updates`, for one of four reasons:

| Reason | Meaning |
|---|---|
| `no-mw-account` | The household's primary member has no `mw_account_id`. |
| `no-export-match` | No export row's `Account ID` matches that id. |
| `no-street` | The matched export row's `Address (Street)` cell is empty or whitespace-only. Never guessed at; this is a real gap in the source data (2 households as of the 2026-07-13 export: Leon Shellabarger, Michele Liu). |
| `already-filled` | Every one of `address_line1`/`state`/`postal_code` is already non-NULL on the household. |

## Dry-run worksheet

`--dry-run` prints a summary to the console and writes a machine-local worksheet to
`~/.local/asc-data/household-address-worksheet.md` (never committed; it carries names and
addresses). The worksheet lists every household to be updated (name, then each column being set)
and every skipped household with its reason. No statements are executed in dry-run mode.

## Audit trail

Each updated household gets an `audit_log` row: `actor = 'import:household-address'`, `action =
'import.update'`, `entity = 'household'`, `entity_id` the household id, `detail` a JSON object
naming which columns were set and to what: `{ batchId, address_line1?, state?, postal_code? }`.
The prior value was always NULL, so the new values are the whole story; there is no before/after
pair to record.

Every run, even a complete no-op, also writes one `action = 'import.batch'` summary row (`entity
= 'household'`, `entity_id = NULL`), `detail` a JSON object `{ updated, skipped, skippedNoStreet,
skippedAlreadyFilled, skippedNoMwAccount, skippedNoExportMatch, sourceHouseholds }`.

## How to run

```sh
node scripts/import/household-address-seed.mjs --dry-run   # prints the plan and worksheet, writes nothing
node scripts/import/household-address-seed.mjs             # applies the update-if-null set to asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
access to the real `asc-club` database; always `--remote`, there is no local-D1 mode for this
script.

`--source PATH` overrides the export CSV, default `~/.local/asc-data/mw-export-2026-07-13.csv`.
`--club-db-name NAME` overrides the write target; only ever used to scratch-prove this script
(including its rollback file) against a disposable database, never for a real run.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/household-address-seed.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/household-address-seed.rollback.sql
```

Nulls `address_line1`/`state`/`postal_code` for every household the importer's own audit trail
names, then deletes that trail. Never touches `city`, this importer's boundary column. Safe only
before a member or admin has edited a household's address by hand; once a real edit exists, a
full rollback would discard it too.
