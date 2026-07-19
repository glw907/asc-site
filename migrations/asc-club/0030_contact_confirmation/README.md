# asc-club migration 0030: the contact-confirmation record

## What this does

Adds `contact_confirmations`, the record for the signing moment's contact-confirm step
(member-waivers T4, `docs/2026-07-17-member-waivers-design.md` "The Mat-Su Borough flow-down" and
"Signing experience"). A mooring or dry-storage holder's annual signing moment ends with a
glance-and-confirm of their contact info, because the Borough flow-down's 72-hour relocation
clock is only survivable if the club can reach the member. The confirmation is a record in its
own right: the club needs to prove, per season, that the member affirmed their contact info was
current at signing time.

One additive table, the same shape `0027_directory_domain` used for its own new domain tables (a
child table referencing `members`/`households`, no recreate-and-copy needed since nothing
pre-existing changes).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `TEXT` PRIMARY KEY | |
| `member_id` | `TEXT` NOT NULL REFERENCES `members(id)` | The confirming member (the household's responsible adult for the asset). |
| `household_id` | `TEXT` NOT NULL REFERENCES `households(id)` | Denormalized alongside `member_id` so the admin rollup (T6) can group by household without a join back through `members`. |
| `season` | `INTEGER` NOT NULL | The year the confirmation covers (annual re-sign cadence). |
| `context` | `TEXT` NOT NULL | The money moment, reusing `0029`'s own widened five-value vocabulary (`class-signup`, `join`, `renewal`, `mooring-fee`, `storage-fee`). |
| `email`, `phone` | `TEXT` | The confirmed contact values, snapshotted at confirmation time. |
| `address_line1`, `address_line2`, `city`, `state`, `postal_code` | `TEXT` | The confirmed mailing address, snapshotted so the record stands on its own after any later profile edit. |
| `confirmed_at` | `TEXT` NOT NULL DEFAULT `datetime('now')` | |

## Why the snapshot columns

The record snapshots the confirmed values rather than pointing at the live `members`/`households`
rows, the same self-contained-record principle `0029`'s `content_snapshot`/`auth_*` columns
follow for the signature itself: a confirmation must still read true even after the member later
edits their profile.

## How to run

```sh
source ~/.local/secrets && npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0030_contact_confirmation/forward.sql
```

## Verify

```sh
source ~/.local/secrets && npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0030_contact_confirmation/verify-forward.sql)"
```

Expect the table name, the twelve-column ordinal listing, and `row_count: 0`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0030_contact_confirmation/rollback.sql
```

Safe only before any real contact confirmation exists (the additive-migration caveat this
directory's other rollbacks all carry).

## Scratch-proof procedure

Per the repo's standing migration discipline (the same cycle `0029`'s README documents):

1. Fresh disposable `--persist-to` directory, distinct from the repo's own `.wrangler/` state.
2. Apply `0001` through `0030` in order, `--local --persist-to <scratch dir>`.
3. **Verify**: run `verify-forward.sql`; expect the table name, the twelve-column listing, and
   `row_count: 0`.
4. **Constraint proof**: insert a row with a bad `context`; confirm the `CHECK` rejects it. Insert
   a valid row (a `renewal` confirmation with a snapshotted address); confirm it is accepted and
   reads back intact.
5. **Rollback**: apply `rollback.sql`; confirm no error and the table is gone.
6. **Verify-rollback**: run `verify-rollback.sql`; expect zero rows.
7. **Forward again**: re-apply `forward.sql`; confirm no error.
8. Delete the scratch persistence directory.

See the task report for the full transcript.
