-- asc-club migration 0001: the substrate for pass 2.1 (events/classes admin), plus the
-- waiver-acceptance rider folded in early from the gap analysis (the table Task 8's public
-- forms and 2.2's join flow will both write). Lands the 2.1-needed subset of the ratified DDL
-- (cairn-cms/docs/superpowers/specs/assets/phase-2-reference/asc-club-schema.sql) verbatim in
-- table structure: events, classes, class_instructors, class_enrollments, class_waitlist,
-- class_offers, club_roles, settings, audit_log. Member-domain tables (households, members,
-- memberships, credit_grants, credit_redemptions) and the email/asset domains are later
-- passes' own migrations and are not created here. The class_instructors, class_enrollments,
-- and class_waitlist columns below reference members(id), which does not exist yet: SQLite
-- does not require a REFERENCES target to exist at CREATE TABLE time, and D1 does not enforce
-- foreign keys by default, so this resolves cleanly once 2.2 lands that table.
--
-- One deliberate deviation from the ratified DDL: club_roles.role's CHECK gains 'owner'
-- alongside the ratified 'club-admin' and 'instructor'. The ratified enum omitted a role for
-- the single owner seat, but Task 4's authorization layer (getClubRole returning 'owner' |
-- 'admin' | null) and Geoff's 2026-07-07 seed ruling both need one distinct from club-admin.

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('racing','class','operations','social','governance')),
  short_description TEXT,
  long_description TEXT,
  start_date TEXT, start_time TEXT, end_date TEXT, end_time TEXT,
  location TEXT,
  hero_image TEXT, hero_image_alt TEXT, thumbnail_image TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,         -- classes are per-season instances (the rollover
                                   -- creates next season's from templates or fresh)
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('adult-teen','youth')),  -- age-gated: 13+ / 8-12
  capacity INTEGER NOT NULL,       -- caps are real; fullness DERIVES from enrollment
  fee INTEGER NOT NULL,
  start_date TEXT, end_date TEXT,
  location TEXT,
  description TEXT,
  instructor_notes TEXT,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (season, slug)
);

CREATE TABLE class_instructors (   -- the instructor ROLE holds the surface; this
  class_id TEXT NOT NULL REFERENCES classes(id),      -- assignment scopes WHICH rosters
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (class_id, member_id)
);

CREATE TABLE class_enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  fee_paid INTEGER NOT NULL DEFAULT 0,   -- 0 when a credit covered it
  stripe_ref TEXT,
  guardian_contact TEXT,           -- youth track: the parent-on-premises requirement
  UNIQUE (class_id, member_id)
);
CREATE INDEX idx_enrollments_class ON class_enrollments(class_id);

-- The class waitlist is SEASONAL and SEPARATE from the asset waitlist (structural,
-- never generalized): it resets at rollover; asset queues never do.
CREATE TABLE class_waitlist (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  -- public signups may not be members yet; either edge, exactly one:
  member_id TEXT REFERENCES members(id),
  applicant_name TEXT, applicant_email TEXT, applicant_phone TEXT,
  position INTEGER NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  CHECK ((member_id IS NOT NULL) OR (applicant_email IS NOT NULL))
);

-- The time-limited OFFER (the magic-link token discipline reused): single-use,
-- expiring, person-and-class bound; offered -> claimed | declined | expired.
CREATE TABLE class_offers (
  token TEXT PRIMARY KEY,          -- the link's secret, hashed at rest like auth tokens
  waitlist_id TEXT NOT NULL REFERENCES class_waitlist(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  offered_by TEXT NOT NULL,
  offered_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,        -- window length is a club setting
  resolved TEXT CHECK (resolved IN ('claimed','declined','expired')),
  resolved_at TEXT
);

-- The site-owned authorization axis (content roles stay cairn's own).
CREATE TABLE club_roles (
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','club-admin','instructor')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, role)
);

CREATE TABLE settings (            -- current_season, offer window, etc.
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL         -- settings changes are audited actions
);

CREATE TABLE audit_log (           -- ops's best convention, carried whole
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,             -- editor email / member id / 'system'
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The waiver-acceptance rider (gap analysis item 1, folded in from Task 8): both the 2.1
-- public class-signup form and 2.2's join flow write here, keyed by who signed and when.
CREATE TABLE waiver_acceptances (
  id TEXT PRIMARY KEY,
  person_name TEXT NOT NULL,
  person_email TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('class-signup','join')),
  waiver_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_waiver_acceptances_email ON waiver_acceptances(person_email);

-- Seed rows. current_season mirrors what asc-ops's live events/classes data actually carries:
-- every live events/classes row read 2026-07-07 via `wrangler d1 execute asc-ops --remote`
-- dates into 2026, and ops keeps no explicit season/year table to read instead.
INSERT INTO settings (key, value, updated_by) VALUES
  ('current_season', '2026', 'system'),
  ('offer_window_hours', '72', 'system'),
  ('waiver_text_version', '2026-01', 'system');

INSERT INTO club_roles (email, role, granted_by) VALUES
  ('geoff-login@907.life', 'owner', 'system');

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'settings', NULL,
   '0001_substrate: current_season=2026, offer_window_hours=72, waiver_text_version=2026-01'),
  ('system', 'migration.seed', 'club_roles', 'geoff-login@907.life',
   '0001_substrate: seeded as owner');
