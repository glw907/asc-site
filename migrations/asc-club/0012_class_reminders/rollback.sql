-- asc-club migration 0012 rollback: drop the per-enrollment tracking table, remove the seeded
-- templates and settings.
--
-- Safe only before the class-reminder set or the refund-window-notice job has run for real (see
-- this migration's own README): once either has, `class_reminders_sent` carries real
-- no-double-fire state that dropping the table discards, and any admin edit to a seeded template
-- or setting is likewise lost, the same posture migration 0010's and 0015_job_runner's own
-- rollbacks document.
DROP TABLE IF EXISTS class_reminders_sent;
DELETE FROM email_templates WHERE id IN ('class_welcome', 'class_week_out', 'class_day_before', 'class_followup', 'class_refund_window');
DELETE FROM settings WHERE key IN ('refund_window_days', 'refund_notice_lead_days');
