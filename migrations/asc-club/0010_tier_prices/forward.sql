-- asc-club migration 0010: the three membership tier prices, as `settings` rows.
--
-- The design suite's own rule ("tier prices are admin-editable settings... never code
-- constants") had no settings rows to back it yet: `demo-members.ts`'s TIER_PRICING
-- (individual 250 / family 500 / young-adult 100) is a fixture-only constant, and 2.2's
-- real join/renewal flows are a later pass's own write path. This migration only lands
-- the settings rows those flows will read; it adds no reader, writer, or consumer beyond
-- the Club settings screen itself (Part 2, this pass).
--
-- `INSERT OR IGNORE` makes this idempotent per-row (the settings table's own `key` PRIMARY
-- KEY): re-running this file, or running it against a database that already carries these
-- three keys for any reason, changes nothing already there. Numbered 0010, not 0009: two
-- concurrent worktrees (`pass-2-2` and `member-portal`) both already claimed migration
-- number 0008 for unrelated tables, and `member-portal`'s own `0008_member_auth` is
-- expected to renumber to 0009 at merge time (see the asc-club-member-portal-auth
-- memory); 0010 leaves that slot free rather than colliding a third time.
INSERT OR IGNORE INTO settings (key, value, updated_by) VALUES
  ('tier_price_individual', '250', 'system'),
  ('tier_price_family', '500', 'system'),
  ('tier_price_young_adult', '100', 'system');

INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES
  ('system', 'migration.seed', 'settings', NULL,
   '0010_tier_prices: tier_price_individual=250, tier_price_family=500, tier_price_young_adult=100');
