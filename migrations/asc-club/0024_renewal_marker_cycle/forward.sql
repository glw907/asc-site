-- asc-club migration 0024: renewal-reminder markers key on the household's own renewal cycle,
-- not on (household_id, touch) forever (the reminder-blast guard rider, docs/plans/
-- 2026-07-14-membership-admin.md's "Close ritual" step 0, part (c)).
--
-- Before this migration, `renewal_reminders_sent`'s primary key was `(household_id, touch)`: once
-- a household's own '30_before' touch fired, that mark existed forever, so a household that
-- renewed a year later never got its next cycle's '30_before' (or any other touch already fired
-- once) -- the marker table had no notion of "which cycle" a mark belonged to.
--
-- `expires_on TEXT NOT NULL` is the household's own renewal boundary at the moment a touch fired
-- (`src/jobs/renewal-reminders.ts`'s own `toCivilDateString(renewalExpiryFrom(paid_at))`, a bare
-- civil date). `UNIQUE (household_id, touch, expires_on)` replaces the old primary key: a mark now
-- scopes to one cycle, so a renewal (a new `paid_at`, hence a new `expires_on`) produces reminders
-- again even though the touch NAME was already used once, in a prior cycle.
--
-- SQLite cannot alter a PRIMARY KEY in place; this is the standard recreate-and-copy
-- (`0006_offer_cascade_on_waitlist_delete`'s own README already establishes this pattern for a
-- different table). The backfill stamps every EXISTING row with its household's CURRENT boundary
-- (`date(MAX(memberships.paid_at), '+1 year')`), not the boundary that was live when the row was
-- originally marked: this is deliberate, not an approximation. A household with no renewal since
-- that mark has an unchanged boundary, so the backfilled value is exactly correct and the mark
-- keeps suppressing this cycle as it always has. A household that HAS renewed since gets a
-- backfilled value equal to its NEW boundary, which retroactively (and harmlessly) treats the old
-- mark as though it belonged to the current cycle -- the one household-level false negative this
-- migration can introduce (a renewed household's very next tick treats an old touch name as
-- already sent for the new cycle, skipping it once). This is the deliberately safe direction: a
-- redundant reminder never fires, and the cycle-scoping goes fully live starting with the tick
-- immediately after this migration applies, for every mark from that point forward.
CREATE TABLE renewal_reminders_sent_new (
  household_id TEXT NOT NULL REFERENCES households(id),
  touch TEXT NOT NULL CHECK (touch IN ('30_before', '7_before', 'day_of', '30_after')),
  expires_on TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (household_id, touch, expires_on)
);

INSERT INTO renewal_reminders_sent_new (household_id, touch, expires_on, sent_at)
SELECT
  r.household_id,
  r.touch,
  (SELECT date(MAX(m.paid_at), '+1 year') FROM memberships m WHERE m.household_id = r.household_id) AS expires_on,
  r.sent_at
FROM renewal_reminders_sent r;

DROP TABLE renewal_reminders_sent;
ALTER TABLE renewal_reminders_sent_new RENAME TO renewal_reminders_sent;

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.schema', 'renewal_reminders_sent', NULL,
   '0024_renewal_marker_cycle: rebuilt with expires_on, UNIQUE(household_id, touch, expires_on)');
