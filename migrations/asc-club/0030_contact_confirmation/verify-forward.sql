-- Verifies 0030_contact_confirmation right after forward.sql: run via --command (a `--file` run
-- silently drops SELECT output; see 0005_member_domain/README.md's own Verify section for why).
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0030_contact_confirmation/verify-forward.sql)"
--
-- Expect one row naming the new table (contact_confirmations), then the twelve-column listing in
-- ordinal order, then row_count 0 on a fresh replica.
SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contact_confirmations';

SELECT name, "notnull" FROM pragma_table_info('contact_confirmations') ORDER BY cid;

SELECT count(*) AS row_count FROM contact_confirmations;
