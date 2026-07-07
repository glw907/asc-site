# asc-club migration 0008: `asset_payments.method` and `.reference`

## What this does

Adds two nullable columns to `asset_payments`: `method TEXT CHECK (method IN
('card','check','cash'))` and `reference TEXT`. Backfills `method = 'card'` for every
existing row (all imported by `scripts/import/ops-assets.mjs`, every one carrying a
`stripe_ref`).

## Why

The gap-analysis rider
(`docs/2026-07-07-membership-functionality-gap-analysis.md`, item 2) names offline
check/cash payment recording as a real requirement the ratified schema does not yet
carry a column for: migration 0007's own `asset_payments` shape was ratified 2026-07-06,
one day before the gap analysis surfaced the requirement. The Club section's Assets
admin (Part 2, this pass) needs a real, queryable place to record HOW a payment
arrived, not just that it did: `stripe_ref` stays reserved for the actual Stripe
checkout/session id and is never repurposed to hold a check number.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0008_asset_payment_method/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0008_asset_payment_method/verify.sql)"
```

Expect the `asset_payments` table's own `CREATE TABLE` SQL to list `method` and
`reference`, and (as of the 2026-07-07 import) 76 rows with `method = 'card'`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0008_asset_payment_method/rollback.sql
```

Safe only before the payment-recording admin action has written a real `method` or
`reference` for a check/cash payment (see `rollback.sql`'s own header).
