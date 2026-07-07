-- asc-club migration 0008 verify: run via `--command` (all SELECTs).
SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'asset_payments';

SELECT method, COUNT(*) AS n FROM asset_payments GROUP BY method ORDER BY method;
