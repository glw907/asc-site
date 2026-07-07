-- mw-members verify: all SELECTs, so run via `--command` (per the migration mechanics
-- convention: `--file` silently switches to the bulk-import path for a write-only file and
-- returns no per-statement output). No specific member's name or email is named here on
-- purpose: unlike the ops-classes/ops-events importers, this import's source rows are real
-- people's PII, so this file stays structural (counts and distributions only). Field-by-field
-- spot checks against the source CSV are `mw-members.mjs --spot-check N`'s own job (run against
-- the real file locally, never committed) and this pass's own dispatch report, not this file.
--
--   VERIFY_SQL=$(grep -v '^--' scripts/import/mw-members.verify.sql | grep -v '^\s*$')
--   npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
--
-- Expect, matching the 146-row 2026-07-07 export exactly (`docs/mw-export-findings.md`):
-- households=146, members=146, memberships=146; tier family=68 individual=65 young-adult=13;
-- visibility visible=102 partial=39 hidden=5; the import.batch summary row's own detail column
-- carrying the same counts plus the payment-inference note.

SELECT 'households' AS check_name, COUNT(*) AS value FROM households
UNION ALL
SELECT 'members', COUNT(*) FROM members
UNION ALL
SELECT 'memberships', COUNT(*) FROM memberships;

SELECT tier, COUNT(*) AS n FROM memberships GROUP BY tier ORDER BY tier;

SELECT directory_visibility, COUNT(*) AS n FROM members GROUP BY directory_visibility ORDER BY directory_visibility;

SELECT action, entity, COUNT(*) AS n FROM audit_log WHERE actor = 'import:mw' GROUP BY action, entity ORDER BY action, entity;

SELECT detail FROM audit_log WHERE actor = 'import:mw' AND action = 'import.batch' ORDER BY created_at DESC LIMIT 1;
