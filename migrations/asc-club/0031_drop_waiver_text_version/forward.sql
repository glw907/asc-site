-- asc-club migration 0031: drop the `settings.waiver_text_version` row (member-waivers T5a,
-- docs/2026-07-17-member-waivers-design.md "Seams and sequencing": "`waiver-text.ts` and
-- `settings.waiver_text_version` retire once the document model lands").
--
-- The pre-T2 waiver machinery this row backed is gone: `$theme/waiver-text.ts` (the one global
-- release-text constant) is deleted, and `club-settings.ts`'s own reader (`getWaiverTextVersion`)
-- retired alongside it. The per-document signature model (T1/T2/T4, `$theme/documents.ts` and
-- migration `0029_signature_record`) tracks a signature's wording per document/version/season
-- instead of one global string, so this key has no remaining reader or writer anywhere in the
-- app. A plain `DELETE`, not a schema change: `settings` is a key-value table
-- (`0001_substrate`), so removing one key needs no `CREATE TABLE`/recreate-and-copy, unlike
-- `0029`'s own widened `waiver_acceptances`.
DELETE FROM settings WHERE key = 'waiver_text_version';
INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.drop', 'settings', 'waiver_text_version',
   '0031_drop_waiver_text_version: pre-T2 waiver machinery retired (member-waivers T5a)');
