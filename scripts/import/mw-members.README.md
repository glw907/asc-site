# mw-members: the full MembershipWorks history -> asc-club's member/membership/class core

## What this does (v2, 2026-07-13)

Supersedes the 2026-07-07 single-pass primary-only import (still in git history as v1: one
household + member + current-season membership per row, natural-key-upserted on `email`).
v2 reads **three** local sources and plans **six phases**, none of which write anything until the
whole plan is built:

1. **Update pass** over rows already in `asc-club` (matched by `mw_account_id`, then `email` --
   the only key before migration `0020_mw_provenance`): backfill `mw_account_id`, recase names.
2. **New primaries**: household + member. No membership row -- that arrives in phase 4.
3. **Household sub-members** ("Additional Contacts"): resolved to their parent's household via
   `Parent Account ID` -> `mw_account_id`.
4. **Membership history**: one row per net Membership transaction in the accounting export.
5. **Historical classes**: mints `classes` rows for every accounting-referenced class instance
   missing from the database.
6. **Enrollments**: roster-driven where an attendee file exists (validated against accounting),
   an accounting-only fallback otherwise.

None of the three sources are ever committed (PII); every path is read at runtime only:

| Flag | Default | Contents |
|---|---|---|
| `--source` | `~/.local/asc-data/mw-export-2026-07-13.csv` | the full member export: 148 primaries + 138 household sub-members (286 rows) |
| `--accounting` | `~/.local/asc-data/mw-accounting-2026-07-13.csv` | the canon accounting export: 401 transactions, Apr 2024 - Jul 2026 (Membership/Event/Donation) |
| `--attendees` | `~/.local/asc-data/mw-attendees/` | a directory of per-event roster CSVs, `<season>-<slug>.csv`, arriving class by class (13 of 14 event instances have one as of this pass) |

`docs/mw-export-findings.md` keeps the structural findings this script's mapping depends on, not
the files themselves.

## Accounting pre-processing (`preprocessAccounting`, shared by phases 4-6)

Before any phase reads a Membership or Event transaction:

1. **Drop `Items = 'Voided'` rows** outright (14 in the real export).
2. **Net refunds**: a negative-`Transaction Total` row is matched to its most recent prior
   same-account, same-type (and, for Events, same-`Reference`) positive row of the same absolute
   amount; the pair cancels, both excluded from every later phase. An unmatched refund is refused
   and reported, never guessed at.
3. **Report Donation rows**, never import them (5 in the real export).
4. **Refuse an Event row with an empty `Account ID`** (2 in the real export -- both also happen
   to be `Voided`, so step 1 already removes them; the check still runs independently in case a
   future export carries a non-voided one).

## Field mapping

### Phases 1-3: households, members (from `--source`)

| asc-club column | MW export source | Notes |
|---|---|---|
| `households.name` | `Account Name` | recased via `normalizeNameCaps` (below), never reworded |
| `households.city` | `Address (City)` | `NULL` if blank; primaries only |
| `members.name` | `First Name` + `Last Name` | joined with one space, recased |
| `members.email` | `Email` | trimmed, lowercased; a sub-member's already-claimed address stores `NULL` (below) |
| `members.phone` | `Phone` | E.164 with a +1 default; a primary refuses on an unparseable phone, a sub-member with a blank phone stores `NULL` |
| `members.directory_visibility` | `Do not list in directory`, `Do not show street address in profile` | same three-state derivation as v1 |
| `members.mw_account_id` | `Account ID` | the stable import key migration `0020` added; backfilled on the update pass, set on every create |

**Name recasing** (`normalizeNameCaps`, `src/admin-club/lib/member-normalize.js`, shared with the
live write paths): conservative, per-token, never rewords -- only an all-lowercase or
all-uppercase (length >= 3, not a roman numeral) token is touched, recased to
first-letter-capitalized. `JERRY EDWARD` -> `Jerry Edward`; `McDonald`, `O'Brien`, `James R
Johnson IV` pass through untouched (an interior capital, a digit, or a roman-numeral suffix marks
a token as already deliberately cased).

