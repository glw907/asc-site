-- asc-club migration 0017 verify: run via `--command` (all SELECTs).
SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'announcements';
SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_announcements_post';
SELECT COUNT(*) AS n FROM announcements;
