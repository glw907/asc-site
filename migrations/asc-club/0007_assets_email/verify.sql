-- Run via --command (per the migration mechanics note: --file silently drops SELECT output for a
-- verify script). Strip the leading comment lines first (0005's own README names the reason: a
-- value starting with the two characters `--` makes wrangler's flag parser mistake the SQL for a
-- bare `--` terminator):
--   npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0007_assets_email/verify.sql)"
--
-- Expect six rows naming the new tables, plus a second query listing the six new indexes.
SELECT name FROM sqlite_master WHERE type = 'table'
  AND name IN ('asset_types', 'asset_assignments', 'asset_payments', 'asset_waitlist',
               'email_templates', 'email_log')
  ORDER BY name;

SELECT name FROM sqlite_master WHERE type = 'index'
  AND name IN ('idx_asset_assignments_type', 'idx_asset_assignments_membership',
               'idx_asset_payments_assignment', 'idx_asset_waitlist_type', 'idx_asset_waitlist_member')
  ORDER BY name;
