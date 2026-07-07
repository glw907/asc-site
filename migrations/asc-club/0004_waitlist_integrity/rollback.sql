-- Undoes 0004_waitlist_integrity/forward.sql. Safe any time: dropping an index never discards
-- data, only the constraint and the lookup speed-up. Once real waitlist rows exist, a rollback
-- reopens the same-person-same-class double-waitlist race `forward.sql`'s own header describes;
-- re-running `forward.sql` afterward re-checks the live data for a duplicate the same way.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0004_waitlist_integrity/rollback.sql
DROP INDEX idx_waitlist_class;
DROP INDEX idx_offers_waitlist;
DROP INDEX uq_waitlist_class_email;
