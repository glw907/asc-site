-- Verifies 0026_drop_club_roles right after forward.sql: run via `--file`.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0026_drop_club_roles/verify-forward.sql
--
-- Expected: no row (the table is gone). This only checks sqlite_master, so it never throws on a
-- successful forward apply, unlike a query against `club_roles` itself, which would error the
-- moment the table no longer exists. See verify-rollback.sql for the row-content check, which
-- only makes sense once rollback.sql has recreated the table.
SELECT sql AS table_sql FROM sqlite_master WHERE type = 'table' AND name = 'club_roles';
