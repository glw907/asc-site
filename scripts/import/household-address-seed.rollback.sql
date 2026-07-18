-- household-address-seed rollback: undoes household-address-seed.mjs's import in full.
--
-- Scoped by audit_log lookup, not by an id prefix: this importer UPDATEs an existing household
-- row rather than inserting a new one, so the audit trail is the only record of which households
-- it touched. Every prior value it filled was NULL (the seeder never overwrites a non-NULL
-- column), so nulling those three columns back out restores the pre-import state exactly.
--
-- NEVER nulls `city` -- that column is `mw-members.mjs`'s domain, not this importer's, and this
-- rollback must not touch a column it did not itself set.
--
-- Safe only before a member or admin has edited a household's address by hand: once a real edit
-- exists, this rollback would discard it too, the same caveat `mw-members.rollback.sql`'s own
-- header gives ("before any real portal, admin, or renewal edit has touched an imported row").
--
-- Write-only (three UPDATEs plus their own audit rows), so run via `--file` per the migration
-- convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/household-address-seed.rollback.sql

UPDATE households SET address_line1 = NULL
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:household-address' AND action = 'import.update' AND entity = 'household' AND entity_id IS NOT NULL
);

UPDATE households SET state = NULL
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:household-address' AND action = 'import.update' AND entity = 'household' AND entity_id IS NOT NULL
);

UPDATE households SET postal_code = NULL
WHERE id IN (
  SELECT DISTINCT entity_id FROM audit_log
  WHERE actor = 'import:household-address' AND action = 'import.update' AND entity = 'household' AND entity_id IS NOT NULL
);

DELETE FROM audit_log
WHERE actor = 'import:household-address' AND action = 'import.update' AND entity = 'household';

DELETE FROM audit_log
WHERE actor = 'import:household-address' AND action = 'import.batch' AND entity = 'household' AND entity_id IS NULL;

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:household-address', 'import.rollback', 'household', NULL,
        'household-address-seed.mjs rollback: nulled address_line1/state/postal_code on every seeder-touched household and removed its audit trail');
