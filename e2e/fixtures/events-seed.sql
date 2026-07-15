-- Fixture data for the site-visual e2e suite's local D1 (never the real asc-club the admin
-- screens and the import scripts own; wrangler d1 execute --local writes only to the gitignored
-- .wrangler/state/v3 replica the CI runner starts empty). Repointed by pass 2.1's Task 9: this
-- fixture used to recreate asc-ops's own `events`/`classes` shape; it now mirrors asc-club's
-- ratified DDL (migrations/asc-club/0001_substrate/forward.sql plus the 0003_class_images
-- rider), the site's real read source as of this pass. One row per card feature the events
-- deep-look pass's detailed listing renders: a racing event (image placeholder, plain-ink
-- badge), a class (a real hero_image/hero_image_alt, one of the four actual filenames migration
-- 0003's backfill copied off asc-ops, a merged description, a derived registration-status badge,
-- and a computed register link), an operations entry in the season bucket, an off-season social
-- (compact variant, still badged), and a governance entry (compact, no badge, the Meetings &
-- Governance section) -- everything docs/events-manifest.md's re-enumeration found on the live
-- page except a real photo's bytes (the local R2 replica the CI runner starts carries no media
-- objects regardless, so the class card's image slot renders the browser's broken-image glyph
-- rather than the actual photograph; the DOM shape and the query path are still exercised end to
-- end, matching the suite's own already-documented limitation on a real event photo).
--
-- Fixed dates, not "whenever CI runs": events-data.ts groups by the real calendar year at request
-- time, so this fixture must be refreshed to the current year whenever the site-visual baselines
-- are regenerated (the same annual upkeep any date-bearing fixture in this family needs).
--
-- DELETE, not DROP/CREATE (amended for the unified-signup arc, Task 8): this file used to own a
-- narrower, hand-copied subset of the real DDL, missing `classes.season`/`track` (settings-
-- driven per-season instances the classes-store and class-schedule reads both need) because
-- nothing in the visual suite touched those columns yet. The join and class-door specs
-- (e2e/join-and-class-door.spec.ts) do, through the real `classes-store.ts`/`class-schedule-
-- data.ts` reads, so this fixture now reuses the real, already-migrated schema
-- (bootstrap-club-db.mjs applies every asc-club migration before this file ever runs) instead of
-- re-declaring a copy of it that can drift out of sync, the way the missing columns already had.
-- Deleting existing rows, not dropping the table, is what lets a developer re-run the suite
-- against an already-migrated local D1 without a schema mismatch; CI always starts from the
-- gitignored .wrangler/state fresh, so the delete is a no-op there.
--
-- class_reminders_sent (migration 0012) and credit_redemptions (migration 0005) both carry
-- `enrollment_id REFERENCES class_enrollments(id)`, so on a warm workstation replica (local D1
-- enforces FKs; the real edge database does not) they must clear before class_enrollments or the
-- second consecutive run of this file fails with FOREIGN KEY constraint failed.
DELETE FROM class_offers;
DELETE FROM class_waitlist;
DELETE FROM class_reminders_sent;
DELETE FROM credit_redemptions;
DELETE FROM class_enrollments;
DELETE FROM classes;
DELETE FROM events;

INSERT INTO events (
  id, title, slug, category, start_date, start_time, end_date, end_time, location, short_description, long_description, visible
) VALUES
  (
    'test-regatta', 'Test Regatta', 'test-regatta', 'racing', '2026-07-10', '10:00', '2026-07-11', NULL, 'Alaska Sailing Club',
    'A one-day fixture regatta for the visual suite.',
    'Racing starts at 10am both days, weather permitting.',
    1
  ),
  (
    'test-spring-work-party', 'Test Spring Work Party', 'test-spring-work-party', 'operations', '2026-05-18', NULL, '2026-05-18', NULL, 'Alaska Sailing Club',
    'Dock building and general grounds work.',
    NULL,
    1
  ),
  (
    'test-off-season-social', 'Test Off-Season Social', 'test-off-season-social', 'social', '2026-11-05', NULL, '2026-11-05', NULL, 'Anchorage, AK',
    'A fixture off-season gathering.',
    NULL,
    1
  ),
  (
    'test-annual-meeting', 'Test Annual Meeting', 'test-annual-meeting', 'governance', '2026-11-14', NULL, NULL, NULL, 'Google Meet',
    'Election of officers, fixture data only.',
    NULL,
    1
  );

-- season 2026 matches migration 0001_substrate's own seeded `current_season` settings row, so
-- this class reads as the current season everywhere that matters: the join door's class-pick
-- list, the class-door signup route, and the education page's class-schedule island. track
-- 'adult-teen' and capacity 8 with zero enrollments read as open (isPubliclyOpen), the simplest
-- case both the class-door pivot spec and (indirectly) the join spec's own class-pick list need.
INSERT INTO classes (
  id, season, name, slug, track, capacity, fee, start_date, end_date, location, description, hero_image, hero_image_alt, visible
) VALUES
  (
    'test-intro-class', 2026, 'Test Intro Class', 'test-intro-class', 'adult-teen', 8, 150, '2026-06-20', '2026-06-22', 'Alaska Sailing Club',
    'Four-day fixture class for the visual suite.

Covers the fundamentals of dinghy sailing over a long weekend.',
    'adult-intro-class-1.jpg',
    'Student at the tiller of a club Buccaneer sailboat with an instructor, sailing on the lake during class',
    1
  );