**Sub-members** (`Parent Account ID` set): `Position/relation` (e.g. `Son`, `Spouse`, `Daughter`)
is NOT stored as a column -- Geoff's call, this pass: messy free text, no feature needs it,
recoverable from the committed archive -- except as provenance in the sub-member's own
`import.insert` audit-row detail. A row whose `Position/relation` reads `Dog` (one real row) is a
non-person and is refused, reported, never imported. A shared-address email already claimed by an
earlier row (in the database or earlier in this same run) stores `NULL` for that sub-member
(the covered-child shape) and is reported, never a hard refusal.

### Phase 4: membership history (from `--accounting`)

| `memberships` column | accounting source | Notes |
|---|---|---|
| `household_id` | `Account ID` -> `mw_account_id` | refused if no household resolves |
| `season` | `Renewal Date After Transaction` (year - 1), falling back to `Date` (year) | fires the fallback for zero accounts in the real data |
| `tier` | leading `Items` segment | `Single`/`Single membership` -> `individual`; `Family`/`Family membership` -> `family`; `Young adult`/`Young adult membership` -> `young-adult`; `Youth membership` (4 historical rows) -> `young-adult` with `mw_tier=Youth` audit provenance; a row naming two tiers is refused, UNLESS the account has an explicit `MEMBERSHIP_TIER_OVERRIDES` entry (below) |
| `price_paid` | `Membership Sub-Total` | never the transaction total -- asset add-ons (RV parking, mooring, boat storage) ride the same charge; unaffected by a tier override, which only changes `tier` |
| `paid_at` | `Date` | the real transaction date, retiring v1's renewal-date approximation |
| `stripe_ref` | `Payment ID` | `NULL` when blank (a comped/no-payment-id row) |

**`MEMBERSHIP_TIER_OVERRIDES`** (Geoff, 2026-07-13): a per-account map consulted ONLY at the
two-tier-refusal branch -- a normal single-tier row never consults it, and it never substitutes
for the separate "no recognized tier" refusal. Account `667e724fa1a5ecb053071dc3`'s
`Single membership - One-time, Family membership - One-time` row is ruled FAMILY tier (a
mid-transaction upgrade, both segments describing the one real membership, not two). The audit
detail for a ruled row carries `mw_tier_ruling=family` plus the original `Items` text, alongside
the row's normal provenance.

**The update-in-place guard (household-scoped, not season-scoped)**: within a household, only its
single MOST RECENT net Membership transaction -- by original chronological order, never by
computed season, which does not track transaction date monotonically -- is ever eligible to
update an existing row in place. That update REWRITES the row's `season` (along with
tier/price_paid/paid_at/stripe_ref) to the transaction's own computed season, guarded exactly as
before: `stripe_ref IS NULL AND paid_at` must equal that account's members-CSV `Renewal Date` (the
July-7 approximation's own signature) -- a row shaped any other way (a real edit, a prior real
run's own write) is left alone and reported, never silently overwritten. EVERY OTHER transaction
for that household always inserts its own history row (never an update, even when a row happens
to already sit at that exact `(household, season)` key). A same-`(household, season)` collision
between two of a household's own transactions is resolved before either classification: the
chronologically later one wins, the earlier is reported as superseded -- this alone guarantees the
real `UNIQUE (household_id, season)` constraint can never be violated, whichever candidate (the
update or an insert) ends up at a given season. This design retires the single-row-per-household
assumption v1's approximation left behind: a household's whole real transaction history now lands
as real rows, not one row wearing the wrong season.

