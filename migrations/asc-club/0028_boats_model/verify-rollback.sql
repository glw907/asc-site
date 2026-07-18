-- Verifies 0028_boats_model after rollback.sql: run via --command, same recipe as
-- verify-forward.sql.
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0028_boats_model/verify-rollback.sql)"
--
-- Expect both `class` and `model` present, with `model` back to notnull = 0 (0027's
-- required-iff-Other shape).
SELECT name, "notnull" FROM pragma_table_info('boats')
  WHERE name IN ('model', 'class')
  ORDER BY name;
