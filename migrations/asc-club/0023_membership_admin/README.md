# asc-club migration 0023: membership admin

## What this does

Two independent additions, both needed for the `membership-admin` initiative
(`docs/2026-07-14-membership-admin-design.md`) to work against real D1:

1. `memberships.refunded_at TEXT` (null default). Marks a refunded dues row without deleting
   it (ruling 4: refunds never delete history). `src/member-auth/lib/standing.ts` gains
   `AND refunded_at IS NULL` on every membership query it runs, so a household's standing
   ignores a refunded row and reads lapsed/none instead of current; rejoining or renewing the
   same season reclaims the row (clears `refunded_at`, sets a new `paid_at`) rather than
   inserting a second one, keeping the existing `UNIQUE (household_id, season)` constraint
   intact.
2. `signup_review_resolutions` (id, membership_id, outcome, note, resolved_by, resolved_at).
   The signup review queue's own persistence: the queue itself keeps deriving its pending rows
   live (first-season memberships created recently, per `reconcileJoin`'s own unchanged
   write path), and this table is the one new fact — a human's approve/deny decision on a
   given join.

## Why refunds get a column, not a delete

The import-era precedent (a fully-refunded row simply removed, per `CLAUDE.md`'s Task 8
carry-forward note on Jerry Edward Amundsen's row) covered a one-time backfill correction.
Live refunds are a different case: the household's own history — the fact that they joined,
paid, and later got a refund — is a real fact the desk's money timeline needs to keep showing
(the design's own Oliver-household example: "two charges plus void renders as it actually
happened"). A `refunded_at` timestamp preserves that history while structurally removing the
row from every standing computation.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0023_membership_admin/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0023_membership_admin/verify.sql
```

Expect `refunded_at_present = 1`, `refunded_at_null_count` to equal `memberships_total`,
`resolutions_sql`'s text to contain `outcome`, `'approved'`, and `'denied'`, and
`resolutions_row_count = 0`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0023_membership_admin/rollback.sql
```

Safe only before any refund has been recorded (a live `refunded_at` value would be silently
dropped by the column removal) and before any signup review has been resolved.

## Scratch-proof procedure

Per the repo's standing migration discipline, and per this task's constraint against ever
issuing a `--remote` write, this migration's scratch proof runs entirely against a local,
disposable D1 replica (a `--persist-to` directory distinct from the repo's own `.wrangler/`
state), never a real Cloudflare-hosted scratch database:

1. Create a fresh persistence directory.
2. Apply migrations 0001 through 0023 in order, `--local --persist-to <scratch dir>`.
3. **Forward** already ran as step 2's last file; confirm no error.
4. **Verify**: run `verify.sql` against the scratch replica; expect the values this file's
   own header documents.
5. **Rollback**: apply `rollback.sql`; confirm the column and table are gone.
6. **Verify-empty**: re-run `verify.sql`'s `signup_review_resolutions` queries; expect the
   table-shape query to return no row and `refunded_at_present` to read `0`.
7. Delete the scratch persistence directory.

This proof, plus applying `forward.sql` to the local replica the dev server and e2e suite
serve against, is as far as an implementer task goes. Only the conductor applies `forward.sql`
to the live `asc-club` at the pass close.
