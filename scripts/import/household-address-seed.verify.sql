-- household-address-seed verify: all SELECTs, so run via `--command` (the query path; `--file`
-- silently switches to the bulk-import path for a write-only file and returns no per-statement
-- output, per ops-assets.README.md's own note).
--
--   VERIFY_SQL=$(grep -v '^--' scripts/import/household-address-seed.verify.sql | grep -v '^\s*$')
--   npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
--
-- Expected, matching the live asc-club data and export checked before this script was written:
-- 148 households, 146 with `address_line1`/`state`/`postal_code` filled once a full run has
-- applied (the 2 street-less rows, Leon Shellabarger and Michele Liu, stay NULL by design), and
-- `address_line2_set = 0` always -- this importer never has a source for line 2.

SELECT 'households' AS check_name, COUNT(*) AS value FROM households
UNION ALL
SELECT 'address_line1_filled', COUNT(*) FROM households WHERE address_line1 IS NOT NULL
UNION ALL
SELECT 'state_filled', COUNT(*) FROM households WHERE state IS NOT NULL
UNION ALL
SELECT 'postal_code_filled', COUNT(*) FROM households WHERE postal_code IS NOT NULL
UNION ALL
SELECT 'city_filled', COUNT(*) FROM households WHERE city IS NOT NULL;

-- This importer never sets address_line2; it has no source column for it.
SELECT COUNT(*) AS address_line2_set_by_this_importer
FROM audit_log
WHERE actor = 'import:household-address' AND action = 'import.update' AND detail LIKE '%address_line2%';

-- The import's own audit trail, one batch summary row per run.
SELECT action, entity, entity_id, detail FROM audit_log
WHERE actor = 'import:household-address' AND action = 'import.batch' AND entity = 'household'
ORDER BY id;
