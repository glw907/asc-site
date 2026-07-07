-- asc-club migration 0004: waitlist integrity (a fix from the pass 2.1 close reviewer fan-out).
--
-- Two plain lookup indexes, `class_waitlist(class_id)` and `class_offers(waitlist_id)`, for the
-- queries `classes-store.ts` and `offers.ts` already run per class/per entry (0001_substrate
-- shipped `idx_enrollments_class` for the sibling table but missed these two).
--
-- The load-bearing addition is the third index: `UNIQUE (class_id, applicant_email)` on
-- `class_waitlist`. Without it, `enrollments.ts`'s `signUpForClass` has a benign-looking
-- check-then-insert race (read "already on the waitlist?", then insert) that two concurrent
-- submissions of the same form can both pass, landing two waitlist rows for the same person and
-- class; `enrollments.ts`'s own insert now relies on this index to turn that into a clean,
-- already-caught `SQLITE_CONSTRAINT_UNIQUE` refusal instead. SQLite's own null-handling makes
-- this safe for `class_waitlist`'s member-only rows too: `applicant_email` is nullable (the
-- schema's own CHECK allows a row keyed by `member_id` alone), and a UNIQUE index never treats
-- two NULLs as equal, so two different members with no applicant_email on the same class's
-- waitlist never collide against each other.
--
-- Verified safe against the live 5-row-or-fewer table before landing (2026-07-07): the real
-- `asc-club` `class_waitlist` table is currently empty (0 rows; the public signup/waitlist forms
-- have not yet gone live), and a scratch-database proof (0001-0003 applied, seeded rows,
-- attempted `CREATE UNIQUE INDEX` against a deliberately duplicated pair) confirmed both that the
-- index correctly refuses to build over an existing duplicate and that it does not fire on two
-- NULL-`applicant_email` rows. See the migration mechanics memory for the scratch-DB method.
CREATE INDEX idx_waitlist_class ON class_waitlist(class_id);
CREATE INDEX idx_offers_waitlist ON class_offers(waitlist_id);
CREATE UNIQUE INDEX uq_waitlist_class_email ON class_waitlist(class_id, applicant_email);
