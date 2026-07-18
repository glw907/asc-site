-- committee-seed verify: all SELECTs, so run via `--command` (the query path; `--file` silently
-- switches to the bulk-import path for a write-only file and returns no per-statement output,
-- per ops-assets.README.md's own note).
--
-- Expected once a full apply has landed every resolvable row: 7 committees (2 standing, 5
-- established), 4 officer member_positions rows plus however many director rows Geoff supplied
-- through committee-seed.resolutions.json, and 8 active committee_members rows (one chair per
-- committee, plus Membership & Events carrying both a chair and a co-chair). Every name resolved
-- at the 2026-07-18 import review (see the README's name-matching section), so a post-apply run
-- should hit those numbers exactly; the counts below still assert whatever has actually been
-- seeded, so a partial state reads as itself, not as a failure.

SELECT 'committees' AS check_name, COUNT(*) AS value FROM committees;
SELECT kind, COUNT(*) AS n FROM committees GROUP BY kind ORDER BY kind;
SELECT slug, name, sort_order FROM committees ORDER BY sort_order;

SELECT 'member_positions' AS check_name, COUNT(*) AS value FROM member_positions;
SELECT kind, COUNT(*) AS n FROM member_positions GROUP BY kind ORDER BY kind;

SELECT 'committee_members' AS check_name, COUNT(*) AS value FROM committee_members;
SELECT role, COUNT(*) AS n FROM committee_members GROUP BY role ORDER BY role;

-- Every committee_members row this seeder ever writes is 'active' -- it never plans a 'pending'
-- request (that is the T6b join-request flow's domain, not seeding).
SELECT COUNT(*) AS non_active_seeded_rows FROM committee_members
WHERE status <> 'active'
AND id IN (SELECT entity_id FROM audit_log WHERE actor = 'import:committee-seed' AND entity = 'committee_member');

-- The FK chain proof: every seeded committee_members/member_positions row resolves to a real
-- members row, no orphan.
SELECT COUNT(*) AS joined_committee_member_count
FROM committee_members cm JOIN members m ON m.id = cm.member_id
WHERE cm.id IN (SELECT entity_id FROM audit_log WHERE actor = 'import:committee-seed' AND entity = 'committee_member');

SELECT COUNT(*) AS joined_position_count
FROM member_positions mp JOIN members m ON m.id = mp.member_id
WHERE mp.id IN (SELECT entity_id FROM audit_log WHERE actor = 'import:committee-seed' AND entity = 'member_position');

-- The UNIQUE (committee_id, member_id) pair holds -- no duplicate committee_members row for any
-- one committee/member pair.
SELECT COUNT(*) AS duplicate_pairs FROM (
  SELECT committee_id, member_id, COUNT(*) AS n FROM committee_members
  GROUP BY committee_id, member_id HAVING n > 1
);

-- The import's own audit trail, one batch summary row per run.
SELECT action, entity, entity_id, detail FROM audit_log
WHERE actor = 'import:committee-seed' AND action = 'import.batch' AND entity = 'committee-seed'
ORDER BY id;
