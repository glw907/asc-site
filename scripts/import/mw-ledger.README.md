# mw-ledger: the MembershipWorks accounting export -> the money ledger

## What this does

Backfills `transactions`/`transaction_lines` (migration `0021_money_ledger`,
`docs/2026-07-13-money-ledger-design.md`) from the same canon accounting export
`mw-members.mjs` already reads: **every one of its 401 rows becomes exactly one `transactions`
row**, no row dropped and no row netted away, unlike that script's own `preprocessAccounting`
(which drops voided rows and cancels refund/charge pairs before the member/membership import
ever sees them -- this script is the reason those rows still need a home).

| Flag | Default | Contents |
|---|---|---|
| `--accounting` | `~/.local/asc-data/mw-accounting-2026-07-13.csv` | the canon accounting export: 401 transactions, Apr 2024 - Jul 2026 |
| `--db` | `asc-club` | the wrangler D1 database name (a `--db-name` scratch database when scratch-proving) |

Dry run is the default (prints the plan, writes nothing); `--apply` gates the real write.

## Categorization -- structural, read straight off the row

- `Items = 'Voided'` -> `kind = 'void'` (14 in the real export).
- a negative `Transaction Total` -> `kind = 'refund'` (9 in the real export).
- everything else -> `kind = 'charge'`.

`source = 'comp'` when `Discount Code` is set and `Transaction Total = 0` (75 in the real
export); otherwise `'stripe'` when `Payment ID` is present, else `'other'`.

## Money, in cents, end to end

