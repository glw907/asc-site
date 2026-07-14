-- Verifies 0023_membership_admin: `memberships.refunded_at` exists and every existing row
-- still reads NULL (a fresh migration touches no data), and `signup_review_resolutions` exists
-- with its full column set and CHECK vocabulary, empty.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0023_membership_admin/verify.sql
--
-- Expected: refunded_at_present = 1; refunded_at_null_count equals memberships' total row
-- count (every row still unrefunded); resolutions_sql's text contains "outcome" and
-- "'approved'" and "'denied'"; resolutions_row_count = 0.
SELECT COUNT(*) AS refunded_at_present FROM pragma_table_info('memberships') WHERE name = 'refunded_at';
SELECT
  (SELECT COUNT(*) FROM memberships WHERE refunded_at IS NULL) AS refunded_at_null_count,
  (SELECT COUNT(*) FROM memberships) AS memberships_total;
SELECT sql AS resolutions_sql FROM sqlite_master WHERE type = 'table' AND name = 'signup_review_resolutions';
SELECT COUNT(*) AS resolutions_row_count FROM signup_review_resolutions;
