# asc-club migration 0016: email template defaults

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
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0016_template_defaults/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0016_template_defaults/verify.sql)"
```

Expect every row's `subject_matches_default`/`body_matches_default` to read `1`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0016_template_defaults/rollback.sql
```

Safe only before the Email edit screen's own reset action has ever run against a real row (see
`rollback.sql`'s own header).

## A migration-number collision, resolved at merge time

Authored as migration 0012, the same number `job-runner`'s own concurrent
`0012_class_reminders` claimed, the same collision migration 0010's own header already worked
around once. `0012_class_reminders` merged to main first (`job-runner`) and kept the number;
this migration merged later (`email-editor`) and renumbered to 0016. That placement matters:
the backfill above reads every row currently in `email_templates`, including the rows
`0015_job_runner` (itself renumbered from an 0011 collision with `0011_member_portal`) and
`0012_class_reminders` seed, so it must apply after both. Prefix order alone guarantees that
(0016 sorts after both 0015 and 0012), so a fresh-environment replay in prefix order still gets
a correct database.
