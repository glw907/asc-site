-- Run via --command (0005's own README names the reason: --file silently drops SELECT output
-- for a verify script; a value starting with the two characters `--` also makes wrangler's flag
-- parser mistake the SQL for a bare `--` terminator, so the leading comment lines are stripped
-- before this file is passed through):
--   npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0008_member_auth/verify.sql | grep -v '^\s*$')"
--
-- Expect two rows naming the new tables, then four rows naming the new indexes, then one row
-- showing the seeded renewal_grace_days setting.
SELECT name FROM sqlite_master WHERE type = 'table'
  AND name IN ('member_tokens', 'member_sessions')
  ORDER BY name;

SELECT name FROM sqlite_master WHERE type = 'index'
  AND name IN ('idx_member_tokens_member', 'idx_member_tokens_expiry',
               'idx_member_sessions_member', 'idx_member_sessions_expiry')
  ORDER BY name;

SELECT key, value FROM settings WHERE key = 'renewal_grace_days';
