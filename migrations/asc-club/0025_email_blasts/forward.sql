-- asc-club migration 0025: the Compose screen's own send-history table (segment-email,
-- docs/2026-07-14-segment-email-design.md).
--
-- `email_blasts` records one row per segment send from `/admin/club/email/compose`: which
-- segment it targeted (`segment_key`, a plain string -- 'current' | 'lapsed' | 'instructors' |
-- 'class:<id>' -- never a foreign key, the same reasoning `announcements.post_id` stays a plain
-- string for a git-owned post), a human-readable snapshot of that segment's description at send
-- time (`segment_label`: a class's own name can change or its enrollment can shift after the
-- send, so this is never re-derived), the composed subject/body, and the counts a blast's own
-- audit trail needs: how many recipients the segment resolved to at send time, how many sends
-- actually succeeded, and how many failed (never fatal -- `sendClubEmail`'s own never-throws
-- contract). Per-recipient detail lives in `email_log` (segment = 'blast:<id>'), not duplicated
-- here.
CREATE TABLE email_blasts (
  id TEXT PRIMARY KEY,
  segment_key TEXT NOT NULL,        -- 'current' | 'lapsed' | 'class:<id>' | 'instructors'
  segment_label TEXT NOT NULL,      -- human description at send time
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
