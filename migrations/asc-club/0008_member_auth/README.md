# asc-club migration 0008: member-facing magic-link authentication

## What this does

Lands the member portal's own D1 auth store (pass 2.2's member portal, Part 1): `member_tokens`
(single-use, hashed magic-link tokens) and `member_sessions` (opaque session rows), mirroring
`@glw907/cairn-cms`'s own self-owned editor auth store
(`~/Projects/cairn-cms/migrations/0000_auth.sql`) at the shape level, adapted to two of this
schema's own conventions instead of cairn's:

- **TEXT `datetime('now')` timestamps**, not cairn's epoch milliseconds, matching every other
  table in this database.
- **A `consumed_at` column, not delete-on-consume.** Cairn's own `magic_token` row is deleted the
  moment it is used (`consumeToken`'s `DELETE ... RETURNING email`); this table instead flips
  `consumed_at`, the same single-use discipline `class_offers.resolved` already uses
  (`src/admin-club/lib/offers.ts`). The consume itself is one conditional `UPDATE ... WHERE
  consumed_at IS NULL AND expires_at > ?`, checked via `meta.changes` exactly like
  `claimOffer`'s own compare-and-set (offers.ts's own header names this "the compare-and-set
  lesson"), not a `DELETE`. The row surviving its own consumption (or expiry) is what lets a
  failed confirm attempt still read back which member it belonged to, for the mockup's "send me a
  fresh link" pre-fill (see `src/member-auth/lib/auth.ts`'s `confirmMemberToken`).

Also seeds one new `settings` row, `renewal_grace_days = '30'`: a mid-pass correction (Geoff,
2026-07-07) moved standing derivation from a season-boundary formula to a rolling one (a
household's own `memberships.paid_at` plus one year), with a grace window after that date before
a household reads as fully lapsed. The window is a Club setting, not a constant, since a future
renewal-reminder cadence and an asset-retention rule are both expected to key on the same value.
`src/admin-club/lib/club-settings.ts` gets one new reader, `getRenewalGraceDays`, alongside its
existing `getOfferWindowHours`/`getCurrentSeason`/`getWaiverTextVersion` (same pattern, same
30-day fallback if the row is ever missing).

Distinct from cairn's own `AUTH_DB` (a separate D1 database, bound in this repo's own
`wrangler.toml`): that store holds content editors, this one holds club members. The two never
blur (`docs/2026-07-07-member-portal-design.md`'s own "the auth surface" section) — different
database, different cookie names (`src/member-auth/lib/crypto.ts`), different session lifetime
policy read independently.

## FK-enforcement check (the 0005/0006 lesson)

Both new tables' `member_id REFERENCES members(id)` columns target a table that already exists
(`members` landed in `0005_member_domain`, and by the time this migration lands the
MembershipWorks import has already populated it), so this migration adds no new "REFERENCES a
table that doesn't exist yet" case the way `0005`/`0006` had to fix.

## Proved safe before landing (2026-07-07)

A scratch database (`asc-club-scratch-0008-<timestamp>`, created and deleted for this proof only,
no real member data touched) confirmed the migration end to end: `0001`-`0008` applied forward in
order with no error (23 tables total after `0008`), then:

- **Structure**: both new tables and all four new indexes appeared in `sqlite_master`; the
  `renewal_grace_days` setting row read back `'30'`.
- **FK enforcement**: with one synthetic household/member row seeded, a valid `member_tokens`
  insert and a valid `member_sessions` insert both succeeded; a bogus `member_id` on each table
  failed with `FOREIGN KEY constraint failed`.
- **Single-use consume**: the conditional `UPDATE member_tokens SET consumed_at = ? WHERE
  consumed_at IS NULL AND expires_at > ?` affected exactly one row (`changes: 1`) on its first
  run against a fresh token, then affected zero rows (`changes: 0`) on an identical second run
  against the now-consumed row, confirming the compare-and-set closes a double-consume race the
  way `claimOffer`'s identical shape does.
- **UNIQUE**: a second insert reusing the same `token_hash` failed with `UNIQUE constraint
  failed: member_tokens.token_hash`.

No real member token, session, or renewal-standing data existed before this migration (no
member-portal write path has shipped yet), so there was no existing data to reconcile.

## How to run

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0008_member_auth/forward.sql
```

## Verify

```sh
npx wrangler d1 execute asc-club --remote --command "$(grep -v '^--' migrations/asc-club/0008_member_auth/verify.sql | grep -v '^\s*$')"
```

Expect two rows naming the new tables, then four rows naming the new indexes, then one row
showing `renewal_grace_days = '30'`.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file migrations/asc-club/0008_member_auth/rollback.sql
```

Safe only before any real member token, session, or renewal-standing data exists: no write path
has shipped yet, so this holds until the member portal actually starts minting tokens.
