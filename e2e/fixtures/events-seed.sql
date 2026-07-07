-- Fixture data for the site-visual e2e suite's local D1 (never the real asc-club the admin
-- screens and the import scripts own; wrangler d1 execute --local writes only to the gitignored
-- .wrangler/state/v3 replica the CI runner starts empty). Repointed by pass 2.1's Task 9: this
-- fixture used to recreate asc-ops's own `events`/`classes` shape; it now mirrors asc-club's
-- ratified DDL (migrations/asc-club/0001_substrate/forward.sql), the site's real read source as
-- of this pass. The column set is trimmed to exactly what $theme/season-data.ts's and
-- $theme/events-data.ts's queries touch, still with one row per card feature the events deep-look
-- pass's detailed listing renders: a racing event (image placeholder, plain-ink badge), a class
-- (a merged description, a derived registration-status badge, a computed register link), an
-- operations entry in the season bucket, an off-season social (compact variant, still badged), and
-- a governance entry (compact, no badge, the Meetings & Governance section) -- everything
-- docs/events-manifest.md's re-enumeration found on the live page except a real photo (the local R2
-- replica the CI runner starts carries no media objects regardless) and a class photo (asc-club's
-- `classes` table carries no hero_image column at all, see events-data.ts's own header on this).
--
-- Fixed dates, not "whenever CI runs": events-data.ts groups by the real calendar year at request
-- time, so this fixture must be refreshed to the current year whenever the site-visual baselines
-- are regenerated (the same annual upkeep any date-bearing fixture in this family needs).
-- DROP first so a developer can re-run the suite against an already-seeded local D1 without a
-- "table already exists" failure; CI always starts from the gitignored .wrangler/state fresh, so
-- the drop is a no-op there.
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS class_enrollments;

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('racing','class','operations','social','governance')),
  short_description TEXT,
  long_description TEXT,
  start_date TEXT, end_date TEXT,
  location TEXT,
  hero_image TEXT, hero_image_alt TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1))
);

-- Trimmed to the columns the public read touches; the real table also carries season/track/fee
-- (settings.current_season, class_instructors, etc.), none of which this fixture's queries select.
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  start_date TEXT, end_date TEXT,
  location TEXT,
  description TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1))
);

-- Empty: only here so events-data.ts's per-class fullness subquery (COUNT(*) vs capacity) has a
-- real table to query. No enrollment fixture row is needed for the seeded class to read 'open'.
CREATE TABLE class_enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL
);

INSERT INTO events (
  id, title, slug, category, start_date, end_date, location, short_description, long_description, visible
) VALUES
  (
    'test-regatta', 'Test Regatta', 'test-regatta', 'racing', '2026-07-10', '2026-07-11', 'Alaska Sailing Club',
    'A one-day fixture regatta for the visual suite.',
    'Racing starts at 10am both days, weather permitting.',
    1
  ),
  (
    'test-spring-work-party', 'Test Spring Work Party', 'test-spring-work-party', 'operations', '2026-05-18', '2026-05-18', 'Alaska Sailing Club',
    'Dock building and general grounds work.',
    NULL,
    1
  ),
  (
    'test-off-season-social', 'Test Off-Season Social', 'test-off-season-social', 'social', '2026-11-05', '2026-11-05', 'Anchorage, AK',
    'A fixture off-season gathering.',
    NULL,
    1
  ),
  (
    'test-annual-meeting', 'Test Annual Meeting', 'test-annual-meeting', 'governance', '2026-11-14', NULL, 'Google Meet',
    'Election of officers, fixture data only.',
    NULL,
    1
  );

INSERT INTO classes (
  id, name, slug, capacity, start_date, end_date, location, description, visible
) VALUES
  (
    'test-intro-class', 'Test Intro Class', 'test-intro-class', 8, '2026-06-20', '2026-06-22', 'Alaska Sailing Club',
    'Four-day fixture class for the visual suite.

Covers the fundamentals of dinghy sailing over a long weekend.',
    1
  );
