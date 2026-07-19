-- Undoes 0030_contact_confirmation/forward.sql: drops the one new table (and its two indexes,
-- which SQLite drops with the table). Safe only before any real contact confirmation exists: this
-- discards rows, not just structure, exactly like every other additive migration's rollback in
-- this directory (see 0027_directory_domain/rollback.sql's own header for the same caveat).
DROP TABLE contact_confirmations;
