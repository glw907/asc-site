# asc-club migration 0007: the asset and email domains

## What this does

Lands six tables from the ratified DDL's "ASSETS (pass 2.4)" and "EMAIL (pass 2.3)" sections
(`cairn-cms/docs/superpowers/specs/assets/phase-2-reference/asc-club-schema.sql`), verbatim in
structure, no seed rows: `asset_types`, `asset_assignments`, `asset_payments`, `asset_waitlist`,
`email_templates`, `email_log`. Neither domain has an admin screen or write path yet (both are
later passes' own work); this migration only lands the structure, ahead of its own pass, the same
early-landing shape `0005_member_domain` set: bring the whole ratified schema's structure into one
place rather than splitting an already-designed DDL across unrelated future passes.

## Lookup indexes added beyond the ratified DDL

The ratified DDL carries no indexes for either domain (only `asset_payments`'s inline
`UNIQUE (assignment_id, season)`). Following `0004_waitlist_integrity`'s own pattern (a plain
index on every `REFERENCES` column a per-entity query will filter by), this migration adds five:
`idx_asset_assignments_type`, `idx_asset_assignments_membership`, `idx_asset_payments_assignment`,
`idx_asset_waitlist_type`, `idx_asset_waitlist_member`. `email_log.template_id` gets no index: it
carries no `REFERENCES` clause in the ratified DDL at all (see below), so there is no FK-lookup
query shape to anticipate yet.

## FK-enforcement check (the 0005/0006 lesson)

Real (remote) D1 refuses an insert outright with `no such table` when a `REFERENCES` target table
does not exist, and refuses a specific row with `FOREIGN KEY constraint failed` when the target
table exists but the referenced row does not (`0004_waitlist_integrity`'s and
`0005_member_domain`'s own READMEs). Every `REFERENCES` target below already exists at the moment
this migration's own statements run, checked in file order:

- `asset_assignments.asset_type` and `asset_waitlist.asset_type` (both `REFERENCES
  asset_types(id)`): `asset_types` is created first in this same file.
- `asset_assignments.membership_id` (`REFERENCES memberships(id)`) and `asset_waitlist.member_id`
  (`REFERENCES members(id)`): both tables landed in `0005_member_domain`.
- `asset_payments.assignment_id` (`REFERENCES asset_assignments(id)`): `asset_assignments` is
  created immediately above it in this same file.
- `email_log.template_id` carries **no `REFERENCES` clause at all** in the ratified DDL, unlike
  every other cross-table column in this migration. This is landed verbatim, not an oversight: an
  audit-style send log needs to survive a template being edited or deleted later, the same reason
  `class_offers`' resolved rows outlive other changes elsewhere in the schema. No FK to check, no
  lookup index added for it.

## Proved safe before landing (2026-07-07)

A scratch database (`asc-club-scratch-0007-<timestamp>`, created and deleted for this proof only)
confirmed the migration end to end: `0001`-`0007` applied forward in order with no error, then all
six new tables and five new indexes were confirmed present via `sqlite_master`. Beyond that
structural check, every `REFERENCES` column was exercised directly, both the valid and the bogus
edge:

- `asset_assignments`: a valid insert (real `asset_types.id` and `memberships.id`, both seeded
  first) succeeded; a bogus `asset_type` and, separately, a bogus `membership_id` each failed with
  `FOREIGN KEY constraint failed`.
- `asset_payments`: a valid insert (real `asset_assignments.id`) succeeded; a bogus
  `assignment_id` failed with `FOREIGN KEY constraint failed`. A second insert repeating the same
  `(assignment_id, season)` pair failed with `UNIQUE constraint failed`, confirming the DDL's own
  inline `UNIQUE` still holds.
- `asset_waitlist`: a valid insert (real `asset_types.id` and `members.id`) succeeded; a bogus
  `asset_type` and, separately, a bogus `member_id` each failed with `FOREIGN KEY constraint
  failed`.
- `email_templates` and `email_log`: a valid insert of both succeeded, and an `email_log` row
  naming a nonexistent `template_id` **succeeded too**, confirming that column really carries no
  FK, matching the ratified DDL's own omission rather than a bug in this migration.

The real `asc-club` database's asset and email tables did not exist before this migration ran (no
prior pass has touched either domain), so there is no existing data to reconcile.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0007_assets_email/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0007_assets_email/verify.sql | grep -v '^\s*$')"
```

Expect six rows naming the new tables, then five rows naming the new indexes.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0007_assets_email/rollback.sql
```

Safe only before any real asset or email data exists (see `rollback.sql`'s own header): neither
domain has a write path yet, so this holds until pass 2.3/2.4 lands one.
