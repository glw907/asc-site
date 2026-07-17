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
-- asset_payments references asset_assignments (0007_assets_email); portal-seed.sql (applied
-- right after this file) is the first fixture in this pipeline to write asset_payments rows, so
-- a warm workstation replica's second run needs this delete ahead of asset_assignments' own, or
-- the local FK-enforcing replica refuses that delete with "FOREIGN KEY constraint failed".
DELETE FROM asset_payments;
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

-- Two fixture members for the Turnstile-hardening pass's own visual suite (site-visual.spec.ts's
-- "class signup — enrolled/renew" tests, 2026-07-15): the class-door standing gate
-- (class-signup-form.ts's own resolveClassEligibility) needs a real 'current' and a real
-- 'lapsed' household to reach the payClassFee and requestRenewLink widgets respectively (both
-- render only after a class-signup submission, never on a bare GET). `datetime('now', '-60
-- days')` computes relative to whenever this fixture is seeded (every e2e run), so the current
-- member's standing never goes stale the way a fixed calendar date would (matches
-- events-seed.sql's own "must be refreshed" caveat, avoided here by computing instead of hard-
-- coding). Distinct emails from join-and-class-door.spec.ts's own dynamically-created fixtures
-- (pat.purchaser@example.com, casey.classdoor@example.com), so neither suite's rows collide.
INSERT INTO households (id, name, primary_member_id) VALUES ('e2e-current-hh', 'E2E Current Household', NULL);
INSERT INTO members (id, household_id, name, email) VALUES ('e2e-current-member', 'e2e-current-hh', 'E2E Current Member', 'e2e-current-member@example.com');
UPDATE households SET primary_member_id = 'e2e-current-member' WHERE id = 'e2e-current-hh';
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at)
  VALUES ('e2e-current-ms', 'e2e-current-hh', 2026, 'individual', 250, datetime('now', '-60 days'));

INSERT INTO households (id, name, primary_member_id) VALUES ('e2e-lapsed-hh', 'E2E Lapsed Household', NULL);
INSERT INTO members (id, household_id, name, email) VALUES ('e2e-lapsed-member', 'e2e-lapsed-hh', 'E2E Lapsed Member', 'e2e-lapsed-member@example.com');
UPDATE households SET primary_member_id = 'e2e-lapsed-member' WHERE id = 'e2e-lapsed-hh';
-- No memberships row at all: resolveClassEligibility answers 'lapsed' for a household with no
-- paid membership ever, the same as a household whose one membership has never been paid.

-- One pending waitlist offer for the offer claim/decline page's own visual test: the token is the
-- lowercase hex SHA-256 of the plaintext 'fixture-offer-token' (offers.ts's own hashOfferToken
-- shape), computed once and hard-coded here since this seed runs as plain SQL, with no access to
-- the app's own crypto.subtle.digest call.
--
-- A DEDICATED, invisible class (`visible = 0`), never `test-intro-class`: `isPubliclyOpen`
-- (classes-store.ts) reads a class as closed the moment its `class_waitlist` count is nonzero
-- regardless of open capacity, which flows into both the /events registration-status badge
-- (events-data.ts's own CASE) and the class-signup page's own "Sign up" vs "Join the waitlist"
-- button text. A waitlist row against the shared `test-intro-class` fixture broke both
-- `events — light` (unrelated baseline drift) and the enrolled-state visual test below (the
-- "Sign up" button text flipped) the first time this fixture was written; `visible = 0` also
-- keeps this class off the /events listing entirely, so it can never collide with any other
-- fixture assertion again.
INSERT INTO classes (id, season, name, slug, track, capacity, fee, visible)
  VALUES ('e2e-offer-class', 2026, 'E2E Offer Fixture Class', 'e2e-offer-fixture-class', 'adult-teen', 4, 0, 0);
INSERT INTO class_waitlist (id, class_id, applicant_name, applicant_email, position)
  VALUES ('e2e-offer-waitlist', 'e2e-offer-class', 'E2E Offer Applicant', 'e2e-offer-applicant@example.com', 1);
-- A FIXED far-future expiry, not datetime('now', '+1 day'): the offer page renders this value
-- through `formatExpiry` with `timeStyle: 'short'`, so a relative-to-seed-time expiry shifts the
-- rendered clock time on every run and flakes the `class offer` visual baseline. A fixed
-- timestamp keeps the offer unexpired (well past every 2026 season run) and renders the same
-- pixels every run. Update the year alongside the season fixtures if the suite is ever rebased
-- past it.
INSERT INTO class_offers (token, waitlist_id, class_id, offered_by, expires_at)
  VALUES ('083c4172444fdb72a01dd607d989e50d3306543b3cc7f1a21997f8c166f0003a', 'e2e-offer-waitlist', 'e2e-offer-class', 'e2e-fixture', '2027-06-01 12:00:00');
