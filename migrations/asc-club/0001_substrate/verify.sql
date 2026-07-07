-- Verification for asc-club migration 0001_substrate. Run after forward.sql; a human compares
-- this output against the expectations noted alongside each query.

-- Expected table list (10 rows): audit_log, class_enrollments, class_instructors,
-- class_offers, class_waitlist, classes, club_roles, events, settings, waiver_acceptances.
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;

-- Expected: exactly 3 rows (current_season/2026, offer_window_hours/72, waiver_text_version/2026-01).
SELECT 'settings_count' AS check_name, COUNT(*) AS n FROM settings;
SELECT key, value FROM settings ORDER BY key;

-- Expected: exactly 1 row (geoff-login@907.life, owner).
SELECT 'club_roles_count' AS check_name, COUNT(*) AS n FROM club_roles;
SELECT email, role FROM club_roles;

-- Expected: exactly 2 rows, the seed's own audit trail (settings, club_roles).
SELECT 'audit_log_count' AS check_name, COUNT(*) AS n FROM audit_log;
SELECT actor, action, entity, entity_id FROM audit_log ORDER BY id;

-- Every domain table exists and starts empty; Task 2's import lands the first real rows.
SELECT 'events_count' AS check_name, COUNT(*) AS n FROM events;
SELECT 'classes_count' AS check_name, COUNT(*) AS n FROM classes;
SELECT 'class_instructors_count' AS check_name, COUNT(*) AS n FROM class_instructors;
SELECT 'class_enrollments_count' AS check_name, COUNT(*) AS n FROM class_enrollments;
SELECT 'class_waitlist_count' AS check_name, COUNT(*) AS n FROM class_waitlist;
SELECT 'class_offers_count' AS check_name, COUNT(*) AS n FROM class_offers;
SELECT 'waiver_acceptances_count' AS check_name, COUNT(*) AS n FROM waiver_acceptances;
