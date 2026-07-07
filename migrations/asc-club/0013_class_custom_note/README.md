# asc-club migration 0013: the per-class reminder note

## What this does

Adds `custom_note` (`TEXT`, nullable) to `classes`. No new table; `classes` already exists
(migration 0001_substrate).

## Why

The class reminder templates (a later pass's own cron-driven sends) interpolate
`{{class_note}}`; this column is the per-class override an admin edits directly, so one class can
say "bring your own PFD" without hard-coding it into a template every class shares. This pass's
own deliverable is the column and the Classes edit screen's own field; the templates that read it
are the job runner's.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0013_class_custom_note/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0013_class_custom_note/verify.sql)"
```

Expect one row per class, `custom_note` `NULL` until an admin sets one.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0013_class_custom_note/rollback.sql
```

Safe only before any class has a real note set (see `rollback.sql`'s own header).
