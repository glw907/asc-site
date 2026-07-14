-- Verifies 0020_mw_provenance: the column and its partial unique index both exist, and no
-- two members share a non-NULL mw_account_id.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0020_mw_provenance/verify.sql
--
-- Expected: has_column = 1; has_index = 1; duplicate_account_ids = 0.
SELECT COUNT(*) AS has_column FROM pragma_table_info('members') WHERE name = 'mw_account_id';
SELECT COUNT(*) AS has_index FROM sqlite_master WHERE type = 'index' AND name = 'idx_members_mw_account';
SELECT COUNT(*) AS duplicate_account_ids FROM (
  SELECT mw_account_id FROM members WHERE mw_account_id IS NOT NULL
  GROUP BY mw_account_id HAVING COUNT(*) > 1
);
