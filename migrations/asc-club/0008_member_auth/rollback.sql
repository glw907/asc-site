-- Undoes 0008_member_auth/forward.sql. Safe only before any real member token, session, or
-- renewal-standing data exists (no member-portal write path has shipped yet as of this
-- migration).
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0008_member_auth/rollback.sql
DELETE FROM settings WHERE key = 'renewal_grace_days';
DROP TABLE IF EXISTS member_sessions;
DROP TABLE IF EXISTS member_tokens;
