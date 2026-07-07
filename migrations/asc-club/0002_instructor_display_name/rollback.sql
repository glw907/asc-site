-- Undoes 0002_instructor_display_name/forward.sql. Safe any time before a real assignment
-- exists; once `class_instructors.member_name` carries real data, dropping the column
-- discards it (there is no separate table to fall back to, since 0001 never gave one a
-- display-name column at all).
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0002_instructor_display_name/rollback.sql
ALTER TABLE class_instructors DROP COLUMN member_name;
