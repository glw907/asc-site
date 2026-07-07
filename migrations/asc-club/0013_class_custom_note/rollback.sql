-- asc-club migration 0013 rollback: drop `custom_note`.
--
-- Safe only before any class has a real note set through the Classes edit screen's own field: an
-- admin who has since written one will have it silently discarded, the same posture migration
-- 0008's own rollback documents for `asset_payments.method`.
ALTER TABLE classes DROP COLUMN custom_note;
