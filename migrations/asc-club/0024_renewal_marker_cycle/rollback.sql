-- Undoes 0024_renewal_marker_cycle/forward.sql: restores `renewal_reminders_sent`'s original
-- shape, primary key `(household_id, touch)`, no `expires_on` column.
--
--   npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0024_renewal_marker_cycle/rollback.sql
--
-- Safe only before this migration's own cycle-scoping has produced a SECOND row for the same
-- (household_id, touch) pair (a household renewing after this migration applies, then getting the
-- same touch name fired again for its new cycle): collapsing back onto the old two-column key
-- picks the earliest `sent_at` per pair and silently drops any later cycle's own mark, the same
-- kind of history loss `0023_membership_admin/rollback.sql`'s own header documents for its column
-- removal.
CREATE TABLE renewal_reminders_sent_old (
  household_id TEXT NOT NULL REFERENCES households(id),
  touch TEXT NOT NULL CHECK (touch IN ('30_before', '7_before', 'day_of', '30_after')),
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (household_id, touch)
);

INSERT INTO renewal_reminders_sent_old (household_id, touch, sent_at)
SELECT household_id, touch, MIN(sent_at) FROM renewal_reminders_sent GROUP BY household_id, touch;

DROP TABLE renewal_reminders_sent;
ALTER TABLE renewal_reminders_sent_old RENAME TO renewal_reminders_sent;
