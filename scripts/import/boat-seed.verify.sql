-- boat-seed verify: all SELECTs, so run via `--command` (the query path; `--file` silently
-- switches to the bulk-import path for a write-only file and returns no per-statement output,
-- per ops-assets.README.md's own note).
--
-- Expected, matching the live asc-club data checked before this script was written: 30 active
-- boat-related asset assignments (19 boat_parking, 8 mooring, 3 small_boat), 12 of which
-- resolve to a solo household on their own; the rest await `boat-seed.resolutions.json`
-- entries and land here only once Geoff has resolved them. The counts below assert whatever
-- has actually been seeded so far, not a fixed target -- this seeder converges over several
-- runs as the resolutions file fills in.

SELECT 'boats' AS check_name, COUNT(*) AS value FROM boats;
SELECT model, COUNT(*) AS n FROM boats GROUP BY model ORDER BY model;
SELECT kept_on, COUNT(*) AS n FROM boats GROUP BY kept_on ORDER BY kept_on;

-- Every seeded boat's id follows the locked scheme (boat-<source assignment id>).
SELECT COUNT(*) AS non_conforming_id FROM boats WHERE id NOT LIKE 'boat-ops-assignment-%';

-- No boat has a missing or empty model (belt-and-suspenders on top of SQLite's own table-level
-- NOT NULL and CHECK; this only ever runs after a real insert already passed it).
SELECT COUNT(*) AS invalid_model FROM boats
WHERE model IS NULL OR model = '';

-- The FK chain proof: every boat's member_id resolves to a real members row, no orphan (an
-- inner join returning fewer rows than boats itself would mean a dangling reference).
SELECT COUNT(*) AS joined_boat_count
FROM boats b
JOIN members m ON m.id = b.member_id;

-- Every seeded boat's name is NULL, per the module's own locked rule (name capture starts
-- going forward, never backfilled from free text).
SELECT COUNT(*) AS named_boats FROM boats WHERE name IS NOT NULL;

-- The import's own audit trail, one batch summary row per run.
SELECT action, entity, entity_id, detail FROM audit_log
WHERE actor = 'import:boat-seed' AND action = 'import.batch' AND entity = 'boat'
ORDER BY id;
