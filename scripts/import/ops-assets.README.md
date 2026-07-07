# ops-assets: import asc-ops's asset domain into asc-club

## What this does

Reads the read-only `asc-ops` database's asset domain (`asset_types`, `assignments`, the
non-class rows of `waitlist`) and upserts it into `asc-club`'s `asset_types`,
`asset_assignments`, `asset_payments`, and `asset_waitlist` tables. `asc-ops` is never
altered. Re-running is safe: a row whose mapped columns already match is skipped, a row
that differs is updated, and no row is ever duplicated (natural-key upsert; see "Field
mapping" below for each table's key).

**ASSETS ATTACH TO MEMBERSHIPS, NOT PEOPLE** (the redesign's correction of asc-ops's own
workaround model): every asc-ops person is matched to an asc-club `members` row BY EMAIL,
and a matched assignment lands on that member's household's CURRENT (this season's)
membership, never on the person directly. A person with no matching `members.email` is
never invented into a new member; their assignments and waitlist entries stay unimported.

## Field mapping

### `asset_types`

| asc-club column | asc-ops source | Notes |
|---|---|---|
| `id` | `id` | verbatim reuse (`mooring`, `rv_parking`, `boat_parking`, `small_boat`) |
| `name` | `name` | verbatim |
| `fee` | `fee` | asc-ops stores whole cents; converted to asc-club's whole-dollar convention (`fee / 100`) |
| `capacity` | `capacity` | verbatim |
| `sort_order` | `sort_order` | verbatim |

### `asset_assignments`

| asc-club column | asc-ops source | Notes |
|---|---|---|
| `id` | n/a | `ops-assignment-<asc-ops id>`, a stable natural key |
| `asset_type` | `asset_type` | verbatim |
| `membership_id` | `person_id` (via email) | resolved: ops person -> asc-club member by email -> that member's household -> the household's `memberships` row for `settings.current_season` |
| `description` | `description` | verbatim |
| `status` | `status` | `'active'` -> `'active'`, `'cancelled'` -> `'released'` |
| `created_at` | `created_at` | preserved verbatim as a genuine historical timestamp |

**Full assignment history carries over, active and released alike.** asc-ops's own
`status IN ('active','cancelled')` maps onto asc-club's `status IN ('active','released')`,
because asc-club's schema was designed from the start to hold a released assignment as
history (the ratified DDL's own comment: "per-season fee state lives in payments rows, NOT
as a mutable flag"). The admin screens read only `status = 'active'` for the two "who holds
what now" lenses; a released row is imported but not surfaced there, by design.

**Unmatched holders are never invented into new members.** An asc-ops `people` row whose
email has no matching `members.email` (a real club member the MembershipWorks import never
captured, or one of asc-ops's own leftover QA-seed rows) has its assignments and waitlist
entries left unimported. The live run (2026-07-07) held back 5 assignments across 3 real
holders; the full machine-local report (real names and emails, never committed) lives at
`~/.local/asc-data/ops-assets-unmatched.md`, regenerated on every run.

### `asset_payments`

asc-ops's own `payments` table is the dead ledger the ratified schema's own comment names
("the ledger ops's dead payments table intended") -- it is empty on the real database and
this script never reads it. The real payment state asc-ops carries lives on `assignments`
itself.

| asc-club column | asc-ops source | Notes |
|---|---|---|
| `id` | n/a | `ops-payment-<asc-ops assignment id>` |
| `assignment_id` | n/a | `ops-assignment-<asc-ops assignment id>` |
| `season` | n/a | asc-club's own `settings.current_season` |
| `amount` | n/a | the imported asset type's CURRENT fee (whole dollars). **Documented approximation**: asc-ops never snapshotted the fee an individual assignment was actually billed at, so this script snapshots today's fee instead, the same reasoning the MW member import's `paid_at`-from-renewal-date approximation documents. Every payment row's own audit `detail` says so, in case a future accounting reconciliation needs to find every row needing a real snapshot. |
| `stripe_ref` | `stripe_payment_id` | verbatim |
| `paid_at` | `payment_sent_at`, only when `payment_status = 'paid'` | `NULL` for `'sent'` (invoiced, outstanding), matching the schema's own convention |

A row imports only when `payment_status` is `'paid'` or `'sent'`; `'not_requested'` means
never billed, nothing to import.

### `asset_waitlist`

Only asc-ops `waitlist` rows with `waitlist_type != 'class'` (the class-signup queue is
pass 2.1's own public-form import; this script skips those entirely). Asset queues are the
continuous, multi-year physical lists the ratified schema's own comment names -- unlike the
seasonal class waitlist, they never reset -- so `position` carries straight over.

| asc-club column | asc-ops source | Notes |
|---|---|---|
| `id` | n/a | `ops-waitlist-<asc-ops waitlist id>` |
| `asset_type` | `item` | **documented judgment call**: asc-ops's `item` column plays the same role for an asset row that it plays for a class row (the specific target, `waitlist_type` naming only the broad category). The live database carries zero non-class waitlist rows as of this import, so this mapping is unverified against real data; confirm against the first real asset-waitlist row asc-ops (or, going forward, the new admin screen) ever creates. |
| `member_id` | `person_id` (via email) | resolved the same way an assignment's holder is |
| `position` | `position` | verbatim; a `NULL` position (should not occur for an asset row, unlike a class row's `'offered'` state) is refused rather than written, since the target column is `NOT NULL` |
| `requested_at` | `requested_at` | verbatim |
| `notes` | `notes` | verbatim |

## Audit trail

Every insert or update is audited: `actor='import:ops'`, `action='import.insert'` or
`'import.update'`, `entity` one of `'asset-type'`, `'asset-assignment'`, `'asset-payment'`,
`'asset-waitlist'`, `entity_id` the asc-club id, `detail` carrying the run's batch id
(`ops-assets-<UTC timestamp>`) and the asc-ops source id (or the amount-approximation note,
for a payment row). Every run, even a complete no-op, also audits one
`action='import.batch'` summary row (`entity='asset'`, `entity_id=NULL`) recording the
inserted/updated/unchanged totals and the matched/unmatched counts for both assignments and
waitlist entries.

## How to run

```sh
node scripts/import/ops-assets.mjs --dry-run   # prints the plan, executes nothing
node scripts/import/ops-assets.mjs             # applies it to the real asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and
network access to the real `asc-ops` and `asc-club` databases; both are always `--remote`,
there is no local-D1 mode for this script. Every run writes (overwrites) the machine-local
unmatched-holders report to `~/.local/asc-data/ops-assets-unmatched.md`, real names and
emails, never committed.

`--club-db-name NAME` and `--ops-db-name NAME` override the write target and read source
together; only ever used to scratch-prove this script (including its rollback file) against
a disposable pair of databases, never for a real run.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/ops-assets.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

Expect 4 asset types, 85 assignments (38 active / 47 released), 76 payments, 0 waitlist
rows (as of the 2026-07-07 live run), and the FK-chain proof's two joined counts matching
the corresponding table counts exactly (no orphan).

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/ops-assets.rollback.sql
```

Removes every asset-type, assignment, payment, and waitlist row this importer has ever
created, in full (see the rollback file's own header for why this is not scoped to a single
run's batch id, and for the child-before-parent deletion order). Only safe before any later
pass (the assets admin screens) has written real admin edits into these rows; once real
admin edits exist, a full rollback would discard them too. Scratch-tested (a disposable
pair of databases, `--club-db-name`/`--ops-db-name`, matching this script's own real
2026-07-07 run's shape) before ever running against the real database: the import applied
cleanly, a second run was a true no-op, and the rollback reduced all four tables back to
zero rows.
