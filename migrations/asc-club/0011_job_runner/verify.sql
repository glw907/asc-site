-- asc-club migration 0011 verify: run via `--command` (all SELECTs).
SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'renewal_reminders_sent';
SELECT id, subject, reply_to, updated_by FROM email_templates WHERE id = 'renewal_reminder';
