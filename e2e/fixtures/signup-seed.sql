-- Clears the member/household/membership domain before every e2e run, so the join and
-- class-door specs (e2e/join-and-class-door.spec.ts) always start from a known-empty state: a
-- purchaser or class-door email that a previous run's join happy path already claimed would
-- otherwise pivot into the renewal handoff instead of the fresh-join path this fixture's own
-- tests exercise. Mirrors events-seed.sql's own "the local D1 replica is disposable test fixture
-- data" convention -- DELETE, never DROP/CREATE, since bootstrap-club-db.mjs has already applied
-- the real asc-club schema before this file ever runs.
--
-- `households` and `members` reference each other (`households.primary_member_id` ->
-- `members.id`, `members.household_id` -> `households.id`), so no DELETE order clears both
-- without tripping the other's FK -- unlike real (remote) D1, which does not enforce foreign
-- keys by default (the migrations' own header comments), the local miniflare/sqlite replica
-- this suite runs against does, and `wrangler d1 execute --file`'s own batching does not honor a
-- `PRAGMA foreign_keys = OFF` across the rest of the file's statements. Nulling the household
-- side of the cycle first breaks it without disabling any constraint.
-- The clear covers the full FK closure onto members/memberships/households (not just the
-- rows the join specs write): a warm workstation replica can hold enrollments, sessions, or
-- ledger lines from local admin work (a render read, a manual signup test), and any one of
-- them blocks the member deletes below under the local replica's FK enforcement. Children
-- delete before their parents throughout.
UPDATE households SET primary_member_id = NULL;
DELETE FROM class_reminders_sent;
DELETE FROM credit_redemptions;
DELETE FROM transaction_lines;
DELETE FROM transactions;
DELETE FROM class_offers;
DELETE FROM class_waitlist;
DELETE FROM asset_requests;
DELETE FROM class_enrollments;
DELETE FROM class_instructors;
DELETE FROM asset_waitlist;
DELETE FROM asset_assignments;
DELETE FROM member_tokens;
DELETE FROM member_sessions;
DELETE FROM email_log;
DELETE FROM waiver_acceptances;
DELETE FROM credit_grants;
DELETE FROM signup_review_resolutions;
DELETE FROM processed_stripe_sessions;
DELETE FROM renewal_reminders_sent;
DELETE FROM memberships;
DELETE FROM members;
DELETE FROM households;
