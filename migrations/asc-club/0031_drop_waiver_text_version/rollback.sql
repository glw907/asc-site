-- Undoes 0031_drop_waiver_text_version/forward.sql: restores the `waiver_text_version` row with
-- its original seed value and `updated_by` (`0001_substrate/forward.sql`'s own seed insert). Safe
-- at any point: nothing writes this key going forward (`getWaiverTextVersion` is gone, and no
-- replacement writer exists), so a rollback can only ever restore the row to the value every live
-- read confirmed it still carried at deletion time (`source ~/.local/secrets && npx wrangler d1
-- execute asc-club --remote --command "SELECT * FROM settings WHERE key='waiver_text_version'"`,
-- run immediately before this migration was written: `2026-01`, `updated_by = 'system'`,
-- `updated_at = '2026-07-07 08:29:01'`, matching the seed exactly).
INSERT INTO settings (key, value, updated_at, updated_by) VALUES
  ('waiver_text_version', '2026-01', '2026-07-07 08:29:01', 'system');
