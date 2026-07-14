-- mw-members rollback (v2): undoes every row mw-members.mjs has ever CREATED.
--
-- Scoped to `audit_log`'s own `actor = 'import:mw'` rows (mirrors ops-classes.rollback.sql's own
-- convention), not to one specific run's batch id: this import is idempotent by natural-key
-- match, so re-running never creates a distinguishable new "batch" of rows to roll back
-- separately from any other run. Each run's own batch id is still recorded in every row's
-- `audit_log.detail` for traceability.
--
-- CAVEAT, read before running: this file reverses `import.insert` rows only. It CANNOT undo an
-- `import.update` -- phase 1's name/`mw_account_id` recasing on the 146 pre-existing (July 7)
-- rows, phase 4's in-place update of an already-current membership row, and phase 6's
-- approximate-to-exact enrollment identity upgrades are all field edits on rows that already
-- existed before the run that touched them, and reversing an edit means restoring whatever value
-- was there before, which this file has no way to know. `audit_log.detail` records the `from ->
-- to` values for every such change if a by-hand reconstruction is ever needed; the committed
-- encrypted archives at `data/membershipworks/` are the ground-truth recovery path. Safe only
-- before any real portal, admin, or renewal edit has touched an imported row.
--
-- Delete order follows the schema's own foreign keys, innermost first: enrollments (references
-- classes + members) and memberships (references households) have no dependents and go first;
-- classes next (class_enrollments already cleared); `households.primary_member_id` and
-- `members.household_id` reference each other (the circular pair `0005_member_domain`'s own
-- header names), so the primary reference is broken (`UPDATE ... SET primary_member_id = NULL`)
-- before members, then households, are deleted.
--
-- Write-only (deletes plus their own audit row), so run via `--file` per this repo's own
-- migration convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/mw-members.rollback.sql

DELETE FROM class_enrollments
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'enrollment' AND action = 'import.insert' AND entity_id IS NOT NULL
);

DELETE FROM memberships
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'membership' AND action = 'import.insert' AND entity_id IS NOT NULL
);

DELETE FROM classes
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'class' AND action = 'import.insert' AND entity_id IS NOT NULL
);

UPDATE households
SET primary_member_id = NULL
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'household' AND action = 'import.insert' AND entity_id IS NOT NULL
);

DELETE FROM members
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'member' AND action = 'import.insert' AND entity_id IS NOT NULL
);

DELETE FROM households
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:mw' AND entity = 'household' AND action = 'import.insert' AND entity_id IS NOT NULL
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:mw', 'import.rollback', 'member', NULL,
        'mw-members.mjs v2 rollback: removed every import.insert-created enrollment/membership/class/member/household row; import.update field edits on pre-existing rows were NOT reversed (see this file''s own caveat)');
