-- mw-members verify (v2): all SELECTs, so run via `--command` (per the migration mechanics
-- convention: `--file` silently switches to the bulk-import path for a write-only file and
-- returns no per-statement output). No specific member's name or email is named here on
-- purpose: unlike the ops-classes/ops-events importers, this import's source rows are real
-- people's PII, so this file stays structural (counts, distributions, and boolean checks only).
--
--   VERIFY_SQL=$(grep -v '^--' scripts/import/mw-members.verify.sql | grep -v '^\s*$')
--   npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
--
-- Expected end state, per the 2026-07-13 full-history run (`docs/mw-export-findings.md`,
-- `mw-members.README.md`'s own "Deviation from the plan's estimate" note): households=148,
-- members=285 (286 source rows minus the one refused `Dog` sub-member row), every member row
-- carrying a non-NULL `mw_account_id`; memberships spanning seasons 2024-2026 with an exact count
-- that depends on refund netting and household/season collisions and is not asserted here (the
-- accounting export's own containment facts: 239 gross Membership rows minus whatever nets to
-- nothing minus collisions -- the run's own console output is the source of truth for the exact
-- number, not this file); 15 classes rows (5 already existing + 10 minted historical -- the
-- plan's own draft estimated 14, but a direct reconstruction of the real accounting export found
-- both 2024 and 2025 carry all five class types including Intermediate, for 15 total, not 14; see
-- the README's own deviation note); zero membership rows still `paid_at`-NULL (every net
-- Membership transaction supplies a real transaction date, retiring v1's renewal-date-as-paid_at
-- approximation).

SELECT 'households' AS check_name, COUNT(*) AS value FROM households
UNION ALL
SELECT 'members', COUNT(*) FROM members
UNION ALL
SELECT 'members_missing_mw_account_id', COUNT(*) FROM members WHERE mw_account_id IS NULL
UNION ALL
SELECT 'memberships', COUNT(*) FROM memberships
UNION ALL
SELECT 'membership_season_min', MIN(season) FROM memberships
UNION ALL
SELECT 'membership_season_max', MAX(season) FROM memberships
UNION ALL
SELECT 'memberships_missing_paid_at', COUNT(*) FROM memberships WHERE paid_at IS NULL
UNION ALL
SELECT 'classes', COUNT(*) FROM classes
UNION ALL
SELECT 'enrollments', COUNT(*) FROM class_enrollments;

SELECT tier, COUNT(*) AS n FROM memberships GROUP BY tier ORDER BY tier;

SELECT season, COUNT(*) AS n FROM classes GROUP BY season ORDER BY season;

SELECT directory_visibility, COUNT(*) AS n FROM members GROUP BY directory_visibility ORDER BY directory_visibility;

SELECT action, entity, COUNT(*) AS n FROM audit_log WHERE actor = 'import:mw' GROUP BY action, entity ORDER BY action, entity;

SELECT detail FROM audit_log WHERE actor = 'import:mw' AND action = 'import.batch' ORDER BY created_at DESC LIMIT 1;
