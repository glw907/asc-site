-- Verifies 0031_drop_waiver_text_version right after forward.sql: run via --command (a `--file`
-- run silently drops SELECT output; see 0005_member_domain/README.md's own Verify section for
-- why).
--
--   npx wrangler d1 execute asc-club --local --command "$(grep -v '^--' migrations/asc-club/0031_drop_waiver_text_version/verify-forward.sql)"
--
-- Expect zero rows: the key is gone.
SELECT key, value FROM settings WHERE key = 'waiver_text_version';
