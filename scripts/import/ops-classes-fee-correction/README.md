# ops-classes-fee-correction: corrects the ops-classes.mjs import's placeholder fee

## What this does

`ops-classes.mjs` imported every asc-ops class with `fee = 0`, the schema's `NOT NULL`
floor for a source column that was always `NULL` (MembershipWorks charged externally, see
`../ops-classes.README.md`'s own field-mapping table). This one-off correction replaces
that placeholder with the club's real published price for an additional (non-credit)
class, $100 (`docs/2026-07-07-member-portal-design.md`), on every class still at the
placeholder. `capacity` is untouched: it stays the import's own admin-editable placeholder
of 10, confirmed or edited per class through the classes admin screen (Task 6).

This is a plain data correction, not a schema change, so it ships as SQL only (no `.mjs`
importer): there is no external source to re-read, just a fixed, known value to apply.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/ops-classes-fee-correction/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(cat scripts/import/ops-classes-fee-correction/verify.sql)"
```

Expect `still_placeholder: 0`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/ops-classes-fee-correction/rollback.sql
```

Safe only before a volunteer has set a real, different fee through the classes admin
screen (see `rollback.sql`'s own header).
