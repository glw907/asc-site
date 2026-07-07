# asc-club migration 0010: the membership tier prices

## What this does

Seeds three `settings` rows, `INSERT OR IGNORE` so it is safe to re-run:
`tier_price_individual` (250), `tier_price_family` (500), `tier_price_young_adult` (100).
No table changes; `settings` already exists (migration 0001_substrate).

## Why

The design suite's own ruling: membership tier prices are admin-editable settings, never
code constants, so a price change is an audited admin action and the per-season
`memberships.price_paid` row snapshots whatever was current at purchase. Checked first
(the task's own instruction): no such rows existed yet. `demo-members.ts`'s
`TIER_PRICING` constant (individual 250 / family 500 / young-adult 100) is the fixture
these seed values match, but that constant stays fixture-only; the real 2.2 join/renewal
flow (a later pass) is the first consumer expected to read these rows instead of it.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0010_tier_prices/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0010_tier_prices/verify.sql)"
```

Expect three rows: `tier_price_individual` = 250, `tier_price_family` = 500,
`tier_price_young_adult` = 100.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0010_tier_prices/rollback.sql
```

Safe only before the Club settings screen's own tier-price action has ever written a real
change (see `rollback.sql`'s own header).