**The delete rule (Geoff's standing ruling, 2026-07-14: accounting is canon)**: a household whose
Membership transactions all refund-netted away to nothing (a full refund, no other transaction)
has ZERO winning candidates in phases above -- its existing row never gets touched by the
insert/update logic at all. When that existing row is still import-shaped (`stripe_ref IS NULL
AND paid_at` equals the members-CSV renewal date) AND a real netted refund/positive pair exists
for the household (positive evidence, never the mere absence of accounting data), it is DELETED:
`action='import.delete'`, `detail` naming the netted pair. A non-import-shaped row is never
deleted -- reported instead, same spirit as the update guard. A household with no Membership
transaction in this run's accounting at all (netted or otherwise) is left alone.

### Phase 5: historical classes

`HISTORICAL_CLASS_MAP` in the script is an explicit `Reference -> {season, slug, idBase, name,
track, start_date}` table for every real Event `Reference` string the accounting export carries
(15 entries: the five class instances -- 1st/2nd Adult-Teen Intro, 1st/2nd Youth Intro,
Intermediate -- for each of 2024 and 2025, plus the four 2026 intro classes' own references,
included so a 2026 Event row is never refused as unmapped even though those rows already exist in
the database). The 2024 "2nd" events include the export's own `2st` typo variant, folded into the
same entry as the correctly-spelled sibling (2024 2nd Youth has ONLY the typo'd reference -- no
correctly-spelled row exists that year).

**`slug` vs `idBase` (verified against the real `asc-club` snapshot, 2026-07-14):** asc-ops's own
`id` and `slug` columns are genuinely distinct values, both carried over verbatim by
`ops-classes.mjs` -- `slug` is the real site URL slug (`adult-intro-class-1`), `idBase` is the
older underscore-cased name (`1st_adult_teen_intro`) attendee filenames and a class row's own `id`
both use. Every `HISTORICAL_CLASS_MAP` entry carries BOTH, and a minted row's own `id` is
`${idBase}_${season}` (season-suffixed, since `id` is the real PRIMARY KEY and must stay unique
across every season this import ever mints, unlike `slug`, which recurs by design under
`UNIQUE(season, slug)`). A hard invariant in `planHistoricalClasses` refuses (never inserts) a
mint whose id OR `(season, slug)` already exists in the database snapshot -- the exact shape of
failure a stale `HISTORICAL_CLASS_MAP` slug once produced: all four already-existing 2026 classes
silently re-minted under a fresh id, 14 inserts instead of the correct 10.

Minted rows use `fee=100`, `capacity=10` (today's convention; the real historical capacity is
unknown), `end_date=NULL` (honest -- not recorded), `visible=1`. An Event reference with no map
entry is refused and reported, never guessed at.

**Deviation from the plan's estimate, verified against the real accounting export (2026-07-13):**
the plan's own end-state note reads "14 classes rows (5 existing + ~9 minted historical)". Direct
reconstruction from the real 401-row accounting export finds **15** distinct season+slug
instances -- both 2024 and 2025 each carry all five class types (1st/2nd Adult-Teen, 1st/2nd
Youth, Intermediate), for 10 to mint, plus the 4 already-existing 2026 intro classes and
`fleet_tuneup` (5 existing) = 15, not 14. This is a real, accounting-grounded count (every
Intermediate-class reference in both 2024 and 2025 has 11 transactions each); the map mints all
10 rather than silently dropping one to match the plan's own approximate estimate.

### Phase 6: enrollments

**Roster-driven** (an attendee file exists, `<season>-<idBase>.csv`): the filename's own
`{season, idBase}` first translates to the real `classes.slug` (`realSlugForIdBase`, a plain
reverse index over `HISTORICAL_CLASS_MAP`'s own values) -- an idBase naming no known class
instance for that season refuses the file outright. Once translated, the file's buyer accounts
(its `Primary = Y` rows) must overlap that class instance's net accounting rows strictly more than
any other class instance's, or the whole file is refused by name and reported, never guessed at.
The overlap metric is `(buyer Account ID, net total)` PAIRS, not bare account-id overlap: bare
accounts alone tie whenever the same buyer purchases more than one sibling class in a season (a
family registering for both the 1st and 2nd youth intro classes, say, ties 1-for-1 on account
overlap alone) -- the two purchases' amounts (the file's own `Total`, the accounting `Event
Sub-Total`) usually differ, and pairs resolve the tie; a genuinely still-tied file still refuses
(the accounting-only fallback covers that event). Within a validated file, each attendee row
becomes one enrollment: matched to a member by normalized full-name equality within the buyer's
household, then first-name + last-initial within the household, then a club-wide unique full-name
match, then the household primary with `identity=approximate` provenance (never inventing a
member). Money: the buyer group's matched net accounting purchase divides over its attendee-row
count (`fee_paid = subtotal / seats`); a roster group with NO matching accounting row (a
comped/manual add -- rosters are supersets of accounting) uses the file's own `Total` instead,
noted. A previously `approximate` enrollment is upgraded in place (`import.update`, `member_id`
changed) once a later run's roster resolves the true attendee -- consumed by the FIRST real
attendee that matches it, so a second real attendee for the same household/class never fans a
second update onto the same enrollment id.

**Accounting-only fallback** (no attendee file; today, only the 2024 Intermediate class): one
enrollment per net Event purchase, the household primary standing in for the whole purchase.
`identity=approximate` for a youth-track class or a multi-seat purchase (which specific
person(s) attended is then unknowable from accounting alone); a single-seat adult-teen purchase
enrolls as if exact (the buyer themselves).

Duplicate `(class, member)` pairs within a run collapse to a skip (the real `UNIQUE (class_id,
member_id)` constraint). Every insert is idempotent against the database's existing pair,
independent of the approximate-upgrade path.

## Refusals

Refused rows never touch the real database. Every phase reports its own refusals with enough
context (account id, a plain-language reason) to act on without re-reading the source CSVs:

- **Phase 1/2**: an unparseable phone on a new primary.
- **Phase 3**: `Position/relation = Dog`; an unresolvable `Parent Account ID`; an unparseable
  phone.
- **Accounting pre-processing**: an unmatched refund; an Event row with an empty `Account ID`.
- **Phase 4**: no household resolves for the transaction's account; no recognized (or two
  recognized, with no `MEMBERSHIP_TIER_OVERRIDES` entry) membership tier; the update-in-place
  guard fails for a household's most-recent transaction; a household's OTHER (non-latest)
  transaction conflicts with an existing row at its own `(household, season)` key (only the single
  most-recent transaction may ever update); the delete guard fails for a household with zero net
  transactions after refund-netting (reported, never deleted).
