-- ops-classes-fee-correction: replaces ops-classes.mjs's import placeholder (fee=0, the
-- schema's NOT NULL floor for a NULL asc-ops source, see ops-classes.README.md's own field-
-- mapping table) with the club's real published class price. docs/2026-07-07-member-portal-
-- design.md records the $100 fee for an additional (non-credit) class; every live imported row
-- was priced NULL in asc-ops (MembershipWorks charged externally), so none of them ever carried
-- a real number here. `capacity` is untouched (still the import's own admin-editable
-- placeholder of 10; the classes admin screen, Task 6, is where a real per-class cap gets set).
--
-- Idempotent: only rows still at the placeholder move, so a re-run after a volunteer has
-- already set a real, different fee through the admin screen leaves that edit alone.
UPDATE classes
SET fee = 100, updated_at = datetime('now')
WHERE fee = 0;

INSERT INTO audit_log (actor, action, entity, entity_id, detail)
VALUES ('correction:ops-classes-fee', 'correction.fee', 'class', NULL,
        'ops-classes-fee-correction: fee 0 -> 100 on every imported class still at the placeholder (the $100/class price, docs/2026-07-07-member-portal-design.md)');
