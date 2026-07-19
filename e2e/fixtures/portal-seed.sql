-- Fixture data for the member-portal e2e smoke (e2e/portal-session.spec.ts) and the T5 visual
-- spec (e2e/portal-visual.spec.ts) built on top of it: two deterministic households a minted
-- `member_sessions` row (e2e/helpers/member-session.ts) can sign in as, with real data behind
-- every landing-page section (standing, household, assets, receipts, credits). The Wright
-- household below stands in for the `in-season-needs-you` state (it always carries a real
-- outstanding fee, on purpose); the Sterling household further down stands in for
-- `in-season-clear` (see that block's own comment for why a second household, not a mutation of
-- the first). Wired into e2e/fixtures/bootstrap-club-db.mjs's own seed list, applied AFTER
-- signup-seed.sql (that file's own household/member/membership deletes are blanket and
-- unconditional, so this file's rows would be wiped right back out if it ran first).
--
-- EVERY DATE BELOW IS A FIXED LITERAL, never `datetime('now', ...)`: the offer-fixture lesson
-- (docs/STATUS.md, this repo's own memory) is that a now()-relative fixture makes a visual
-- baseline diff against tomorrow's render, since the rendered date text or the derived standing
-- state shifts under it. The one necessary exception is the session row's own `expires_at`,
-- which is computed at mint time in member-session.ts, not written here.
--
-- Every id is prefixed `portal-`, so this file only ever touches its own rows (scoped deletes
-- below), safe to re-run against a warm workstation replica without disturbing signup-seed.sql's
-- or membership-admin-seed.sql's own fixture rows. Deletes go child-before-parent through the FK
-- closure: waiver_acceptances/transaction_lines -> transactions, then asset_payments ->
-- asset_waitlist/asset_assignments -> credit_grants/asset_types -> memberships -> (household's
-- own primary_member_id nulled) -> members -> households.
DELETE FROM waiver_acceptances WHERE id LIKE 'portal-%';
DELETE FROM transaction_lines WHERE id LIKE 'portal-%';
DELETE FROM transactions WHERE id LIKE 'portal-%';
DELETE FROM asset_payments WHERE id LIKE 'portal-%';
DELETE FROM asset_waitlist WHERE id LIKE 'portal-%';
DELETE FROM asset_assignments WHERE id LIKE 'portal-%';
DELETE FROM credit_grants WHERE id LIKE 'portal-%';
DELETE FROM asset_types WHERE id LIKE 'portal-%';
DELETE FROM memberships WHERE id LIKE 'portal-%';
UPDATE households SET primary_member_id = NULL WHERE id LIKE 'portal-%';
DELETE FROM members WHERE id LIKE 'portal-%';
DELETE FROM households WHERE id LIKE 'portal-%';

-- The household: a primary member plus one covered household member (2 members total), matching
-- the portal landing's household card and its "needs you" shapes (0005_member_domain's own "a
-- covered child may have none" note covers Sam Wright's null email below).
INSERT INTO households (id, name, primary_member_id) VALUES ('portal-hh-wright', 'Wright household', NULL);
INSERT INTO members (id, household_id, name, email, phone, directory_visibility) VALUES
  ('portal-mem-primary', 'portal-hh-wright', 'Geoff Wright', 'e2e-member@aksailingclub.org', NULL, 'visible'),
  ('portal-mem-second', 'portal-hh-wright', 'Sam Wright', NULL, NULL, 'partial');
UPDATE households SET primary_member_id = 'portal-mem-primary' WHERE id = 'portal-hh-wright';

-- A PAID individual-tier 2026 membership. `paid_at` is fixed at 2026-05-17, which is doing two
-- jobs at once.
--
-- FIDELITY: standing derives as paid_at plus one year (src/member-auth/lib/standing.ts's own
-- rolling math), so this household reads "current through May 17, 2027" -- the ratified mock D's
-- own standing sentence, verbatim (docs/design-benchmark/portal-mock-d/). The visual baseline is
-- therefore directly comparable to the reference the owner approved, rather than to a plausible
-- but unrelated date.
--
-- DRIFT: fixed literals alone do NOT make this fixture deterministic. Standing compares against
-- the real server clock, so the household's DERIVED state moves even though its stored dates do
-- not: 60 days before expiry it crosses into the renewal window (portal-state.ts's own
-- RENEWAL_WINDOW_DAYS) and the landing silently switches to the renewal masthead, changing the
-- baseline for reasons no diff would explain. paid_at is therefore chosen as late as is honest
-- (never future-dated relative to the season) to buy the longest runway:
--
--   THIS FIXTURE READS 'current'/routine UNTIL 2027-03-18, AND MUST BE REFRESHED BEFORE THEN.
--
-- e2e/portal-session.spec.ts asserts the routine state explicitly, so the crossing fails loudly
-- with a legible assertion rather than as a mystery pixel diff; the fix is to bump this date.
-- `current_season` is 2026 (0001_substrate's own seed), matching this row's `season`.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at)
  VALUES ('portal-ms-2026', 'portal-hh-wright', 2026, 'individual', 250, '2026-05-17 00:00:00');

-- Three asset types, named EXACTLY as the live club names them (checked against asc-club
-- 2026-07-16; the live vocabulary is Mooring, Trailered Boat Parking, Long-Term RV Parking, and
-- Small Boat Rack). Mock D says "Gear locker", and no such type exists: seeding an invented short
-- label would be a fixture lying about production in the direction that flatters us.
--
-- The label LENGTH is the load-bearing part, not just the wording. The action row renders
-- "{type} fee outstanding", so production's real worst case is "Trailered Boat Parking fee
-- outstanding" -- half again longer than the mock's "Gear locker fee outstanding". The mobile
-- action row's mid-phrase wrap is the named defect this redesign exists to fix, so the fixture
-- must stress it with the longest string a member can actually see, or the fix gets verified
-- against a string production never renders.
INSERT INTO asset_types (id, name, fee, capacity, sort_order) VALUES
  ('portal-at-mooring', 'Mooring', 150, NULL, 10),
  ('portal-at-trailer', 'Trailered Boat Parking', 150, NULL, 20),
  ('portal-at-rv', 'Long-Term RV Parking', 100, NULL, 30);

-- The mooring: an active assignment, PAID for the current season -- listHouseholdAssignments
-- (src/member-portal/lib/assets.ts) reads paymentStanding 'paid' once a matching-season
-- asset_payments row carries a non-null paid_at.
-- The description is 'Sailboat', NOT a slot identifier like the mock's "B-Dock slip 12".
-- Mock D and the spec both assumed `description` carries a slot id; it does not. Checked against
-- all 40 live assignments (2026-07-16): every value is free text about the member's own boat or
-- vehicle, in inconsistent register -- "Sailboat", "sailboat", "BUCC", "DINGY", 'Purple Buccaneer
-- 18 "Dionysus"'. There is no slot identifier anywhere in that column.
--
-- This fixture must carry REAL-SHAPED data, not the mock's imagined shape. A fixture that invents
-- a tidy slot id makes the visual baseline look correct while production renders the awkward real
-- string, so the verification would hide the very defect it exists to catch (it already hid one:
-- valueMirror concatenated type + description into "Mooring Sailboat" until this was found).
INSERT INTO asset_assignments (id, asset_type, membership_id, description, status)
  VALUES ('portal-aa-mooring', 'portal-at-mooring', 'portal-ms-2026', 'Sailboat', 'active');
-- paid_at 2026-06-20 is mock D's own second-receipt date, kept here so the mooring itself still
-- reads PAID for the current season (listHouseholdAssignments' own paymentStanding, unrelated to
-- receipts since T1b: receipts now read the money ledger below, not this table).
INSERT INTO asset_payments (id, assignment_id, season, amount, paid_at, method)
  VALUES ('portal-ap-mooring', 'portal-aa-mooring', 2026, 150, '2026-06-20 00:00:00', 'card');

-- The trailered boat parking: an active assignment with an OUTSTANDING fee (paid_at left NULL).
-- This is the landing's one weighted action row, and mock D's "Gear locker" stands in for it.
-- 'BUCC' is a real live description verbatim (a Buccaneer 18); members really do enter terse
-- all-caps shorthand here, and the rail's two-line row has to hold it without looking broken.
INSERT INTO asset_assignments (id, asset_type, membership_id, description, status)
  VALUES ('portal-aa-trailer', 'portal-at-trailer', 'portal-ms-2026', 'BUCC', 'active');
INSERT INTO asset_payments (id, assignment_id, season, amount, paid_at, method)
  VALUES ('portal-ap-trailer', 'portal-aa-trailer', 2026, 150, NULL, NULL);

-- One waitlist entry, so the rail's own "Waitlist" chip row has real data too.
INSERT INTO asset_waitlist (id, asset_type, member_id, position, requested_at)
  VALUES ('portal-aw-rv', 'portal-at-rv', 'portal-mem-second', 1, '2026-03-01 00:00:00');

-- One available class credit (grants minus redemptions; no redemption row below, so the balance
-- reads 1 -- credits.ts's own computed-never-stored ledger).
INSERT INTO credit_grants (id, household_id, membership_id, credits, granted_at)
  VALUES ('portal-cg-1', 'portal-hh-wright', 'portal-ms-2026', 1, '2026-05-17 00:00:00');

-- Receipts (src/member-portal/lib/receipts.ts reads the money ledger, migration
-- 0021_money_ledger, since T1b): two real `transactions`/`transaction_lines` rows, one per mock
-- D receipt. The dues charge mirrors the membership row above (same $250, same 2026-05-17 date);
-- the second is a real class-fee charge at mock D's own second-receipt date and amount ($150,
-- 2026-06-20), which this schema could not express before 0021 landed (class_enrollments.fee_paid
-- is a 0/1 flag carrying no paid_at and no amount) -- unlike the union it replaces, the ledger can
-- express this directly, so it no longer needs the mooring's own paid fee to stand in for it. No
-- class_enrollments row is seeded for the class-fee line: `enrollment_id` is nullable (at most
-- one of the ledger's three domain references may be set, `0021_money_ledger`'s own header), and
-- the receipts list reads a line's `description` text, never its domain reference.
--
-- A DUES LINE'S DESCRIPTION CARRIES NO SEASON. `receipts.ts`'s own `lineLabel` appends the season
-- from the membership FK, so embedding "(2026)" in the stored text here renders "Membership dues
-- (2026) (2026)". Verified against the live ledger 2026-07-16: all 236 dues lines read exactly
-- "Membership dues" (220) or "Membership dues (comp)" (16), never a season. Mock D's own receipt
-- row reads "Membership dues 2026", which is the RENDERED label, not the stored text -- seeding
-- the rendered label reproduces the mock while breaking the invariant the real write paths keep.
INSERT INTO transactions (id, kind, source, occurred_at, amount_total_cents, household_id)
  VALUES ('portal-tx-dues', 'charge', 'stripe', '2026-05-17 00:00:00', 25000, 'portal-hh-wright');
INSERT INTO transaction_lines (id, transaction_id, item, description, amount_cents, membership_id)
  VALUES ('portal-tl-dues', 'portal-tx-dues', 'dues', 'Membership dues', 25000, 'portal-ms-2026');

INSERT INTO transactions (id, kind, source, occurred_at, amount_total_cents, household_id)
  VALUES ('portal-tx-class', 'charge', 'stripe', '2026-06-20 00:00:00', 15000, 'portal-hh-wright');
INSERT INTO transaction_lines (id, transaction_id, item, description, amount_cents)
  VALUES ('portal-tl-class', 'portal-tx-class', 'class-fee', 'Class fee', 15000);

-- Signature rows for both real season-2026 documents T1 published (general-release,
-- rules-acknowledgement; both `audience: all-members`, so `deriveHouseholdRequirements` requires
-- one from EVERY adult member individually, never satisfiable by another adult's own signature --
-- `waiver-requirements.ts`'s own rule 2). Before T1, this fixture carried none and the requirement
-- engine derived nothing to sign; now that real documents are live, an unsigned household would
-- grow a "documents need your signature" row on `/my-account` and the visual baselines above would
-- drift out from under this file with no fixture change of their own.
--
-- Neither household owes a document at the asset-kind scope: `portal-at-mooring`/`portal-at-
-- trailer`/`portal-at-rv` above are fixture-prefixed PLACEHOLDER ids, not the real `asset_types.id`
-- values (`mooring`, `rv_parking`, `boat_parking`, `small_boat`) the requirement engine's own
-- `AssetKind` cast matches a document's `audience` against (`waivers-seed.sql`'s own header names
-- this identical gap for its own mooring fixture row, which deliberately uses the real id instead).
-- So no household-scope document (the mooring/RV/boat-parking/rack acknowledgements, or the Dry
-- Storage Agreement) is ever derived as a requirement here -- confirmed, not assumed, by
-- `src/tests/portal-fixture-waiver-requirements.test.ts`, which loads this exact fixture shape and
-- the real published corpus and asserts zero outstanding requirements for both households.
--
-- Sam Wright has no email on file (this file's own household comment above): `person_email` is a
-- fixture placeholder distinct from Geoff Wright's own, since the schema's `NOT NULL` demands some
-- value and the requirement engine matches a signature by `member_id`, never by this column.
INSERT INTO waiver_acceptances
  (id, document_id, version, season, kind, content_hash, content_snapshot, person_name, person_email, context, signed_at, member_id, minor_member_id)
VALUES
  ('portal-wa-primary-release', 'general-release', 1, 2026, 'release',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 general-release text.',
   'Geoff Wright', 'e2e-member@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-primary', NULL),
  ('portal-wa-primary-rules', 'rules-acknowledgement', 1, 2026, 'acknowledgement',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 rules-acknowledgement text.',
   'Geoff Wright', 'e2e-member@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-primary', NULL),
  ('portal-wa-second-release', 'general-release', 1, 2026, 'release',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 general-release text.',
   'Sam Wright', 'e2e-member-second@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-second', NULL),
  ('portal-wa-second-rules', 'rules-acknowledgement', 1, 2026, 'acknowledgement',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 rules-acknowledgement text.',
   'Sam Wright', 'e2e-member-second@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-second', NULL);

-- A SECOND deterministic household (T5, portal-redesign): the landing's `in-season-clear` state
-- needs a household with a paid, in-window standing but ZERO real "Needs your attention" rows --
-- the Wright household above always carries the trailered-parking outstanding fee on purpose (the
-- mid-phrase-wrap stress case), so it can never also stand in for the all-clear moment without
-- breaking the fixture-drift guard `e2e/portal-session.spec.ts` already asserts against it. A
-- second household, not a mutation of the first, keeps both states independently seedable.
--
-- Same `paid_at` as the Wright household (2026-05-17): identical standing math, so this household
-- reads the identical "current through May 17, 2027" sentence and carries the same drift runway
-- (portal-seed.sql's own DRIFT note above applies here unchanged).
--
-- No `asset_assignments`, `asset_waitlist`, or request rows at all: `buildActionRows` therefore
-- returns an empty list regardless of `assets.ts`'s own logic, so this household's
-- "Needs your attention" section is empty by construction, not by a coincidence a later fixture
-- edit could silently break.
INSERT INTO households (id, name, primary_member_id) VALUES ('portal-hh-clear', 'Sterling household', NULL);
INSERT INTO members (id, household_id, name, email, phone, directory_visibility) VALUES
  ('portal-mem-clear', 'portal-hh-clear', 'Alex Sterling', 'e2e-member-clear@aksailingclub.org', NULL, 'visible');
UPDATE households SET primary_member_id = 'portal-mem-clear' WHERE id = 'portal-hh-clear';

INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at)
  VALUES ('portal-ms-clear-2026', 'portal-hh-clear', 2026, 'individual', 250, '2026-05-17 00:00:00');

-- One receipt, so the all-clear render still shows a real "Recent receipts" row rather than an
-- artificially bare one.
INSERT INTO transactions (id, kind, source, occurred_at, amount_total_cents, household_id)
  VALUES ('portal-tx-clear-dues', 'charge', 'stripe', '2026-05-17 00:00:00', 25000, 'portal-hh-clear');
INSERT INTO transaction_lines (id, transaction_id, item, description, amount_cents, membership_id)
  VALUES ('portal-tl-clear-dues', 'portal-tx-clear-dues', 'dues', 'Membership dues', 25000, 'portal-ms-clear-2026');

-- Both real season-2026 documents for the household's own sole member, for the identical reason
-- as the Wright household's own waiver_acceptances rows above.
INSERT INTO waiver_acceptances
  (id, document_id, version, season, kind, content_hash, content_snapshot, person_name, person_email, context, signed_at, member_id, minor_member_id)
VALUES
  ('portal-wa-clear-release', 'general-release', 1, 2026, 'release',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 general-release text.',
   'Alex Sterling', 'e2e-member-clear@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-clear', NULL),
  ('portal-wa-clear-rules', 'rules-acknowledgement', 1, 2026, 'acknowledgement',
   '0000000000000000000000000000000000000000000000000000000000000000',
   '(fixture) the season-2026 rules-acknowledgement text.',
   'Alex Sterling', 'e2e-member-clear@aksailingclub.org', 'renewal', '2026-06-01 00:00:00',
   'portal-mem-clear', NULL);
