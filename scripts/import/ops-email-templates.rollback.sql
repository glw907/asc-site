-- ops-email-templates rollback: undoes ops-email-templates.mjs's import in full, including
-- the one hand-authored `class_offer` row (this script's own header explains why it counts
-- as part of "the import" even though it has no ops source).
--
-- Scoped to every row the importer has ever touched (tracked via audit_log's
-- actor IN ('import:ops', 'authored:pass-2-2') rows with entity='email_template'), not to
-- one specific run's batch id -- the same reasoning ops-events.rollback.sql documents:
-- this is a natural-key upsert over a fixed source, so "roll back the import" and "roll
-- back the latest run" are the same operation.
--
-- Write-only (a DELETE plus its own audit row), so run via `--file`:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/ops-email-templates.rollback.sql
--
-- Safe only before the Email screen's own template-editing feature (2.3's full scope,
-- still a read-only preview as of this pass) has ever written a real edit; once real edits
-- exist, a full rollback would discard them too.

DELETE FROM email_templates
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor IN ('import:ops', 'authored:pass-2-2') AND entity = 'email_template' AND entity_id IS NOT NULL
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:ops', 'import.rollback', 'email_template', NULL,
        'ops-email-templates.mjs rollback: removed every imported and authored template row');
