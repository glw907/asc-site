# asc-club migration 0031: drop `settings.waiver_text_version`

## What this does

Deletes the `settings` row for key `waiver_text_version` (member-waivers T5a,
`docs/2026-07-17-member-waivers-design.md`'s "Seams and sequencing": "`waiver-text.ts` and
`settings.waiver_text_version` retire once the document model lands"). The pre-T2 waiver
machinery this row backed retired in the same task: `$theme/waiver-text.ts` (the one global
release-text constant) is deleted, and `club-settings.ts`'s own reader (`getWaiverTextVersion`)
is gone. The per-document signature model (T1/T2/T4, `$theme/documents.ts` and migration
`0029_signature_record`) tracks a signature's wording per document/version/season instead of one
global string, so this key has no remaining reader or writer anywhere in the app.

A plain `DELETE`, not a schema change: `settings` is a key-value table (`0001_substrate`), so
removing one key needs no `CREATE TABLE`/recreate-and-copy, unlike `0029`'s own widened
`waiver_acceptances`.

## Why the rollback restores an exact snapshot

The live `asc-club` `waiver_text_version` row was confirmed immediately before this migration was
written:

```
$ source ~/.local/secrets && npx wrangler d1 execute asc-club --remote --command "SELECT key, value, updated_at, updated_by FROM settings WHERE key='waiver_text_version'"
[{"results": [{"key": "waiver_text_version", "value": "2026-01", "updated_at": "2026-07-07 08:29:01", "updated_by": "system"}], "success": true, ...}]
```

Exactly the `0001_substrate` seed value, untouched: no writer for this key ever existed
(`getWaiverTextVersion` was a reader only, per that module's own header). `rollback.sql` restores
this exact row.

## How to run

```sh
source ~/.local/secrets && npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0031_drop_waiver_text_version/forward.sql
```

## Verify

```sh
source ~/.local/secrets && npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0031_drop_waiver_text_version/verify-forward.sql)"
```

Expect zero rows.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0031_drop_waiver_text_version/rollback.sql
```

Safe at any point: nothing writes this key going forward, so a rollback can only ever restore the
row to the exact value confirmed above.

## Scratch-proof procedure

Per the repo's standing migration discipline (the same cycle `0029`/`0030`'s READMEs document):

1. Fresh disposable `--persist-to` directory, distinct from the repo's own `.wrangler/` state.
2. Apply `0001` through `0031` in order, `--local --persist-to <scratch dir>`.
3. **Verify**: run `verify-forward.sql`; expect zero rows.
4. **Rollback**: apply `rollback.sql`; confirm no error.
5. **Verify-rollback**: run `verify-rollback.sql`; expect one row, `value='2026-01'`,
   `updated_by='system'`.
6. **Forward again**: re-apply `forward.sql`; confirm no error.
7. Delete the scratch persistence directory.

See the task report for the full transcript.
