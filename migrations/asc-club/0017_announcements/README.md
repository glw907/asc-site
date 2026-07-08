# asc-club migration 0017: the Announce screen's history table

## What this does

Creates `announcements` (`id`, `post_id`, `post_title`, `emailed`, `email_count`,
`discord_channel`, `actor`, `created_at`) plus `idx_announcements_post`. No existing table
changes.

## Why

The Announce screen (`/admin/club/announce`) lets an editor email every current member and/or
ping a Discord channel when a post publishes. `announcements` is that action's own record: the
list screen reads it to show "Announced &lt;when&gt; (email to N, #channel)" per post, and the
detail form reads it to warn (not block) when re-announcing a post that already has a row. A row
is written even when only one of the two channels is used (`emailed = 0` and `discord_channel`
non-null, or the reverse), and a post can carry more than one row over time (a correction, a
resend); there is no uniqueness constraint.

## How to run

**NOT YET APPLIED to the real `asc-club` database.** Run this once the Announce screen ships:

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0017_announcements/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0017_announcements/verify.sql)"
```

Expect the `announcements` table's own `CREATE TABLE` text, the `idx_announcements_post` index's
own text, and `n: 0` (no rows yet on a fresh apply).

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0017_announcements/rollback.sql
```

Safe only before the Announce screen has ever sent for real (see `rollback.sql`'s own header).

## Proved locally, not against the real database

This migration was proved against a local D1 replica only (`wrangler d1 execute asc-club
--local`, migrations 0001 through 0017 applied in order), per this pass's own instruction not to
touch the real `asc-club` database. `0017` is the next free number as of this writing (verified
by listing `migrations/asc-club/`); no collision to resolve.
