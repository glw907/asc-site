-- asc-club migration 0020: MembershipWorks provenance on members.
--
-- The 2026-07-13 full MW import (286 rows) needs a stable import key. Email matching, the
-- only key the July 7 import had, breaks the moment a member edits their address, so every
-- re-run after this migration keys off MW's own account id instead. The column is nullable
-- (existing rows and any future non-MW-sourced member carry NULL); the partial unique index
-- only constrains rows that do carry a value, so it never blocks a NULL-holding row.
ALTER TABLE members ADD COLUMN mw_account_id TEXT;

CREATE UNIQUE INDEX idx_members_mw_account ON members(mw_account_id) WHERE mw_account_id IS NOT NULL;
