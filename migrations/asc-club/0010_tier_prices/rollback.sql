-- asc-club migration 0010 rollback: remove the three tier-price settings rows.
--
-- Safe only before the Club settings screen's own `updateTierPrices` action has ever run:
-- an owner who has since changed a price will have that change silently discarded (the
-- same posture migration 0008's own rollback documents for `asset_payments.method`).
DELETE FROM settings WHERE key IN ('tier_price_individual', 'tier_price_family', 'tier_price_young_adult');
