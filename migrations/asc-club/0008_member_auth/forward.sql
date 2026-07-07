-- asc-club migration 0008: member-facing magic-link authentication (pass 2.2's member portal,
-- Part 1). Mirrors @glw907/cairn-cms's own self-owned D1 auth store
-- (~/Projects/cairn-cms/migrations/0000_auth.sql: editor/magic_token/session) at the shape
-- level, adapted to this schema's own conventions: TEXT `datetime('now')` timestamps (not epoch
-- milliseconds) and a `consumed_at` column on the token row rather than delete-on-consume, so a
-- single-use consume is one conditional UPDATE checked via `meta.changes`
-- (`src/admin-club/lib/offers.ts`'s own compare-and-set lesson, `claimOffer`'s identical
-- `UPDATE class_offers SET resolved = ... WHERE resolved IS NULL` shape), not a DELETE. The row
-- survives its own consumption (or expiry), which is what lets a failed confirm attempt still
-- read back which member it belonged to, for the "send me a fresh link" pre-fill (see
-- src/member-auth/lib/auth.ts's `confirmMemberToken`).
--
-- Distinct from cairn's own AUTH_DB (a separate D1 database, this repo's own root-level
-- migrations/0000_auth.sql, bound as AUTH_DB): that store holds CONTENT EDITORS, this one holds
-- MEMBERS. The two stores never blur
-- (docs/2026-07-07-member-portal-design.md's own "the auth surface" section).
--
-- `member_id REFERENCES members(id)` on both tables below already has a real target: `members`
-- landed in migration 0005_member_domain, and the MembershipWorks import (this same session,
-- ahead of this migration) already populated it, so this migration adds no new "REFERENCES a
-- table that doesn't exist yet" case the way 0005/0006 had to fix.
CREATE TABLE member_tokens (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_member_tokens_member ON member_tokens(member_id);
CREATE INDEX idx_member_tokens_expiry ON member_tokens(expires_at);

CREATE TABLE member_sessions (
  id TEXT PRIMARY KEY,              -- an opaque, random session id (cairn's own model: no
                                     -- signing, no hash-of-id; the id itself is the bearer
                                     -- secret, stored and compared as-is, the same shape
                                     -- cairn-cms's own `session` table uses for editor sessions)
  member_id TEXT NOT NULL REFERENCES members(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_member_sessions_member ON member_sessions(member_id);
CREATE INDEX idx_member_sessions_expiry ON member_sessions(expires_at);

-- The renewal-standing grace window (Geoff's mid-pass 2026-07-07 rolling-renewal correction):
-- standing derives from a household's own `memberships.paid_at` plus one year, not a season
-- boundary, and a household stays in a 'grace' standing for this many days after that date
-- before finally reading as 'lapsed'. A Club setting (this table, `getRenewalGraceDays` in
-- `src/admin-club/lib/club-settings.ts`), not a constant, since a future renewal-reminder
-- cadence and an asset-retention rule both key on the same value per the ruling's own reasoning.
INSERT INTO settings (key, value, updated_by) VALUES ('renewal_grace_days', '30', 'system');

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'settings', NULL, '0008_member_auth: renewal_grace_days=30');
