-- Undoes 0023_membership_admin/forward.sql. Dropping `refunded_at` discards any refund marks
-- already recorded (the same caveat 0020's own rollback documents for its own added column);
-- dropping `signup_review_resolutions` discards any resolution rows. Safe only before either
-- has recorded a real row.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0023_membership_admin/rollback.sql
DROP INDEX idx_signup_review_resolutions_membership;
DROP TABLE signup_review_resolutions;
ALTER TABLE memberships DROP COLUMN refunded_at;
