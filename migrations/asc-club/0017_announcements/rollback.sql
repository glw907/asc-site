-- asc-club migration 0017 rollback: drop the Announce screen's history table.
--
-- Safe only before the Announce screen has ever sent for real: once it has, `announcements`
-- carries the club's own record of who was notified about what and when, and the "already
-- announced" re-send warning loses its evidence, the same posture migration 0015's own rollback
-- documents for `renewal_reminders_sent`.
DROP TABLE IF EXISTS announcements;
