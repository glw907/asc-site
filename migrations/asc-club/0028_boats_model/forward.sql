-- asc-club migration 0028: reshape `boats` to a single required `model` field
-- (Geoff-ratified 2026-07-17, superseding 0027_directory_domain's boats shape).
--
-- 0027 gave boats a fixed `class` picker (`'Buccaneer 18'`, `'Laser'`, `'Other'`) plus a
-- `model` column required only when `class = 'Other'`. That pair never earned its keep: the
-- picker is a CAPTURE-TIME affordance, not a distinct fact worth its own column. This migration
-- collapses both into one required `model TEXT`, holding the RESOLVED string either way --
-- `'Buccaneer 18'` or `'Laser'` when the picker matched, or whatever the member types when they
-- choose "Other". A later task's capture UI still shows the same three-way picker; only the
-- storage shape changes.
--
-- `boats` is still empty at this point in the plan (T2, the boat seeder, has not run against
-- the live database yet), so this migration recreates the table outright rather than an
-- in-place ALTER. Nothing else in the schema references `boats` by foreign key, so the DROP is
-- safe. `name` stays nullable for the same reason 0027 left it nullable: only legacy seed rows
-- ever land without one, capture requires it going forward. `sail_number`, `kept_on`,
-- `member_id`, `id`, and the timestamps are unchanged from 0027.

DROP TABLE boats;

CREATE TABLE boats (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT,                       -- nullable for legacy seed rows only; required at capture
  model TEXT NOT NULL CHECK (model <> ''),  -- picker Buccaneer 18/Laser/Other->typed, stored as the resolved string
  sail_number TEXT,
  kept_on TEXT NOT NULL DEFAULT 'trailer' CHECK (kept_on IN ('trailer','mooring')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_boats_member ON boats(member_id);
