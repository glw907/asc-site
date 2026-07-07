-- Undoes 0007_assets_email/forward.sql. Drops in reverse dependency order (a table's own
-- referencing tables first) so no DROP ever leaves a dangling structural reference mid-rollback,
-- even though SQLite does not enforce that on DROP TABLE itself. Indexes are dropped implicitly
-- with their own table; no separate DROP INDEX statements are needed.
--
-- Safe only before any real asset or email data exists, since this discards rows, not just
-- structure: neither domain has an admin screen or write path yet (both are later passes' own
-- work), so this is expected to always be true until pass 2.3/2.4 lands.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0007_assets_email/rollback.sql
DROP TABLE email_log;
DROP TABLE email_templates;
DROP TABLE asset_waitlist;
DROP TABLE asset_payments;
DROP TABLE asset_assignments;
DROP TABLE asset_types;
