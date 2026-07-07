# asc-club migration 0015: the job runner's renewal-reminder tracking table and template

## What this does

Creates `renewal_reminders_sent` (`household_id`, `touch`, `sent_at`; primary key
`(household_id, touch)`) and seeds one `email_templates` row, `renewal_reminder`.

## Why

The renewal-reminder job (`src/jobs/renewal-reminders.ts`) sends a household up to four
touches (30 days before its rolling renewal boundary, 7 days before, the day of, and 30
days after) and must never send the same touch twice. `renewal_reminders_sent`'s own
primary key is that guarantee: an `INSERT OR IGNORE` for a touch already marked is a
no-op. `renewal_reminder` is authored fresh (ops carried no equivalent send); it reads one
`{{message}}` variable the job precomputes per touch, matching the "no conditional syntax
in the template body" convention every ported template already follows.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0015_job_runner/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0015_job_runner/verify.sql)"
```

Expect the `renewal_reminders_sent` table's own `CREATE TABLE` text, and one
`renewal_reminder` row.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0015_job_runner/rollback.sql
```

Safe only before the renewal-reminders job has run for real (see `rollback.sql`'s own
header).

## A migration-number collision, resolved at merge time

Authored as migration 0011, the same number the `member-portal` worktree independently
claimed for its own `0011_member_portal`, unmerged as of this migration's own authoring.
`0011_member_portal` merged to main first (`portal-capstone`) and kept the number; this
migration merged second (`job-runner`) and renumbered to 0015, the same resolution
migration 0009's own header documents for an earlier three-way collision at number 0008.