- **Phase 5**: an Event `Reference` with no `HISTORICAL_CLASS_MAP` entry; a mint whose id or
  `(season, slug)` already exists in the database snapshot (the hard PRIMARY KEY invariant).
- **Phase 6**: an idBase names no known class instance for its filename's season; overlap
  validation fails for an attendee file (refuses the whole file); a buyer account resolves to no
  household; no member (not even a household primary) can be matched.

## Credits

**No `credit_grants` rows are ever created by this import.** Geoff's rule: the ledger starts
empty, the committee enters real balances by hand.

## Idempotency and the second run

A second run against unchanged inputs plans **0 creates and 0 field updates** everywhere:

- Phases 1-3 match every row by `mw_account_id` first (set on every prior create/backfill), so a
  re-run's primaries and sub-members route straight to the "no changes" branch.
- Phase 4 checks, before applying the update-in-place guard, whether the existing row already
  matches the candidate field-for-field INCLUDING `season` (this run's own prior write) -- a plain
  equality check that fires BEFORE the guard, so a re-run never refuses its own output just
  because `stripe_ref` is no longer `NULL` (a `stripe_ref IS NULL` guard read literally against a
  row this same import just wrote would otherwise refuse every single re-run, forever). A
  household's OTHER (non-latest) transactions are checked the same way against their own
  `(household, season)` key, independent of whatever happened to the household's latest one. The
  delete rule fires only when a real netted pair still exists AND an existing row still does too --
  once deleted, a re-run finds no row for that household and plans nothing further.
- Phase 5 only mints a `(season, slug)` missing from the database; nothing to update.
- Phase 6 checks the real `(class_id, member_id)` pair before planning an insert; the one path
  that DOES fire on a later run is the approximate-upgrade (a `member_id` change, `import.update`)
  when a class's attendee file arrives after an earlier accounting-only-fallback run -- by design,
  not a bug: it is the mechanism that lets `mw-attendees/` fill in over time.

`src/tests/mw-members-import.test.ts` proves this at both the per-phase level (each phase's own
"plans nothing on a repeat" test) and end to end (`planMwImport (integration)`'s own
"is idempotent" test, which re-runs the whole plan against a snapshot reconstructed from the first
run's own output).

## Audit trail

Every phase writes its own audit rows under `actor = 'import:mw'`:

- `import.insert` / entity `household`, `member`, `membership`, `class`, `enrollment` -- one per
  created row, `detail` carrying the batch id, the source MW account id, and phase-specific
  provenance (a sub-member's `relation=`, an enrollment's `identity=` match level plus every
  experience/comments answer column and `Check In`).
- `import.update` -- one per changed field set: phase 1's name/`mw_account_id` backfills (naming
  the changed fields and their `from -> to` values), phase 4's in-place membership updates, phase
  6's approximate-to-exact identity upgrades.
- `import.delete` -- phase 4's zero-net-transaction deletes, `detail` naming the netted refund pair.
- `import.batch` -- one per run, `entity_id = NULL`, summarizing every phase's counts (including
  `phase4_deletes`).

