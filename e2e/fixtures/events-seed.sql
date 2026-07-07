-- Fixture data for the site-visual e2e suite's local D1 (never the real asc-ops the ops stack
-- owns; wrangler d1 execute --local writes only to the gitignored .wrangler/state replica the
-- CI runner starts empty). The full column set mirrors the read-only schema $theme/events-data.ts
-- documents (asc-ops's `events` and `classes` tables), with one row per card feature the events
-- deep-look pass's detailed listing renders: a regatta (image placeholder, plain-ink badge), a
-- class (a real short/long description, a registration-status badge, a register link), a
-- work_party in the season bucket, an off-season social (compact variant, still badged), and a
-- meeting (compact, no badge) — everything docs/events-manifest.md's re-enumeration found on the
-- live page except a real photo (the local R2 replica the CI runner starts carries no media
-- objects regardless).
--
-- Fixed dates, not "whenever CI runs": events-data.ts groups by the real calendar year at request
-- time, so this fixture must be refreshed to the current year whenever the site-visual baselines
-- are regenerated (the same annual upkeep any date-bearing fixture in this family needs).
-- DROP first so a developer can re-run the suite against an already-seeded local D1 without a
-- "table already exists" failure; CI always starts from the gitignored .wrangler/state fresh, so
-- the drop is a no-op there.
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS classes;

CREATE TABLE events (
  title TEXT NOT NULL,
  slug TEXT,
  event_type TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  date_history TEXT,
  location TEXT,
  short_description TEXT,
  long_description TEXT,
  hero_image TEXT,
  hero_image_alt TEXT,
  registration_url TEXT,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE classes (
  name TEXT NOT NULL,
  slug TEXT,
  registration_status TEXT,
  start_date TEXT,
  end_date TEXT,
  date_history TEXT,
  location TEXT,
  short_description TEXT,
  long_description TEXT,
  hero_image TEXT,
  hero_image_alt TEXT,
  registration_url TEXT,
  visible INTEGER NOT NULL DEFAULT 1
);

INSERT INTO events (
  title, slug, event_type, start_date, end_date, location, short_description, long_description, visible
) VALUES
  (
    'Test Regatta', 'test-regatta', 'regatta', '2026-07-10', '2026-07-11', 'Alaska Sailing Club',
    'A one-day fixture regatta for the visual suite.',
    'Racing starts at 10am both days, weather permitting.',
    1
  ),
  (
    'Test Spring Work Party', 'test-spring-work-party', 'work_party', '2026-05-18', '2026-05-18', 'Alaska Sailing Club',
    'Dock building and general grounds work.',
    NULL,
    1
  ),
  (
    'Test Off-Season Social', 'test-off-season-social', 'social', '2026-11-05', '2026-11-05', 'Anchorage, AK',
    'A fixture off-season gathering.',
    NULL,
    1
  ),
  (
    'Test Annual Meeting', 'test-annual-meeting', 'meeting', '2026-11-14', NULL, 'Google Meet',
    'Election of officers, fixture data only.',
    NULL,
    1
  );

INSERT INTO classes (
  name, slug, registration_status, start_date, end_date, location, short_description, long_description, registration_url, visible
) VALUES
  (
    'Test Intro Class', 'test-intro-class', 'open', '2026-06-20', '2026-06-22', 'Alaska Sailing Club',
    'Four-day fixture class for the visual suite.',
    'Covers the fundamentals of dinghy sailing over a long weekend.',
    'https://example.com/register',
    1
  );
