# asc-club migration 0001: substrate

## What this lands

The `asc-club` D1 database is the phase-2 club domain store (the two-database strategy:
`asc-club` is created fresh from the ratified DDL; `asc-ops`, the club's existing system, is
never altered). This migration creates the pass 2.1 subset of that DDL, verbatim in table
structure: `events`, `classes`, `class_instructors`, `class_enrollments`, `class_waitlist`,
`class_offers`, `club_roles`, `settings`, and `audit_log`.

It also lands one table ahead of its own pass: `waiver_acceptances`. The gap analysis found
that the phase-2 design suite never specced a liability-release store, but both the pass 2.1
public class-signup form and pass 2.2's join flow need one, so the table lands here rather than
being built twice. A `waiver_text_version` settings row seeds the current release text version.

Member-domain tables (`households`, `members`, `memberships`, `credit_grants`,
`credit_redemptions`) and the email and asset domains belong to later passes' own migrations.
They are not created here. Three of the tables above (`class_instructors`,
`class_enrollments`, `class_waitlist`) reference `members(id)`, which does not exist yet.
SQLite does not require a `REFERENCES` target to exist at `CREATE TABLE` time, and D1 does not
enforce foreign keys by default, so the reference resolves cleanly once pass 2.2 lands
`members`.

One deviation from the ratified DDL: `club_roles.role`'s `CHECK` gains `'owner'` alongside the
ratified `'club-admin'` and `'instructor'`. The ratified schema's enum had no role for the
single owner seat, but the plan's Task 4 authorization layer (`getClubRole` returning `'owner'
| 'admin' | null`) and Geoff's 2026-07-07 seed ruling both need one distinct from
`club-admin`.

## Seed rows

- `settings`: `current_season` = `2026` (read off `asc-ops`'s own live events and classes
  rows on 2026-07-07; ops keeps no separate season or year table, so the season is read off
  the data itself), `offer_window_hours` = `72`, `waiver_text_version` = `2026-01`.
- `club_roles`: one row, `geoff-login@907.life` as `owner`.
- `audit_log`: two rows recording the seed itself, so the settings and role grant above are
  not unaudited mutations.

## How to run

`wrangler d1 execute --remote --file` silently switches to its bulk-import path for a
write-only file, which is what `forward.sql` and `rollback.sql` are. That path returns no
per-statement output, only a totals summary, so it is fine for those two files. `verify.sql`
is all `SELECT`s: run it with `--command` instead (a `;`-joined string), which uses the query
path and returns real per-statement results.

Against the real database:

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0001_substrate/forward.sql

VERIFY_SQL=$(grep -v '^--' migrations/asc-club/0001_substrate/verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

Read the `verify.sql` output against the expectations noted in its own comments: 10 tables, 3
settings rows, 1 club_roles row, 2 audit_log rows, and every domain table starting empty
(Task 2's import lands the first real events and classes rows).

Before running against the real database, prove the cycle on a scratch database:

```sh
npx wrangler d1 create asc-club-scratch
npx wrangler d1 execute asc-club-scratch --remote --file migrations/asc-club/0001_substrate/forward.sql

VERIFY_SQL=$(grep -v '^--' migrations/asc-club/0001_substrate/verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club-scratch --remote --command "$VERIFY_SQL"

npx wrangler d1 execute asc-club-scratch --remote --file migrations/asc-club/0001_substrate/rollback.sql
npx wrangler d1 execute asc-club-scratch --remote --command "SELECT name FROM sqlite_master WHERE type = 'table'"
npx wrangler d1 delete asc-club-scratch
```

The final table-list query should return no rows from this migration (only D1's own internal
`_cf_KV` and `sqlite_sequence` tables remain; neither is part of this migration).

## How to roll back

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0001_substrate/rollback.sql
```

This drops every table this migration created, in dependency order. It is destructive: run it
only if the migration needs to be undone before any later pass has written real data into
these tables (Task 2's import, the admin screens' writes, or the public forms). Once real data
exists, a rollback of the whole substrate is no longer a live option; a targeted follow-up
migration is the right tool instead.
