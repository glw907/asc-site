-- Verifies 0031_drop_waiver_text_version right after rollback.sql: run via --command.
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0031_drop_waiver_text_version/verify-rollback.sql)"
--
-- Expect exactly one row: key='waiver_text_version', value='2026-01', updated_by='system'.
SELECT key, value, updated_by FROM settings WHERE key = 'waiver_text_version';
