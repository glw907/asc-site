-- asc-club migration 0014: Stripe payment collection (dues, class fees, asset fees).
--
-- The ops parity audit's #1 blocker: the club has no way to collect a payment online today.
-- `src/admin-club/lib/payments.ts`'s `createCheckout` generalizes the site's own proven Stripe
-- Checkout integration (`src/theme/donate.remote.ts`/`donate-pricing.ts`) across three payment
-- kinds; `src/routes/(site)/api/stripe/webhook/+server.ts` is the one place a completed
-- Checkout Session actually reconciles into asc-club's own tables.
--
-- `processed_stripe_sessions` is the webhook's idempotency guard: Stripe retries a webhook
-- delivery it did not get a 200 for, and a `checkout.session.completed` event could otherwise be
-- reconciled twice (double-marking a membership paid, sending a duplicate receipt email). The
-- webhook claims a session by inserting its id here BEFORE reconciling anything; a session id
-- already present means "already handled", a clean no-op rather than a repeat write. `kind`/
-- `ref_id` are carried alongside the session id purely for an operator's own audit trail (which
-- row this session paid for), not read back by any code path.
--
-- `payment_receipt` is the one new `email_templates` row this migration seeds: the member-facing
-- receipt every reconciled payment sends (dues, class fee, or asset fee alike), carrying the
-- 501(c)(3) substantiation language the gap analysis's item 5 asks for
-- (docs/2026-07-07-membership-functionality-gap-analysis.md). `INSERT OR IGNORE` matches
-- migration 0010's own idempotent-seed convention: re-running this file changes nothing already
-- there, and an owner who has since edited the template's wording keeps their edit.
CREATE TABLE processed_stripe_sessions (
  session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('dues', 'class-fee', 'asset-fee')),
  ref_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO email_templates (id, subject, reply_to, body, updated_by) VALUES (
  'payment_receipt',
  'Your payment receipt -- {{item_display_name}}',
  'finance-committee@aksailingclub.org',
  'Hi {{person_name}},

This confirms your payment of **{{amount}}** for **{{item_display_name}}**, received {{payment_date}} (reference {{reference}}).

The Alaska Sailing Club is a 501(c)(3) nonprofit organization. This payment was made in exchange for club membership, instruction, or the use of club property, so it is not a tax-deductible charitable contribution except to the extent its amount exceeds the fair market value of what you received. Keep this receipt for your records.

If you have questions, reply to this email or contact {{committee_email}}.

---
Alaska Sailing Club
aksailingclub.org',
  'authored:payments'
);

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'settings', NULL,
   '0014_stripe_payments: processed_stripe_sessions created, payment_receipt template seeded');
