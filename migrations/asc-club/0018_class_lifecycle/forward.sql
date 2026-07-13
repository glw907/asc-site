-- asc-club migration 0018: the class-lifecycle facts the public schedule needs.
--
-- The education page's class schedule (Geoff's 2026-07-13 ask, mirroring the live site's
-- table) derives a full lifecycle status per class: completed, in session, drop-in, opens
-- later, full, open, dates TBD. Two of those states rest on facts no existing column or
-- count can supply:
--
--   1. `drop_in`: a clinic like Fleet Tune-Up Weekend takes no registration at all ("Just
--      show up!" on the live site). Deriving that from `fee = 0` would misread any future
--      free class that still needs a roster, so it is a stored fact, not a heuristic.
--   2. `class_registration_opens` (settings): registration opens club-wide in mid-March,
--      per the live site's own copy. Before that date a listed class is neither open nor
--      full; it is "opens later". An empty value means no gate is configured and the
--      derived open/full states apply as before.
ALTER TABLE classes ADD COLUMN drop_in INTEGER NOT NULL DEFAULT 0 CHECK (drop_in IN (0,1));

-- Fleet Tune-Up Weekend is the one existing drop-in offering (the live site's own "Drop-in /
-- Just show up!" row).
UPDATE classes SET drop_in = 1 WHERE id = 'fleet_tuneup';

-- Seeded empty (no gate) so the key is discoverable and auditable; the admin Settings screen
-- writes the real date (YYYY-MM-DD) each season.
INSERT INTO settings (key, value, updated_by)
  VALUES ('class_registration_opens', '', 'system')
  ON CONFLICT(key) DO NOTHING;
