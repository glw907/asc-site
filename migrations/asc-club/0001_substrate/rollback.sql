-- Rollback for asc-club migration 0001_substrate. Drops in dependency order (each table
-- before anything it references), the reverse of forward.sql's creation order.

DROP INDEX IF EXISTS idx_waiver_acceptances_email;
DROP TABLE IF EXISTS waiver_acceptances;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS club_roles;
DROP TABLE IF EXISTS class_offers;
DROP TABLE IF EXISTS class_waitlist;
DROP INDEX IF EXISTS idx_enrollments_class;
DROP TABLE IF EXISTS class_enrollments;
DROP TABLE IF EXISTS class_instructors;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS events;
