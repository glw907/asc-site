-- Undoes 0026_drop_club_roles/forward.sql: recreates `club_roles` exactly as
-- 0001_substrate/forward.sql declared it, and restores its single live row.
--
-- Safe only before the engine's own role gate has recorded a grant `club_roles` never saw (a
-- club-admin or instructor added through ManageEditors after this migration applies): this
-- rollback restores the table's schema and its one known row, not any grant made through the
-- collapsed system's replacement.
CREATE TABLE club_roles (
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','club-admin','instructor')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, role)
);

INSERT INTO club_roles (email, role, granted_by, granted_at) VALUES
  ('geoff-login@907.life', 'owner', 'system', '2026-07-07 08:29:01');
