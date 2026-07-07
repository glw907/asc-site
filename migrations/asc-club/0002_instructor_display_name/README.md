# asc-club migration 0002: instructor display name

## What this does

Adds one nullable column, `class_instructors.member_name`, so Task 6's classes admin can
assign an instructor by email plus a display name before `members` (2.2's own table)
exists. `member_id` is reused as the instructor's own email in the meantime (see
`forward.sql`'s own header for the full reasoning); nothing else changes.

## Why not widen `member_id` instead

`member_id` is `NOT NULL REFERENCES members(id)`. SQLite cannot relax a `NOT NULL`
constraint without a full recreate-and-copy (the same 12-step migration 0001 avoided for
the `club_roles` `owner` enum value); a plain `ADD COLUMN` avoids that entirely, and an
email is already a unique, stable natural key elsewhere in this schema (`club_roles`).

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0002_instructor_display_name/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(cat migrations/asc-club/0002_instructor_display_name/verify.sql)"
```

Expect one row: `member_name | TEXT | 0` (nullable).

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0002_instructor_display_name/rollback.sql
```

Safe any time before a real instructor assignment exists (see `rollback.sql`'s own header).
