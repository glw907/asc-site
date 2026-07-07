-- ops-assets rollback: undoes ops-assets.mjs's import in full.
--
-- Scoped to every row the importer has ever touched (tracked via audit_log's
-- actor='import:ops' rows for each of the four entities: 'asset-type', 'asset-assignment',
-- 'asset-payment', 'asset-waitlist'), not to one specific run's batch id, the same reasoning
-- ops-classes.rollback.sql's own header gives: the import is a natural-key upsert, so
-- re-running never creates a distinguishable new "batch" of rows to roll back separately from
-- any other run.
--
-- Deletion order matters (child tables before the parents they reference):
-- asset_payments (references asset_assignments), then asset_assignments (references
-- asset_types), then asset_waitlist (references asset_types, no dependent), then asset_types
-- itself last. Only safe before any later pass (the assets admin screens) has written real
-- admin edits into these rows (a new manual assignment, a recorded payment, a waitlist
-- reorder); once real admin edits exist, a full rollback would discard them too.
--
-- Write-only (four DELETEs plus their own audit row), so run via `--file` per the migration
-- convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/ops-assets.rollback.sql

DELETE FROM asset_payments
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:ops' AND entity = 'asset-payment' AND entity_id IS NOT NULL
);

DELETE FROM asset_assignments
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:ops' AND entity = 'asset-assignment' AND entity_id IS NOT NULL
);

DELETE FROM asset_waitlist
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:ops' AND entity = 'asset-waitlist' AND entity_id IS NOT NULL
);

DELETE FROM asset_types
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:ops' AND entity = 'asset-type' AND entity_id IS NOT NULL
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:ops', 'import.rollback', 'asset', NULL,
        'ops-assets.mjs rollback: removed every imported asset-type, assignment, payment, and waitlist row');
