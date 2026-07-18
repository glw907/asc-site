-- Undoes 0028_boats_model/forward.sql: drops the reshaped `boats` table and recreates the
-- original 0027_directory_domain shape verbatim (the `class` picker plus the
-- required-iff-Other `model` column, and the same table-level CHECK).
--
-- Safe only before any real boat data exists in the reshaped table, exactly like every other
-- additive migration's rollback in this directory: this discards rows, not just structure.

DROP TABLE boats;

CREATE TABLE boats (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT,                       -- nullable for legacy seed rows only; required at capture
  class TEXT NOT NULL CHECK (class IN ('Buccaneer 18','Laser','Other')),
  model TEXT,                      -- required iff class = 'Other'; see the table CHECK below
  sail_number TEXT,
  kept_on TEXT NOT NULL DEFAULT 'trailer' CHECK (kept_on IN ('trailer','mooring')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (class = 'Other' AND model IS NOT NULL) OR
    (class <> 'Other' AND model IS NULL)
  )
);
CREATE INDEX idx_boats_member ON boats(member_id);
