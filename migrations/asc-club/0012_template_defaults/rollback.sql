-- asc-club migration 0012 rollback: drop `default_subject`/`default_body`.
--
-- SQLite (D1's engine) supports `DROP COLUMN` directly (no recreate-and-copy needed, unlike a
-- `REFERENCES` clause change such as migration 0006's own rollback). Safe only before the Email
-- edit screen's own reset action has ever run against a row: an admin who has since reset a
-- template will have that operation's own record (the defaults it read) discarded, the same
-- posture migration 0008's own rollback documents for `asset_payments.method`.
ALTER TABLE email_templates DROP COLUMN default_subject;
ALTER TABLE email_templates DROP COLUMN default_body;
