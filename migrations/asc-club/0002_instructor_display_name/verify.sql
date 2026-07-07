-- Run via --command (per the migration mechanics note: --file silently drops SELECT output
-- for a verify script):
--   npx wrangler d1 execute asc-club --remote --command "$(cat migrations/asc-club/0002_instructor_display_name/verify.sql)"
--
-- Expect one row naming the new column (type TEXT, nullable); class_instructors itself is
-- still empty (no instructor is assigned yet, this pass's admin screen is what starts writing
-- it), so a plain SELECT * would show zero rows either way and prove nothing about the schema.
SELECT name, type, "notnull" FROM pragma_table_info('class_instructors') WHERE name = 'member_name';
