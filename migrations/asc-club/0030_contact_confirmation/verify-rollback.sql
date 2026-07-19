-- Verifies 0030_contact_confirmation right after rollback.sql: run via --command.
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0030_contact_confirmation/verify-rollback.sql)"
--
-- Expect zero rows: the table is gone.
SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contact_confirmations';
