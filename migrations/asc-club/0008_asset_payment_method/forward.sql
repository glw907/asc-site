-- asc-club migration 0008: `asset_payments` gains `method` and `reference`.
--
-- The gap-analysis rider (docs/2026-07-07-membership-functionality-gap-analysis.md, item 2,
-- synthesized the day AFTER migration 0007's own schema was ratified): "offline check/cash
-- payment recording... a Stripe-only build breaks at the first mailed check." The ratified
-- `asset_payments` shape (0007_assets_email) carries `stripe_ref` for the Stripe checkout/session
-- id and nothing else identifying HOW a payment arrived, because the offline-payment requirement
-- was not yet on the table when that schema was designed. This migration lands the two columns
-- the Club section's payment-recording admin action needs to capture a check or cash payment
-- honestly rather than overloading `stripe_ref` with a non-Stripe value:
--
-- `method`: which of the three ways a payment actually arrived (`card` covers the existing Stripe
-- checkout flow, `check` and `cash` are the two the club's own volunteer treasurers really use,
-- per the club's own join page already offering a check option). Nullable and unconstrained by a
-- backfill CHECK failure for any pre-existing row this migration's own backfill (below) does not
-- reach.
-- `reference`: a free-text note (a check number, who handed over cash, an external record) --
-- always independent of `stripe_ref`, which stays reserved for the Stripe checkout/session id and
-- is never repurposed to carry a check number.
--
-- SQLite's `ADD COLUMN` is safe and simple here (no `REFERENCES` clause, no `NOT NULL` without a
-- default on a non-empty table), unlike migration 0006's own recreate-and-copy for a `REFERENCES`
-- clause change.
ALTER TABLE asset_payments ADD COLUMN method TEXT CHECK (method IN ('card','check','cash'));
ALTER TABLE asset_payments ADD COLUMN reference TEXT;

-- Backfill: every row this database already carries came from `scripts/import/ops-assets.mjs`
-- (2026-07-07), and every one of those rows has a `stripe_ref` (asc-ops always populated
-- `stripe_payment_id` once a payment was requested, `paid` or `sent` alike) -- so every existing
-- row's payment was, in fact, requested through the Stripe checkout flow: `method = 'card'` for
-- exactly those rows is a documented, defensible backfill, not a guess.
UPDATE asset_payments SET method = 'card' WHERE stripe_ref IS NOT NULL AND method IS NULL;
