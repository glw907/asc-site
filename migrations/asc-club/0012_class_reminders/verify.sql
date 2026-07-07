-- asc-club migration 0012 verify: run via `--command` (all SELECTs).
SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'class_reminders_sent';
SELECT key, value FROM settings WHERE key IN ('refund_window_days', 'refund_notice_lead_days') ORDER BY key;
SELECT id, subject, updated_by FROM email_templates
  WHERE id IN ('class_welcome', 'class_week_out', 'class_day_before', 'class_followup', 'class_refund_window')
  ORDER BY id;
