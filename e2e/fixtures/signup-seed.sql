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
UPDATE households SET primary_member_id = NULL;
DELETE FROM credit_redemptions;
DELETE FROM credit_grants;
DELETE FROM waiver_acceptances;
DELETE FROM memberships;
DELETE FROM members;
DELETE FROM households;
