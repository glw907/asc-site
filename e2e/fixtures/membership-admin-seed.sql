-- Synthetic households/members/memberships/assets for the membership-admin pass (Task 3,
-- docs/plans/2026-07-14-membership-admin.md), covering the shapes that module's stores
-- (households-store.ts, money-store.ts) and the later desk/money screens (Tasks 4-7) need to
-- render against real rows. Every name below is fictional -- this is deliberately NOT the real
-- 285-member asc-club data (the Global constraints rule: no member PII in fixtures, tests, or
-- commits).
--
-- NOT wired into e2e/fixtures/bootstrap-club-db.mjs's automatic run: that script also applies
-- signup-seed.sql, which DELETEs every households/members/memberships row so the join and
-- class-door specs (e2e/join-and-class-door.spec.ts) always start from a known-empty state; this
-- fixture's own rows would either be wiped right back out or (if applied after) reintroduce
-- households those specs' fresh-signup-vs-renewal-pivot assertions do not expect. Apply by hand
-- for local dev/screenshot work against the household-grouped Members list, the household desk,
-- and Money & Renewals:
--
--   npx wrangler d1 execute asc-club --local --file e2e/fixtures/membership-admin-seed.sql
--
-- Every id is prefixed `madm-`, so this file only ever touches its own rows (DELETE ... WHERE id
-- LIKE 'madm-%'), safe to re-run without disturbing whatever else lives in the local replica.
-- Assumes asc-club's migrations are already applied (bootstrap-club-db.mjs's own job, or a plain
-- `npm run dev` session that has already migrated once).
--
-- Dates are relative (`datetime('now', ...)`), never fixed, so the fixture reads as "current" or
-- "stale" the same way regardless of when it is applied. `current_season` is 2026
-- (0001_substrate's own seed); every "current" row below targets that season.
--
-- The shapes, one household each:
--   The Larches    -- multi-member (3), family tier, current, full published price ($500).
--   The Cedars     -- comped: $0 paid, individual tier, current.
--   The Birches    -- discounted: $180 paid against the $250 published individual rate, current.
--   The Willows    -- refunded-row-ignored: a refunded 2026 row plus an older, non-refunded 2025
--                     row, so standing derives from the 2025 row (grace or lapsed by now), never
--                     the refunded 2026 one.
--   The Alders     -- stale-with-asset: a lapsed 2024 membership still holding an ACTIVE mooring
--                     assignment (the attention-list shape).
--   The Ravens (North) / The Ravens (South) -- the same-season merge-conflict pair: two distinct
--                     households, each holding its own 2026 membership row, so a merge attempt
--                     between them must be refused (the UNIQUE (household_id, season) constraint
--                     a real merge would otherwise violate).

DELETE FROM asset_assignments WHERE id LIKE 'madm-%';
DELETE FROM asset_types WHERE id LIKE 'madm-%';
DELETE FROM memberships WHERE id LIKE 'madm-%';
UPDATE households SET primary_member_id = NULL WHERE id LIKE 'madm-%';
DELETE FROM members WHERE id LIKE 'madm-%';
DELETE FROM households WHERE id LIKE 'madm-%';

INSERT INTO households (id, name, city, primary_member_id) VALUES
  ('madm-hh-larch', 'The Larches', 'Wasilla', NULL),
  ('madm-hh-cedar', 'The Cedars', 'Homer', NULL),
  ('madm-hh-birch', 'The Birches', 'Sitka', NULL),
  ('madm-hh-willow', 'The Willows', 'Juneau', NULL),
  ('madm-hh-alder', 'The Alders', 'Kodiak', NULL),
  ('madm-hh-raven-north', 'The Ravens (North)', 'Palmer', NULL),
  ('madm-hh-raven-south', 'The Ravens (South)', 'Palmer', NULL);

INSERT INTO members (id, household_id, name, email, phone, directory_visibility, archived_at) VALUES
  ('madm-mem-larch-1', 'madm-hh-larch', 'Astrid Larch', 'astrid.larch@example.com', '+19075550101', 'visible', NULL),
  ('madm-mem-larch-2', 'madm-hh-larch', 'Bo Larch', 'bo.larch@example.com', '+19075550102', 'visible', NULL),
  ('madm-mem-larch-3', 'madm-hh-larch', 'Cass Larch', NULL, NULL, 'partial', NULL),
  ('madm-mem-cedar-1', 'madm-hh-cedar', 'Dana Cedar', 'dana.cedar@example.com', NULL, 'visible', NULL),
  ('madm-mem-birch-1', 'madm-hh-birch', 'Eli Birch', 'eli.birch@example.com', NULL, 'partial', NULL),
  ('madm-mem-willow-1', 'madm-hh-willow', 'Finn Willow', 'finn.willow@example.com', NULL, 'hidden', NULL),
  ('madm-mem-alder-1', 'madm-hh-alder', 'Gale Alder', 'gale.alder@example.com', NULL, 'visible', NULL),
  ('madm-mem-raven-n1', 'madm-hh-raven-north', 'Hana Raven', 'hana.raven@example.com', NULL, 'visible', NULL),
  ('madm-mem-raven-s1', 'madm-hh-raven-south', 'Ira Raven', 'ira.raven@example.com', NULL, 'visible', NULL);

UPDATE households SET primary_member_id = 'madm-mem-larch-1' WHERE id = 'madm-hh-larch';
UPDATE households SET primary_member_id = 'madm-mem-cedar-1' WHERE id = 'madm-hh-cedar';
UPDATE households SET primary_member_id = 'madm-mem-birch-1' WHERE id = 'madm-hh-birch';
UPDATE households SET primary_member_id = 'madm-mem-willow-1' WHERE id = 'madm-hh-willow';
UPDATE households SET primary_member_id = 'madm-mem-alder-1' WHERE id = 'madm-hh-alder';
UPDATE households SET primary_member_id = 'madm-mem-raven-n1' WHERE id = 'madm-hh-raven-north';
UPDATE households SET primary_member_id = 'madm-mem-raven-s1' WHERE id = 'madm-hh-raven-south';

-- The Larches: multi-member, family tier, current, full price.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-larch-2026', 'madm-hh-larch', 2026, 'family', 500, datetime('now', '-30 days'), NULL);

-- The Cedars: comped ($0), current.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-cedar-2026', 'madm-hh-cedar', 2026, 'individual', 0, datetime('now', '-20 days'), NULL);

-- The Birches: discounted ($180 against the $250 published individual rate), current.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-birch-2026', 'madm-hh-birch', 2026, 'individual', 180, datetime('now', '-15 days'), NULL);

-- The Willows: an older, non-refunded 2025 row (grounds standing, well past the paid-plus-one-year
-- boundary so it reads lapsed) plus a refunded 2026 row that standing must ignore entirely.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-willow-2025', 'madm-hh-willow', 2025, 'individual', 250, datetime('now', '-400 days'), NULL),
  ('madm-ms-willow-2026', 'madm-hh-willow', 2026, 'individual', 250, datetime('now', '-60 days'), datetime('now', '-10 days'));

-- The Alders: a lapsed 2024 membership still holding an active asset assignment (the attention-
-- list shape: an asset that outlived its household's dues).
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-alder-2024', 'madm-hh-alder', 2024, 'individual', 250, datetime('now', '-800 days'), NULL);

INSERT INTO asset_types (id, name, fee, capacity, sort_order) VALUES
  ('madm-at-mooring', 'Mooring (fixture)', 200, NULL, 900);

INSERT INTO asset_assignments (id, asset_type, membership_id, description, status) VALUES
  ('madm-aa-alder-1', 'madm-at-mooring', 'madm-ms-alder-2024', 'Fixture buoy M-1', 'active');

-- The Ravens (North/South): the same-season merge-conflict pair -- two distinct households, each
-- holding its own 2026 membership row, so a merge between them must be refused.
INSERT INTO memberships (id, household_id, season, tier, price_paid, paid_at, refunded_at) VALUES
  ('madm-ms-raven-north-2026', 'madm-hh-raven-north', 2026, 'individual', 250, datetime('now', '-25 days'), NULL),
  ('madm-ms-raven-south-2026', 'madm-hh-raven-south', 2026, 'individual', 250, datetime('now', '-25 days'), NULL);
