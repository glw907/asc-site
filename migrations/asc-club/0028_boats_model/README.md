# asc-club migration 0028: boats collapse to a single `model` field

## What this does

Reshapes `boats` (added in `0027_directory_domain`) from a `class` picker plus a
required-iff-`Other` `model` column into a single required `model TEXT`:

1. Drops `boats` and recreates it with `model TEXT NOT NULL CHECK (model <> '')` in place of
   the old `class` + conditional `model` pair.
2. Recreates `idx_boats_member` on the new table.

`id`, `member_id`, `name`, `sail_number`, `kept_on`, and the timestamps are unchanged from 0027.

## Why

Geoff ratified this reshape 2026-07-17. The `class` picker and the required-iff-`Other` `model`
column were two columns doing the work of one fact: what boat a member owns. A later task's
capture UI still offers the same three-way picker (Buccaneer 18 / Laser / Other), but "Other"
now means "type the real model", and the resolved string lands in `model` either way:
`'Buccaneer 18'`, `'Laser'`, or whatever the member typed. The picker is a capture-time
affordance, not a distinct stored fact.

`boats` was still empty when this migration was written (the boat seeder, T2, had not yet run
against the live database), so `forward.sql` drops and recreates the table outright instead of
an in-place `ALTER`. No other table references `boats` by foreign key, so the drop is safe.

`0027_directory_domain` is already applied live, so this reshape lands as a new forward
migration, never an edit to 0027 in place. Every migration in this repo is append-only once
applied.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0028_boats_model/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0028_boats_model/verify-forward.sql)"
```

Expect `model` present with `notnull = 1`, and no row for `class`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0028_boats_model/rollback.sql
```

Restores the exact 0027 shape (the `class` picker, the required-iff-`Other` `model`, and the
matching table-level `CHECK`). Safe only before any real boat data exists in the reshaped table:
a rollback after that point discards rows, not just structure.

## Scratch-proof procedure

Per the repo's standing migration discipline, this migration's scratch proof runs entirely
against a local, disposable D1 replica (a `--persist-to` directory distinct from the repo's own
`.wrangler/` state), never a real Cloudflare-hosted scratch database and never `--remote`:

1. Create a fresh persistence directory.
2. Apply migrations `0001` through `0028` in order, `--local --persist-to <scratch dir>`.
3. **Verify**: run `verify-forward.sql` against the scratch replica; expect `model` present with
   `notnull = 1` and `class` absent.
4. **Constraint proofs**: attempt each documented violation directly against the scratch
   replica and confirm each one is rejected: a `NULL` `model`, an empty-string `model` (the
   `model <> ''` `CHECK`), and a bad `kept_on` value. Confirm the documented default
   (`kept_on = 'trailer'`) still applies when omitted.
5. **Rollback**: apply `rollback.sql`; confirm no error.
6. **Verify-rollback**: run `verify-rollback.sql`; expect `class` present again and `model` back
   to `notnull = 0`.
7. Delete the scratch persistence directory.

This proof, plus applying `forward.sql` to the local replica the dev server and e2e suite serve
against, is as far as this task goes. Only the conductor applies `forward.sql` to the live
`asc-club` at the pass close.
