-- asc-club migration 0023: the membership-admin pass's own two schema additions
-- (docs/2026-07-14-membership-admin-design.md).
--
-- `memberships.refunded_at` marks a refunded dues row without deleting it (ruling 4: refunds
-- never delete history). NULL means never refunded; a refund plan (a later task's `refunds.ts`)
-- sets it to the refund's own timestamp on a full-dues refund only -- a partial dues refund
-- leaves the membership standing. `src/member-auth/lib/standing.ts` (Task 2) reads this column
-- on every membership query, so a household's standing ignores a refunded row and reads
-- lapsed/none instead of current; rejoining the same season reclaims the row (clears
-- `refunded_at`, updates `paid_at`) rather than inserting a second one, so the existing
-- `UNIQUE (household_id, season)` constraint holds.
ALTER TABLE memberships ADD COLUMN refunded_at TEXT;

-- `signup_review_resolutions` is the signup queue's own persistence (Task 8): the queue derives
-- its pending rows live, by query, from recent first-season memberships (no stored "reviewed"
-- flag on `memberships` itself, so `reconcileJoin` stays untouched); a resolution row is the one
-- new fact this pass adds, recording that a human looked at a join and what they decided. Review
-- is a post-hoc background check, never a gate (the design's own inherited ruling): nothing here
-- can un-activate a membership, and an unresolved join is exactly as active as a resolved one.
CREATE TABLE signup_review_resolutions (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'denied')),
  note TEXT,
  resolved_by TEXT NOT NULL,
  resolved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_signup_review_resolutions_membership ON signup_review_resolutions(membership_id);

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.schema', 'memberships', NULL,
   '0023_membership_admin: added refunded_at (null default)'),
  ('system', 'migration.schema', 'signup_review_resolutions', NULL,
   '0023_membership_admin: table created');
