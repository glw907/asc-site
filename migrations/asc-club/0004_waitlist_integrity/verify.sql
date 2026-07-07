-- Run via --command (per the migration mechanics note: --file silently drops SELECT output for a
-- verify script):
--   npx wrangler d1 execute asc-club --remote --command "$(cat migrations/asc-club/0004_waitlist_integrity/verify.sql)"
--
-- Expect three rows naming the new indexes.
SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('idx_waitlist_class', 'idx_offers_waitlist', 'uq_waitlist_class_email');
