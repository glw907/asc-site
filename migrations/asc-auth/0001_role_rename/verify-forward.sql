-- Verifies 0001_role_rename right after forward.sql: run via --command (a `--file` run silently
-- drops SELECT output; see migrations/asc-club/0005_member_domain/README.md's own Verify section
-- for why).
--
--   npx wrangler d1 execute cairn-asc-auth --local --command "$(grep -v '^--' migrations/asc-auth/0001_role_rename/verify-forward.sql)"
--
-- Expect zero rows: no row is left reading either pre-migration role name.
SELECT role, COUNT(*) AS n FROM editor WHERE role IN ('owner', 'club-admin') GROUP BY role;
