-- ops-email-templates verify: all SELECTs, so run via `--command` (the query path; `--file`
-- silently switches to the bulk-import path for a write-only file and returns no
-- per-statement output, per migration 0001's own README note).
--
-- Expected, matching the live asc-ops source read 2026-07-07: 12 rows total (11 ported
-- from asc-ops, 1 authored -- `class_offer`, which has no ops equivalent). Every ported
-- row's `id` is a plain asc-ops slug (asset_approval, asset_denial, asset_signup,
-- billing_inquiry, class_approval, class_denial, class_signup, donation_receipt,
-- payment_notification, payment_receipt, payment_request).

SELECT 'count' AS check_name, COUNT(*) AS value FROM email_templates;

SELECT id, subject, reply_to, updated_by FROM email_templates ORDER BY id;
