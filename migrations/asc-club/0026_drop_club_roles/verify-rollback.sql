-- Verifies 0026_drop_club_roles after rollback.sql: run via `--file`.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0026_drop_club_roles/verify-rollback.sql
--
-- Expected: table_sql returns one row whose text matches forward.sql's own DDL exactly, and the
-- second query returns exactly one row -- email = "geoff-login@907.life", role = "owner",
-- granted_by = "system", granted_at = "2026-07-07 08:29:01".
SELECT sql AS table_sql FROM sqlite_master WHERE type = 'table' AND name = 'club_roles';
SELECT email, role, granted_by, granted_at FROM club_roles;
