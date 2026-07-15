-- Verifies 0026_drop_club_roles: run via `--file` (all SELECTs).
--
-- Expected right after forward: table_sql returns no row (the table is gone).
--
-- Post-rollback (verify-restored step): re-run the first query; expect one row whose text
-- matches forward.sql's own DDL exactly, then run the second query; expect exactly one row --
-- email = "geoff-login@907.life", role = "owner", granted_by = "system",
-- granted_at = "2026-07-07 08:29:01" (the second query errors before rollback, since the table
-- does not exist yet -- expected, not a failure of forward.sql).
SELECT sql AS table_sql FROM sqlite_master WHERE type = 'table' AND name = 'club_roles';
SELECT email, role, granted_by, granted_at FROM club_roles;
