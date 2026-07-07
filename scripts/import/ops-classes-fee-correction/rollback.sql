-- Restores the pre-correction placeholder (fee=0) on exactly the rows this correction moved to
-- 100. Safe before any real admin edit changes a class's fee to something else; once a
-- volunteer sets a real per-class fee through the classes admin screen (Task 6), this rollback
-- would wrongly zero it out too, the same caveat ops-classes.rollback.sql documents for its own
-- full-import rollback.
--
--   npx wrangler d1 execute asc-club --remote --file scripts/import/ops-classes-fee-correction/rollback.sql
UPDATE classes SET fee = 0, updated_at = datetime('now') WHERE fee = 100;

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('correction:ops-classes-fee', 'correction.rollback', 'class', NULL,
        'ops-classes-fee-correction rollback: fee 100 -> 0 restored on the placeholder rows');
