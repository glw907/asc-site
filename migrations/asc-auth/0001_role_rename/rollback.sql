-- Undoes 0001_role_rename/forward.sql: renames the grant rows back to the pre-T2 names. Safe any
-- time (a data-only UPDATE reversal, no schema touched). Matches forward.sql's own shape: a
-- WHERE-scoped UPDATE over the current role value, not a row-id list, so it reverts every row
-- currently named `Administrator`/`Club manager` -- including a row granted under the new names
-- after forward.sql ran, not only the ones forward.sql itself touched.
UPDATE editor SET role = 'owner' WHERE role = 'Administrator';
UPDATE editor SET role = 'club-admin' WHERE role = 'Club manager';
