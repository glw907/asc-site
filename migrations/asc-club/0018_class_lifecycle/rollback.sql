-- Undoes 0018_class_lifecycle/forward.sql. Dropping the column discards any drop-in flags an
-- admin has set since (the same caveat 0003's rollback documents), and deleting the settings
-- row discards a configured registration-opens date.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0018_class_lifecycle/rollback.sql
ALTER TABLE classes DROP COLUMN drop_in;
DELETE FROM settings WHERE key = 'class_registration_opens';
