# asc-auth migration 0001: role rename

## What this does

Renames the two granted role values on the `editor` table of `AUTH_DB` (database
`cairn-asc-auth`, this site's own magic-link auth store -- distinct from `asc-club`, which
`migrations/asc-club/` owns): `owner` -> `Administrator`, `club-admin` -> `Club manager`. Data
`UPDATE` only, no schema change.

This is the grant-row half of the roles-adoption pass's T2
(`docs/2026-07-19-asc-roles-adoption.md`, `docs/2026-07-18-admin-sidebar-2-design.md` decision 8):
`src/theme/cairn.config.ts`'s `defineRoles` vocabulary moves from the initiative-5 pair
(`owner`/`club-admin`) to five plain-function names. `defineRoles` reserves and hard-requires the
literal `owner` key (it throws without one, and throws unless it maps to owner capability), so the
vocabulary keeps an `owner: 'owner'` entry declared and never granted again; `Administrator` is the
real, granted owner-capability name from here on. The last-owner guard stays safe across both
names -- `ownerLevelRoles(roles)` (not the literal `'owner'` string) is the set it counts across,
and it resolves to `{owner, Administrator}` (`src/tests/roles-vocabulary.test.ts` pins this).

## Why this is a data migration, not a schema migration

The live `editor` table carries **no** role `CHECK` constraint: cairn's own `0001_roles.sql`
(`node_modules/@glw907/cairn-cms/migrations/`) dropped it, applied to the live `cairn-asc-auth`
database during initiative 5 (`docs/status-archive.md`'s initiative-5 entry). The frozen
`migrations/0000_auth.sql` at this repo's root still shows the old
`CHECK (role IN ('owner','editor'))` -- that file is a seed for a fresh database, not the live
shape, and stays untouched (per this repo's `CLAUDE.md`: `AUTH_DB` takes migrations normally, but
`0000_auth.sql` is frozen). Role validity has lived at the app layer, against the site's declared
vocabulary, since that constraint lifted.

## Deploy order (lockout-safe by construction)

Apply this **only after** the code declaring the new `roles` vocabulary has deployed and is
serving. The vocabulary keeps declaring the reserved `owner: 'owner'` entry alongside
`Administrator`, so a live row still reading `owner` keeps resolving to owner capability right up
until this migration runs -- never a window where a live row's role name is absent from the
vocabulary (`resolveCapability` fails such a row closed to `'none'`).

That dual-name safety argument holds only for the `owner`/`Administrator` pair: `club-admin` left
the vocabulary entirely (T2's five-role vocabulary has no reserved `club-admin` entry the way it
keeps one for `owner`), so a live `club-admin` row during this same window would resolve to `none`
capability and be locked out until this migration applies. The window is closed by a verified
precondition instead of dual-name validity: no `club-admin` rows exist on the live `editor` table
today (verified 2026-07-19, `forward.sql`'s own header), and the grant UI built against the new
vocabulary can no longer mint one, so the gap this asymmetry describes has no row to affect.

This description superseded an earlier, retired claim that a live `owner`-role session would be
403'd from `/admin/club` during the deploy window because the old, hardcoded `CLUB_ROLES` array
(`src/admin-club/lib/club-db.ts`) no longer listed the literal `owner` string. That described the
pre-T4 enforcement mechanism. T4 (`docs/2026-07-19-asc-roles-adoption.md`) replaced it: `/admin/club`
enforcement now runs through `canReach` (`node_modules/@glw907/cairn-cms/dist/auth/access.js`),
whose owner-capability branch short-circuits `true` before any map lookup
(`if (editor.capability === 'owner') { return true; }`, evaluated ahead of every other check). A
live row still reading `owner` keeps resolving to owner capability throughout the deploy window
(above), so it is admitted to `/admin/club` and everywhere else the whole time -- the guarantee is
stronger than the retired claim, not weaker: there is no window in which a live owner-capability
session is denied. The conductor still applies this migration immediately after the code deploy
verifies serving, closing the window promptly as a matter of hygiene, not because it is unsafe left
open.

## How to run

```sh
source ~/.local/secrets && npx wrangler d1 execute cairn-asc-auth --remote --file migrations/asc-auth/0001_role_rename/forward.sql
```

## Verify

```sh
source ~/.local/secrets && npx wrangler d1 execute cairn-asc-auth --remote --command "$(grep -v '^--' migrations/asc-auth/0001_role_rename/verify-forward.sql)"
```

Expect zero rows: no row is left reading `owner` or `club-admin`.

## Rollback

```sh
npx wrangler d1 execute cairn-asc-auth --remote --file migrations/asc-auth/0001_role_rename/rollback.sql
```

Safe any time: a data-only `UPDATE` reversal, no schema touched.

## Scratch-proof procedure

Per the repo's standing migration discipline (mirroring `migrations/asc-club/0032_signature_uniqueness/README.md`'s own recipe):

1. Fresh, disposable `--persist-to` directory, distinct from the repo's own `.wrangler/` state.
2. Apply the root `migrations/0000_auth.sql` (the frozen seed, the base `editor`/`magic_token`/
   `session` schema), then cairn's own `node_modules/@glw907/cairn-cms/migrations/0001_roles.sql`
   (drops the role `CHECK` constraint) -- reproducing the live shape this migration targets, both
   `--local --persist-to <scratch dir>`.
3. Seed representative rows: two `owner` rows, one `club-admin` row, and one `instructor` row that
   must **not** change.
4. Apply `forward.sql`.
5. **Verify**: run `verify-forward.sql`; expect zero rows (no row reads `owner`/`club-admin`).
   Separately confirm the two former-`owner` rows now read `Administrator`, the former-`club-admin`
   row reads `Club manager`, and the `instructor` row is untouched.
6. **Rollback**: apply `rollback.sql`; confirm no error.
7. **Verify-rollback**: run `verify-rollback.sql`; expect zero rows (no row reads
   `Administrator`/`Club manager`). Confirm the original four rows are back to their pre-migration
   names.
8. **Forward again**: re-apply `forward.sql`; confirm no error.
9. Delete the scratch persistence directory.

See the task report for the full transcript.
