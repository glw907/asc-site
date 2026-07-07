-- asc-club migration 0014 rollback: drop the idempotency table and remove the seeded template.
--
-- Safe only before any real Checkout session has been reconciled through the webhook (see
-- `forward.sql`'s own header): a rollback after that point discards the record of which
-- sessions were already processed, reopening the double-reconciliation race the table exists to
-- close, and discards any owner edit to the `payment_receipt` wording made since it was seeded.
DROP TABLE processed_stripe_sessions;
DELETE FROM email_templates WHERE id = 'payment_receipt';
