-- asc-club migration 0010 verify: run via `--command` (all SELECTs).
SELECT key, value, updated_by FROM settings
  WHERE key IN ('tier_price_individual', 'tier_price_family', 'tier_price_young_adult')
  ORDER BY key;
