-- Run via --command (--file silently drops SELECT output for a verify script):
--   npx wrangler d1 execute asc-club --remote --command "$(cat scripts/import/ops-classes-fee-correction/verify.sql)"
SELECT COUNT(*) AS still_placeholder FROM classes WHERE fee = 0;  -- expect 0