## How to run

```sh
node scripts/import/mw-members.mjs --dry-run   # prints the full plan, executes nothing
node scripts/import/mw-members.mjs             # applies it to the real asc-club
node scripts/import/mw-members.mjs --source /path --accounting /path --attendees /dir
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
access to the real `asc-club` database; always `--remote`, there is no local-D1 mode for this
script.

**The report** (`formatReport`, exported and unit-tested) prints the same full before -> after
detail under `--dry-run` AND on a real applied run, not just per-phase counts: every phase-1 field
change; phase 4's refusal and collision lines plus each update's season/tier/price_paid/paid_at/
stripe_ref before -> after; every phase-5 minted class (id, season, slug, name, start_date);
phase-6 per-file stats (matched-by-name counts at each fallback level, comped-group count) and
every `identity=approximate` enrollment (class + household account id); and the accounting
pre-processing's netted pairs, donation rows, and refusal. Names print (a conductor reads this
report locally); an email is always redacted at its own source (`planPrimaryRow`'s
email-collision refusal is the one place a raw email could otherwise reach a printed reason).

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/mw-members.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Partial-failure recovery -- and the pre-import backup

This import applies as **one** `wrangler d1 execute --remote --file` call with no cross-statement
transaction: D1 rejects an explicit `BEGIN`/`COMMIT` inside a `--file`, so there is no way to wrap
the whole batch atomically. A mid-run failure (a network drop, a wrangler timeout, a real D1 error
partway through the statement list) leaves a **partial write**.

**Before any real (non-dry-run) run, take a backup:**

```sh
npx wrangler d1 export asc-club --remote --output /path/to/backup-$(date +%Y%m%d%H%M%S).sql
```

This is the true safety net. The rollback script below only undoes rows this import itself
*created* (`import.insert` audit rows) and explicitly cannot undo an `import.update` field edit
(phase 1's backfills, phase 4's in-place membership updates, phase 6's approximate-to-exact
identity upgrades) -- a backup is the only way back to the exact pre-import state.

**Recovery after a partial failure is a plain re-run**, same command, same flags:
`node scripts/import/mw-members.mjs`. This works because every phase's own idempotency check (see
"Idempotency and the second run" below) treats a row this run already wrote as a no-op the second
time through -- phases 1-3 match by `mw_account_id` (set INLINE on every create, phase 2 included,
never a trailing `UPDATE` that could leave a member row without it mid-batch), phase 4 checks
whether the existing row already matches the candidate field-for-field before its guard, phase 5
only mints a `(season, slug)` still missing, phase 6 checks the real `(class_id, member_id)` pair.
A re-run after a partial failure simply resumes forward from wherever the prior run stopped,
re-planning and writing only what is still missing.

## Rollback -- and its caveat

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/mw-members.rollback.sql
```

Removes every row this import has ever **created** (`import.insert` audit rows: household,
member, membership, class, enrollment), in full, via the same circular-reference unwind order the
July 7 rollback used. **It cannot undo an `import.update` or an `import.delete`.** Phase 1's
name/`mw_account_id` backfills on the pre-existing (July 7) rows, phase 4's in-place update of an
already-current membership row, phase 4's zero-net-transaction delete, and phase 6's
approximate-to-exact identity upgrades all touch a row that already existed before this run --
undoing those means restoring the PRIOR row/value, which this file does not attempt (the audit
log's own `detail` column records the `from -> to` values for every update, and the netted-pair
reason for every delete, so a by-hand reconstruction is possible from `audit_log` if ever needed;
the committed encrypted archives at `data/membershipworks/` are the ground-truth recovery path).
Safe only before any real portal, admin, or renewal edit has touched an imported row.

## Real run results

Recorded here by the conductor after Task C's real run against `asc-club` (dry-run plan review,
the real run, `verify.sql`, spot checks, the FK-chain proof). See `docs/STATUS.md` for the
current state of that run.
