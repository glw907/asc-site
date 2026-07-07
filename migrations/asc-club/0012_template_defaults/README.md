# asc-club migration 0012: email template defaults

## What this does

Adds `default_subject`/`default_body` (`TEXT NOT NULL DEFAULT ''`) to `email_templates`, then
backfills both from each row's own current `subject`/`body`. No new table; `email_templates`
already exists (migration 0007_assets_email).

## Why

The Email edit screen (pass 2.3) adds a real reset-to-default action. Every row this database
carries came from `scripts/import/ops-email-templates.mjs` or a sibling pass's own seed, and none
has ever been edited through a real admin screen (the Email section shipped read-only in pass
2.2), so each row's current `subject`/`body` IS the shipped default, exactly. Backfilling from
those current values is a documented fact about this database's own history, not a guess.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0012_template_defaults/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0012_template_defaults/verify.sql)"
```

Expect every row's `subject_matches_default`/`body_matches_default` to read `1`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0012_template_defaults/rollback.sql
```

Safe only before the Email edit screen's own reset action has ever run against a real row (see
`rollback.sql`'s own header).
