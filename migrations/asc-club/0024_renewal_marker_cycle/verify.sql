-- Verifies 0024_renewal_marker_cycle: renewal_reminders_sent carries an expires_on column and a
-- UNIQUE(household_id, touch, expires_on) constraint, and the backfill stamped every legacy row
-- with a non-empty cycle boundary.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0024_renewal_marker_cycle/verify.sql
--
-- Expected: expires_on_present = 1; table_sql's text contains "expires_on" and
-- "UNIQUE (household_id, touch, expires_on)"; blank_expires_on_count = 0 (every row backfilled
-- with a real boundary); total_rows equals the pre-migration row count (a pure rebuild, no row
-- dropped or added).
--
-- Post-rollback (verify-empty step): re-run only the first two queries; expect
-- expires_on_present = 0 and table_sql's text to contain "PRIMARY KEY (household_id, touch)" with
-- no "expires_on" (the third query errors after rollback, since the column no longer exists --
-- expected, not a failure of the rollback itself).
SELECT COUNT(*) AS expires_on_present FROM pragma_table_info('renewal_reminders_sent') WHERE name = 'expires_on';
SELECT sql AS table_sql FROM sqlite_master WHERE type = 'table' AND name = 'renewal_reminders_sent';
SELECT
  (SELECT COUNT(*) FROM renewal_reminders_sent WHERE expires_on IS NULL OR expires_on = '') AS blank_expires_on_count,
  (SELECT COUNT(*) FROM renewal_reminders_sent) AS total_rows;
