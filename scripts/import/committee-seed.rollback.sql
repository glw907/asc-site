-- committee-seed rollback: undoes committee-seed.mjs's import in full.
--
-- SCOPED BY AUDIT-LOG LOOKUP, not by an id prefix: unlike boat-seed.mjs's deterministic
-- `boat-<assignment id>` ids, this seeder's rows carry freshly generated `randomUUID()` ids (there
-- is no natural source id to prefix them with), so the audit trail this script writes on every
-- insert is the only record of which rows it created.
--
-- Order matters: committee_members and member_positions reference committees/members by id, so
-- they are removed before committees itself.
--
-- Write-only (three DELETEs against the seeded tables plus their own audit rows), so run via
-- `--file` per the migration convention:
--   npx wrangler d1 execute asc-club --remote --file scripts/import/committee-seed.rollback.sql

DELETE FROM committee_members
WHERE id IN (
  SELECT entity_id FROM audit_log
  WHERE actor = 'import:committee-seed' AND action = 'import.insert' AND entity = 'committee_member'
);

DELETE FROM member_positions
WHERE id IN (
  SELECT entity_id FROM audit_log
  WHERE actor = 'import:committee-seed' AND action = 'import.insert' AND entity = 'member_position'
);

DELETE FROM committees
WHERE id IN (
  SELECT entity_id FROM audit_log
  WHERE actor = 'import:committee-seed' AND action = 'import.insert' AND entity = 'committee'
);

DELETE FROM audit_log
WHERE actor = 'import:committee-seed' AND action = 'import.insert'
  AND entity IN ('committee', 'committee_member', 'member_position');

DELETE FROM audit_log
WHERE actor = 'import:committee-seed' AND action = 'import.batch' AND entity = 'committee-seed' AND entity_id IS NULL;

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('import:committee-seed', 'import.rollback', 'committee-seed', NULL,
        'committee-seed.mjs rollback: removed every seeder-created committee, committee_members, and member_positions row and its audit trail');
