-- mw-members rollback: undoes mw-members.mjs's import in full.
--
-- Scoped to every household/member the importer has ever created, tracked via audit_log's
-- `actor = 'import:mw'` rows (mirrors ops-classes.rollback.sql's own convention), not to one
-- specific run's batch id: the import is a natural-key upsert keyed on `members.email` against a
-- fixed source file, so re-running never creates a distinguishable new "batch" of rows to roll
-- back separately from any other run. Each run's own batch id is still recorded in every row's
-- `audit_log.detail` for traceability.
--
-- `households.primary_member_id` and `members.household_id` reference each other (the same
-- circular pair `0005_member_domain`'s own header names), so a plain `DELETE FROM households`
-- would fail with a live `FOREIGN KEY constraint failed` while any of its members still exist:
-- the primary reference is broken first (`UPDATE ... SET primary_member_id = NULL`), the same
-- direction the deferred-not-null dance itself sets it in, then members, then households.
-- `memberships.household_id` has no `ON DELETE` clause either, so it is cleared first of all.
--
-- Write-only (deletes plus their own audit row), so run via `--file` per this repo's own
-- migration convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/mw-members.rollback.sql
--
-- Safe only before any real portal, admin, or renewal edit has touched an imported
-- household/member/membership row: this discards those rows outright, not just the import's own
-- provenance.

DELETE FROM memberships
WHERE household_id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'household' AND entity_id IS NOT NULL
);

UPDATE households
SET primary_member_id = NULL
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'household' AND entity_id IS NOT NULL
);

DELETE FROM members
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'member' AND entity_id IS NOT NULL
);

DELETE FROM households
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'household' AND entity_id IS NOT NULL
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:mw', 'import.rollback', 'member', NULL,
        'mw-members.mjs rollback: removed every imported household/member/membership row');
