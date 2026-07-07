-- asc-club migration 0011 rollback: drop the reminder-tracking table and remove the seeded
-- template.
--
-- Safe only before the renewal-reminders job has ever run for real (see this migration's own
-- README): once it has, `renewal_reminders_sent` carries real no-double-fire state that dropping
-- the table discards, and any admin edit to the `renewal_reminder` template itself is likewise
-- lost, the same posture migration 0010's own rollback documents for its settings rows.
DROP TABLE IF EXISTS renewal_reminders_sent;
DELETE FROM email_templates WHERE id = 'renewal_reminder';
