-- asc-club migration 0014 verify: run via --command (all SELECTs).
SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'processed_stripe_sessions';
SELECT id, reply_to, updated_by FROM email_templates WHERE id = 'payment_receipt';
