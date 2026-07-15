-- Undoes 0025_email_blasts/forward.sql: drops the Compose screen's own send-history table.
--
-- Safe only before the Compose screen has ever sent for real: once it has, `email_blasts`
-- carries the club's own record of every segment blast (subject, body, counts, actor), the same
-- posture `0017_announcements`'s own rollback documents for `announcements`.
DROP TABLE IF EXISTS email_blasts;
