-- ops-assets verify: all SELECTs, so run via `--command` (the query path; `--file` silently
-- switches to the bulk-import path for a write-only file and returns no per-statement output,
-- per Task 1's own README note).
--
-- Expected, matching the live asc-ops source read 2026-07-07: 4 asset types (mooring,
-- rv_parking, boat_parking, small_boat), 85 imported assignments (38 active, 47 released) out
-- of asc-ops's 90 total (5 held back for 3 unmatched holders -- see
-- ops-assets-unmatched.md, machine-local), 76 asset_payments rows (every imported assignment
-- whose payment_status was 'paid' or 'sent'), and 0 asset_waitlist rows (asc-ops carries no
-- non-class waitlist entry as of this import).

SELECT 'asset_types' AS check_name, COUNT(*) AS value FROM asset_types;
SELECT 'asset_assignments' AS check_name, COUNT(*) AS value FROM asset_assignments;
SELECT 'asset_payments' AS check_name, COUNT(*) AS value FROM asset_payments;
SELECT 'asset_waitlist' AS check_name, COUNT(*) AS value FROM asset_waitlist;

SELECT status, COUNT(*) AS n FROM asset_assignments GROUP BY status ORDER BY status;

SELECT id, name, fee, capacity, sort_order FROM asset_types ORDER BY sort_order;

-- The FK chain proof: every imported assignment resolves asset_type -> asset_types,
-- membership_id -> memberships -> households, with no orphan (an inner join returning fewer
-- rows than asset_assignments itself would mean a dangling reference).
SELECT COUNT(*) AS joined_assignment_count
FROM asset_assignments aa
JOIN asset_types at ON at.id = aa.asset_type
JOIN memberships m ON m.id = aa.membership_id
JOIN households h ON h.id = m.household_id;

-- Every asset_payments row resolves to a real asset_assignments row.
SELECT COUNT(*) AS joined_payment_count
FROM asset_payments ap
JOIN asset_assignments aa ON aa.id = ap.assignment_id;

-- The import's own audit trail, one batch summary row per run.
SELECT action, entity, entity_id, detail FROM audit_log
WHERE actor = 'import:ops' AND action = 'import.batch' AND entity = 'asset'
ORDER BY id;
