-- asc-club migration 0008 rollback: drop `asset_payments.method` and `.reference`.
--
-- Safe only before the assets admin's payment-recording action has written a real `method` or
-- `reference` value for a check/cash payment: a rollback after that point silently discards those
-- values (SQLite's `DROP COLUMN`, supported since 3.35, takes no data with it to preserve).
-- `stripe_ref`-backed rows lose nothing meaningful either way (their `method = 'card'` was itself
-- derived from `stripe_ref`, which this rollback leaves untouched).
ALTER TABLE asset_payments DROP COLUMN method;
ALTER TABLE asset_payments DROP COLUMN reference;
