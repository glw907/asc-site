# 0020_mw_provenance

Adds `members.mw_account_id` (TEXT, nullable) plus a partial unique index
(`idx_members_mw_account`, `WHERE mw_account_id IS NOT NULL`): the stable key the 2026-07-13
full MembershipWorks import (and every re-import after it) matches rows by. Email matching,
the only key the July 7 import had, breaks the moment a member edits their address; MW's own
account id never changes. The index is partial so it never blocks the many rows (existing
members, any future non-MW-sourced member) that carry NULL.

Applied with the standard pattern, scratch-proven against a disposable database
(`asc-club-scratch-0020`, created via `npx wrangler d1 create`, deleted after the proof):

1. Applied migrations 0001-0019 in order to reach the current live schema (`members` first
   exists at 0005).
2. **Forward**: `ALTER TABLE members ADD COLUMN mw_account_id TEXT` then `CREATE UNIQUE INDEX`
   both ran clean (`num_tables` stayed 28; 2 queries, 2 rows written).
3. **Verify**: `has_column = 1`, `has_index = 1`, `duplicate_account_ids = 0` on an empty
   table.
4. **Constraint proof**: inserting two `members` rows with the same non-NULL
   `mw_account_id` in one batch failed with `SQLITE_CONSTRAINT_UNIQUE` on
   `members.mw_account_id`, and the whole batch rolled back (`members` count stayed 0) — D1
   batches statements transactionally, confirming a bad import batch cannot partially land.
   A follow-up batch with two NULL `mw_account_id` rows plus one real value inserted clean
   (`duplicate_account_ids = 0`), proving NULL coexistence and the partial-index behavior
   both hold.
5. **Rollback**: `DROP INDEX idx_members_mw_account` then `ALTER TABLE members DROP COLUMN
   mw_account_id` both succeeded on D1 (SQLite's own `ALTER TABLE ... DROP COLUMN` needs
   3.35.0+; D1 runs a version that supports it, confirmed here rather than assumed).
6. **Verify-empty**: `has_column = 0`, `has_index = 0` after rollback, and the three seeded
   `members` rows survived with the column gone (`n = 3`), confirming rollback removes the
   provenance column without touching unrelated data.

Real run: `npx wrangler d1 execute asc-club --remote --file
migrations/asc-club/0020_mw_provenance/forward.sql`, then `verify.sql`. Rollback discards any
`mw_account_id` values already backfilled (the same caveat 0003's, 0018's, and 0019's
rollbacks document); a re-import from the committed MW archive (`data/membershipworks/`) is
the recovery path.
