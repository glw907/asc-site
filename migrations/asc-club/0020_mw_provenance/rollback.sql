-- Undoes 0020_mw_provenance/forward.sql. Dropping the column discards any MW account ids
-- already backfilled (the same caveat 0003's, 0018's, and 0019's rollbacks document); a
-- re-import from the committed archive is the recovery path.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0020_mw_provenance/rollback.sql
DROP INDEX idx_members_mw_account;
ALTER TABLE members DROP COLUMN mw_account_id;
