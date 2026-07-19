-- Verifies 0001_role_rename right after rollback.sql: run via --command.
--
--   npx wrangler d1 execute cairn-asc-auth --local --command "$(grep -v '^--' migrations/asc-auth/0001_role_rename/verify-rollback.sql)"
--
-- Expect zero rows: no row is left reading either post-migration role name. (This checks the
-- whole table's current shape, the same limit rollback.sql's own header notes: it cannot
-- distinguish a row forward.sql itself renamed from one freshly granted under the new name after
-- forward.sql ran -- both come back at rollback, which is the correct, general behavior for a
-- WHERE-scoped data migration.)
SELECT role, COUNT(*) AS n FROM editor WHERE role IN ('Administrator', 'Club manager') GROUP BY role;
