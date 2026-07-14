-- asc-club migration 0025 verify: run via `--file` (all SELECTs).
--
-- Expected: table_sql's text contains "email_blasts" and every column the forward migration
-- defines; row_count = 0 (a pure structural migration, no seed rows).
--
-- Post-rollback (verify-empty step): re-run the first query; expect no row (table_sql is empty).
SELECT sql AS table_sql FROM sqlite_master WHERE type = 'table' AND name = 'email_blasts';
SELECT COUNT(*) AS row_count FROM email_blasts;