Every amount this script parses or writes is CENTS: `parseMoneyToCents` (a local, cents-native
replacement for `mw-members.mjs`'s own `parseMoneyToInt`, which is whole-DOLLARS-only and fits
that script's own `memberships.price_paid` caller) accepts an optional leading `$`, thousands
commas, and up to two decimal places, refusing anything with more or with non-numeric content.
The real accounting export carries genuine fractional-dollar fees (Stripe's own percentage-based
processing fee, mostly) a whole-dollars-only parser would refuse outright.

## The line-item breakdown

The export's own five sub-total columns map directly to `transaction_lines.item` -- this is the
export's own header-plus-lines shape, not a guess:

| Export column | `item` |
|---|---|
| `Membership Sub-Total` | `dues` |
| `Event Sub-Total` | `class-fee` |
| `Donation Sub-Total` | `donation` |
| `Cart Sub-Total` | `asset-fee` (the bundled asset add-ons the spec names: RV parking, mooring, boat storage) |
| `Other Sub-Total` | `other` |

`Handling` and `Total Tax` combine into one additional `other` line when their sum is non-zero.
Every column is taken as its absolute value in cents (`buildSubtotalLines`); the row's `kind`
carries the money's direction, never an individual line's sign (the spec's "everything else
positive" rule -- only a `discount` line is ever negative).

## Comps: the list-price problem

A comped row's own sub-totals are already zero (the discount is baked into the export, there is
no separate "list price, then a deduction" pair of columns). `buildListPriceIndex` derives a list
price per membership tier (from the row's own `Items` text, via `mw-members.mjs`'s
`deriveMembershipTier`) or per event `Reference`, from the SAME export's own highest real
(non-comped, non-voided) sub-total for that key -- the file's own going rate, never an external
assumption. The comp then gets one positive item line at that price plus one `discount` line at
its negative, netting to the row's real zero total. A tier or event `Reference` this export never
charges anyone a real price for (every occurrence happens to be comped) has no list price to
derive from; that comp is REFUSED, never guessed at.

A later charge that itself later gets refunded still counts as a valid list-price source (the
amount actually charged, whatever happened after) -- refund status is orthogonal to whether a
price was real.

**A comped EVENT row with no paid-row price falls back, never refuses.** When every occurrence of
an event `Reference` in the export happens to be comped, `buildListPriceIndex` has no price to
give: the row falls back (1) to the `classes.fee` of the class that `Reference` resolves to via
`mw-members.mjs`'s own `HISTORICAL_CLASS_MAP` (converted dollars-to-cents), and, failing that too,
(2) to a 0-cent item line with no `discount` line and a memo, `"list price unknown; comped"` (the
row's own zero total, so the lines-sum-to-total invariant still holds). A comped MEMBERSHIP row
with no list price is unaffected by this fallback and still refuses -- there is no class to fall
back to.

## Domain linking -- best-effort, never a requirement to write the row

- A `dues` line links to the `memberships` row sharing this transaction's household, `paid_at`
  date, and `price_paid` (the exact three columns `mw-members.mjs` wrote that row from). No match
  (a fully-refunded membership `mw-members.mjs` deleted per the accounting-is-canon ruling, say)
  leaves `membership_id` null -- the money fact is still recorded.
- A `class-fee` line links to a `class_enrollments` row sharing this transaction's `Payment ID` as
  `stripe_ref`, but ONLY when exactly one such enrollment exists for this transaction's household
  (a multi-seat group purchase, several enrollments sharing one `stripe_ref`, cannot be split
  across the transaction's single `class-fee` line -- the invariant that a line touches at most
  one domain row forbids it). A group purchase's `class-fee` line is written with `enrollment_id`
  null in that case; the money fact and the correct amount are still recorded.

## Household resolution and refusals

`Account ID` -> `households` via the already-imported `members.mw_account_id` map. A
Membership or Event row whose account is NON-BLANK but resolves to no household is REFUSED loudly
(never silently skipped) -- `mw-members.mjs` resolved every real account, so a miss here is a
defect to surface, same rule that script follows. A Donation row is exempt from that refusal
regardless of its account.

**A BLANK Account ID never refuses, for any Transaction Type.** `household_id` stays null, and
`payer_name`/`payer_email` snapshot the row's own `Name`/`Email` columns instead (regularized the
same way every other write path is: `normalizeNameCaps`/`normalizeEmail`,
`src/admin-club/lib/member-normalize.js`), same as a Donation row. The row's `memo` notes the
blank account, folding in the `Discount Code` when the row carries one (a voided $0 site-test row,
say, self-describing as `"blank Account ID (discount code: sitetest)"` rather than a bare "why is
this here").

## Refund linking

A `refund`-kind row links to its originating charge within the same netting key
`mw-members.mjs`'s `preprocessAccounting` uses for its OWN (destructive) netting: same
`Account ID` and `Transaction Type`, plus `Reference` for an Event row. Two preferences, in order:

1. the most recent prior UNCONSUMED charge of the IDENTICAL absolute amount (a full refund).
2. failing that -- a PARTIAL refund -- the most recent prior UNCONSUMED charge within the WIDER
   `Account ID` + `Transaction Type` group ALONE, dropping the `Reference` restriction (the real
   export carries a `2st`/`2nd` typo'd-vs-correct `Reference` pair for the identical instance, so a
   charge and its own partial refund can legitimately disagree on `Reference`), whose own `Items`
   text matches (normalized: trimmed, case-insensitive), whose date is on or before the refund's,
   and whose amount is at least the refund's own (a refund can never exceed what it refunds).

Unlike `mw-members.mjs`'s own netting, BOTH rows land in the ledger here -- this only records
`refunds_transaction_id`, never drops either side. An unlinkable refund under either preference
(its charge predates this export, say) keeps `refunds_transaction_id` null; the spec marks that FK
"when identifiable", not mandatory. A row this deep into the plan is worth a human's look even
when it never blocks the write, so an unlinkable refund is also reported as a loud warning line in
the plan output.

**Cross-run linking uses the real database id.** A charge already imported in a PRIOR run keeps
its REAL `transactions.id` when this run re-plans it (rather than minting a fresh, throwaway id),
so a refund for that charge arriving for the first time in a LATER run's export still links to
the id the charge actually has in the database.

## Partial-apply self-heal

This import applies as ONE `wrangler d1 execute --remote --file` call with no cross-statement
transaction (see "Partial-failure recovery" below), so a mid-batch failure can leave a
`transactions` header row committed with none of its `transaction_lines`. Every planning run
queries for exactly that shape (a header with `mw_ref IS NOT NULL` and zero lines) and, for any
found, re-derives that header's lines from the export via the normal mapping and plans them as a
line-only repair -- no `transactions` INSERT, since the header already exists. Repairs are
reported separately from ordinary inserts in the plan output; a re-run after a clean apply (every
header already carries its lines) still plans zero repairs, zero inserts.

## Idempotency key

`mw_ref`, a `sha256` hash (24 hex characters, prefixed `mw-ledger:`) of each row's own identifying
columns (`Date`, `Account ID`, `Transaction Type`, `Reference`, `Items`, `Transaction Total`,
`Payment ID`, `Discount Code`, `Note`) -- the export carries no transaction-id column of its own,
so the row's own content stands in for one. Two rows identical across every one of those columns
collide; `planMwLedgerImport` disambiguates a same-run collision with a `#n` suffix, deterministic
as long as the export's row order stays stable across runs.

A re-run against unchanged input plans **zero inserts**: every row's `mw_ref` is checked against
`transactions.mw_ref` (migration `0021`'s own partial unique index) before it is ever planned as
new.

## Refusals

Refused rows never touch the real database, reported with an account id and a plain-language
reason (never a name or email -- this script's own report stays structural, unlike
`mw-members.mjs`'s, since this backfill runs without a conductor's per-row review step):

- A Membership or Event row whose NON-BLANK `Account ID` resolves to no household (a BLANK
  `Account ID` never refuses -- see "Household resolution and refusals" above).
- A comped MEMBERSHIP row whose tier has no real (non-comped) price anywhere in this export to
  derive a list price from (a comped EVENT row falls back instead of refusing -- see "Comps: the
  list-price problem" above).
- A row whose line breakdown does not sum to its own `Transaction Total` (a defensive check --
  never expected to fire against well-formed real data, the last line of defense against a
  malformed source row reaching a written statement).

## Credits and the QBO fields

`qbo_ref`/`qbo_synced_at` are never populated here (born null, the `qbo-integration` initiative's
own job). No `credit_grants` row is touched by this import, same standing rule
`mw-members.mjs`'s own README names.

## How to run

```sh
node scripts/import/mw-ledger.mjs                    # dry run (default), prints the plan
node scripts/import/mw-ledger.mjs --apply             # applies it to the real asc-club
node scripts/import/mw-ledger.mjs --accounting /path --db asc-club
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
access to the real `asc-club` database; always `--remote`, there is no local-D1 mode for this
script. Run `mw-ledger.mjs` only AFTER `mw-members.mjs` has already imported the households,
members, memberships, classes, and enrollments this script links against -- an out-of-order run
still writes every row (domain links degrade to null, never a refusal on that account alone), but
a subsequent `mw-members.mjs` run does not retroactively backfill this script's already-written
`membership_id`/`enrollment_id` links.

## Partial-failure recovery, and the pre-import backup

Same shape as `mw-members.mjs`: this import applies as ONE `wrangler d1 execute --remote --file`
call with no cross-statement transaction, so a mid-run failure leaves a partial write.

**Before any real (`--apply`) run, take a backup:**

```sh
npx wrangler d1 export asc-club --remote --output /path/to/backup-$(date +%Y%m%d%H%M%S).sql
```

**Recovery after a partial failure is a plain re-run**, same command: the `mw_ref` idempotency
check treats every row this run already wrote as a no-op the second time through, so the re-run
resumes forward from wherever the prior run stopped. A header row that committed without its
lines -- the one partial-write shape a plain re-run alone cannot fix, since its `mw_ref` already
reads as "already imported" -- is caught and repaired automatically by the "Partial-apply
self-heal" pass above; nothing extra to run.

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/mw-ledger.rollback.sql
```

Deletes every `transactions` row with a non-null `mw_ref` (lines first). This import never edits
a pre-existing row, so, unlike `mw-members.rollback.sql`, this rollback has no update-reversal
caveat -- it fully undoes exactly what this script ever wrote.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/mw-ledger.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Real run results

Recorded here by the conductor after Task 5's real run against `asc-club` (scratch-proof of
migration `0021`, the dry-run plan review, the real apply, `verify.sql`, a zero-change re-run). See
`docs/STATUS.md` for the current state of that run.
