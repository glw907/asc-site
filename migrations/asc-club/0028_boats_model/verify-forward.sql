-- Verifies 0028_boats_model right after forward.sql: run via --command (a `--file` run
-- silently drops SELECT output; see 0005_member_domain/README.md's own Verify section for why).
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0028_boats_model/verify-forward.sql)"
--
-- Expect one row for `model` (notnull = 1) and no row for `class` (dropped).
SELECT name, "notnull" FROM pragma_table_info('boats')
  WHERE name IN ('model', 'class')
  ORDER BY name;
