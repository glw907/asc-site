-- Verifies 0018_class_lifecycle: the column exists with its default and CHECK holding, the
-- one known drop-in row is flagged, and the settings key is present.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0018_class_lifecycle/verify.sql
--
-- Expected: one row per SELECT; drop_in_flagged = 'fleet_tuneup', others_default = 0 rows
-- with drop_in <> 0 outside fleet_tuneup, and the settings row present.
SELECT id AS drop_in_flagged FROM classes WHERE drop_in = 1;
SELECT COUNT(*) AS others_nonzero FROM classes WHERE drop_in <> 0 AND id <> 'fleet_tuneup';
SELECT key, value FROM settings WHERE key = 'class_registration_opens';
