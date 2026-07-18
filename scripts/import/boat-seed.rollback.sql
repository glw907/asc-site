-- boat-seed rollback: undoes boat-seed.mjs's import in full.
--
-- SCOPED BY ID PREFIX, not by audit_log lookup: every seeded boat's id follows the locked
-- `boat-<source assignment id>` scheme (e.g. `boat-ops-assignment-42`), and every source
-- assignment id itself already carries the `ops-assignment-` prefix `ops-assets.mjs`'s own
-- import gave it -- so `boat-ops-assignment-%` is unambiguous. This is deliberately NARROWER
-- than a real member-added boat will ever be: T5 gives a member-captured boat its own id
-- scheme (never this prefix), so this rollback can never remove a real member's own boat, only
-- ever a seeder-created one, even after T5 ships and both kinds of row coexist in the table.
--
-- Write-only (one DELETE plus its own audit rows), so run via `--file` per the migration
-- convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/boat-seed.rollback.sql

DELETE FROM boats WHERE id LIKE 'boat-ops-assignment-%';

DELETE FROM audit_log
WHERE actor = 'import:boat-seed' AND entity = 'boat' AND entity_id LIKE 'boat-ops-assignment-%';

DELETE FROM audit_log
WHERE actor = 'import:boat-seed' AND action = 'import.batch' AND entity = 'boat' AND entity_id IS NULL;

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:boat-seed', 'import.rollback', 'boat', NULL,
        'boat-seed.mjs rollback: removed every seeder-created boat (id prefix boat-ops-assignment-%) and its audit trail');
