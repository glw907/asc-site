# asc-club migration 0004: waitlist integrity

## What this does

Adds three indexes:

- `idx_waitlist_class` on `class_waitlist(class_id)`
- `idx_offers_waitlist` on `class_offers(waitlist_id)`
- `uq_waitlist_class_email`, a **unique** index on `class_waitlist(class_id, applicant_email)`

The first two are plain lookup speed-ups, matching `idx_enrollments_class` (0001_substrate)
for the queries `classes-store.ts` and `offers.ts` already run per class or per waitlist
entry. The unique index is the load-bearing one: it closes a check-then-insert race in
`enrollments.ts`'s `signUpForClass`, where two concurrent submissions of the same signup
form could both pass an "already on the waitlist?" read before either insert lands, leaving
the same person waitlisted twice for the same class. The insert now relies on this
constraint to turn that race into a clean `SQLITE_CONSTRAINT_UNIQUE` refusal, which
`enrollments.ts` already catches as an honest "you are already on the waitlist" answer
rather than a 500.

## Why the unique index is still safe with a nullable `applicant_email`

`class_waitlist`'s own CHECK allows a row keyed by `member_id` alone, with `applicant_email`
left `NULL`. SQLite's unique-index semantics never treat two `NULL`s as equal, so two
different members with no `applicant_email` on the same class's waitlist do not collide
against each other; only two rows with the SAME non-null `(class_id, applicant_email)` pair
do.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0004_waitlist_integrity/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(cat migrations/asc-club/0004_waitlist_integrity/verify.sql)"
```

Expect three rows: `idx_waitlist_class`, `idx_offers_waitlist`, `uq_waitlist_class_email`.

## Proved safe before landing (2026-07-07)

The real `asc-club` `class_waitlist` table was confirmed empty (`SELECT COUNT(*)` returned
0; the public signup/waitlist forms have not yet gone live) before this migration ran, so
`CREATE UNIQUE INDEX` had nothing to conflict with. A scratch database
(`asc-club-scratch-0004`, created and deleted for this proof only) additionally confirmed
the mechanism itself: applying 0001-0003, seeding a deliberately duplicated
`(class_id, applicant_email)` pair, and attempting `CREATE UNIQUE INDEX` failed with
`SQLITE_CONSTRAINT_UNIQUE` as expected; after removing the duplicate, the same statement
succeeded, and a follow-up duplicate insert was then refused going forward. Two
`NULL`-`applicant_email` rows for the same class inserted without conflict, confirming the
member-only-entry case above.

**Adjacent finding, out of this migration's scope but worth flagging:** the same scratch
proof surfaced that real (remote) D1 now enforces `class_waitlist`/`class_offers`/
`class_instructors`'s `REFERENCES members(id)` foreign keys, including refusing an insert
outright with `no such table: main.members` when the referenced table does not exist at
all yet, not just when a referenced row is missing. Confirmed directly against the live
`asc-club` database (an insert attempt failed the same way; no row was written, so
production data is unaffected). This means the class-waitlist, class-enrollment, and
instructor-assignment write paths cannot actually write to real D1 today, only against the
`fakeD1` test double every existing unit test uses; they will need a `members` table (even
a minimal stub) before they work end to end, ahead of or as part of migration 2.2.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0004_waitlist_integrity/rollback.sql
```

Safe any time (see `rollback.sql`'s own header): dropping an index never discards data.
