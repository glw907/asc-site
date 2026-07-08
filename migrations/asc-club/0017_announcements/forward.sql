-- asc-club migration 0017: the Announce screen's own history table.
--
-- `announcements` records one row per send attempt from `/admin/club/announce/<postId>`: which
-- published post, whether it went to every current member's email (and how many recipients that
-- reached), which Discord channel it pinged (if any), who sent it, and when. `post_id` and
-- `post_title` are plain text, not a foreign key: a post is git content (src/content/posts/),
-- never a row in this database, the same reasoning `events`/`classes` never reference a git-owned
-- concept either. `post_title` is a snapshot at send time (a later content edit must not rewrite
-- history here, the same reasoning `memberships.price_paid` snapshots a tier's price).
--
-- A post can be announced more than once (a correction, a resend to a channel that was down):
-- the table has no uniqueness constraint on `post_id`, and the Announce screens read the latest
-- row per post for their own "already announced" display, never enforce a one-row limit.
CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  post_title TEXT NOT NULL,
  emailed INTEGER NOT NULL DEFAULT 0,   -- 0/1: whether the "email all current members" option ran
  email_count INTEGER NOT NULL DEFAULT 0,
  discord_channel TEXT,                 -- one of discord.ts's DiscordChannel values, or NULL
  actor TEXT NOT NULL,                  -- the editor who sent it
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_announcements_post ON announcements(post_id);
