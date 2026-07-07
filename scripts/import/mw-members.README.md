# mw-members: import the MembershipWorks export into asc-club's member core

## What this does

Reads the MembershipWorks (MW) export CSV (146 rows, all primary accounts; see
`docs/mw-export-findings.md` for the export's own structural findings) and, per row, creates one
`households` row, one primary `members` row, and one current-season `memberships` row in
`asc-club`. The source file is never committed: PII, stashed machine-local at
`~/.local/asc-data/mw-export-2026-07-07.csv` and read only at run time (`--source` overrides the
path). `Parent Account ID` is empty throughout the export, so every row is a household's primary
member; sub-members (MW's "Additional Contacts") are a later import.

Idempotent by natural-key upsert on `members.email`: a row whose email already exists in
`asc-club` is left completely untouched (the same "never overwrite on match" rule
`src/admin-club/lib/people.ts`'s `ensureMember` sets for the public-signup path), so re-running the
whole file after the first successful run creates 0 new rows.

## Field mapping

| asc-club column | MW export source | Notes |
|---|---|---|
| `households.name` | `Account Name` | verbatim |
| `households.city` | `Address (City)` | `NULL` if blank |
| `members.name` | `First Name` + `Last Name` | joined with one space, trimmed |
| `members.email` | `Email` | trimmed, lowercased |
| `members.phone` | `Phone` | normalized to E.164 with a +1 default (below) |
| `members.directory_visibility` | `Do not list in directory`, `Do not show street address in profile` | derivation below |
| `memberships.season` | n/a | read from `asc-club`'s own `settings.current_season` at run time (2026 as of this import), not hardcoded |
| `memberships.tier` | `Family` / `Single` / `Young adult` one-hot flags | `Family` -> `family`, `Single` -> `individual`, `Young adult` -> `young-adult`; a row setting zero or more than one flag is refused |
| `memberships.price_paid` | n/a | the published tier price, snapshotted: `individual` 250, `family` 500, `young-adult` 100 (whole dollars, matching `TIER_PRICING` in `src/admin-club/lib/demo-members.ts`) |
| `memberships.paid_at` | `Renewal Date` | parsed to a civil-date ISO string (`YYYY-MM-DD`); this is the renewal date, not a real payment timestamp, an explicit judgment call this import makes (below) |
| `memberships.stripe_ref` | n/a | always `NULL` |

Dropped whole, per the lean-data ruling `docs/mw-export-findings.md` already records: all social
columns, business-card/gallery URLs, profile description, autocorrect/IP columns, `Address
(Full)`, the student-history columns (`Intro student` / `Intermediate student` / `Youth student`,
class-history marks, not enrollments), and every asset column (asc-ops remains the sole asset
authority; MW's asset flags are vestigial, 7 total vs ops's 36 real asset-holders).
`birthdate` is left `NULL`: the export carries no birthdate column.

## `paid_at` is the renewal date, not a real payment date, deliberately

The ratified schema's own comment on `memberships.paid_at` reads "`NULL` = invoiced/pending;
membership ACTIVATES on payment" — a real payment timestamp. MW's export carries no payment date
at all, only a `Renewal Date` (when the membership next comes due). This import writes the
renewal date into `paid_at` anyway, a documented approximation rather than leaving 146 real,
currently-active households showing as unpaid: every `import.insert` audit row and the batch
summary row both carry the note `payment inferred from renewal date; reconcile on accounting
export`, so this approximation is visible in the data's own provenance, not just this file.

## Directory visibility

`Do not list in directory` set -> `hidden` (wins over everything else). Otherwise, any per-field
suppression column set (today just `Do not show street address in profile`) -> `partial`.
Otherwise -> `visible`. A row can set both `Do not list in directory` and the suppression column
(2 real rows do); `hidden` still wins, since it is the stronger request.

## Phone normalization

E.164 with a +1 default, per `docs/mw-export-findings.md`'s own ruling: strip every non-digit
character, then a 10-digit result gets `+1` prefixed and an 11-digit result starting with `1` gets
a bare `+` prefixed. Confirmed against every phone shape the real export actually carries (bare
10/11 digit, dashed, spaced, parenthesized, and already-`+1`-prefixed forms all normalize to the
same value); any other digit count is refused rather than guessed at.

## Refusals

A row is refused, reported, and never written for two reasons:

- **Not exactly one tier flag set** (`Family`/`Single`/`Young adult`): zero or more than one.
- **A duplicate email within the same CSV**: the first occurrence (in file order) is imported, a
  later row naming the same email is refused. This is independent of the idempotent-upsert check
  above, which compares against rows already in `asc-club`, not against other rows in the same
  file.

Neither case occurs in the real 2026-07-07 export (146 rows, 0 refusals on the real run below);
both are exercised by the synthetic test fixture
(`src/tests/fixtures/mw-export-synthetic.csv`).

## Credits

**No `credit_grants` rows are ever created by this import.** Geoff's rule: the ledger starts
empty, the committee enters real balances by hand.

## Recurring billing follow-up (8 accounts)

`Billing Method = Recurring` accounts lose their auto-billing once MembershipWorks retires
(the names and emails live machine-local at `~/.local/asc-data/mw-recurring-followup.md`,
never in this public repo, the same rule the export file itself follows); no
card data migrates, by design. These 8 accounts import cleanly (their membership row is identical
to a one-time payer's), but each owner needs one courteous email explaining the change and
pointing at the new renewal flow once it exists:


## Audit trail

Every created household and member is audited individually: `actor='import:mw'`,
`action='import.insert'`, `entity='household'` or `'member'`, `entity_id=<the asc-club id>`,
`detail` carrying the run's batch id (`mw-members-<UTC timestamp>`) and the source MW `Account
ID`; the member row's own detail also carries the resolved `tier`. `memberships` rows are not
separately audited: each one is created in the same statement batch as its household and member,
one-to-one, so the household's own audit row is sufficient provenance. Every run, even a complete
no-op, also audits one `action='import.batch'` summary row (`entity_id=NULL`) carrying the source
count, the created/skipped/refused totals, the tier and visibility distributions, the recurring-
billing count, and the payment-inference note.

## How to run

```sh
node scripts/import/mw-members.mjs --dry-run   # prints the plan, executes nothing
node scripts/import/mw-members.mjs             # applies it to the real asc-club, spot-checks 3 rows
node scripts/import/mw-members.mjs --source /path/to/other-export.csv
```

Needs `CLOUDFLARE_API_TOKEN` in the environment (wrangler picks it up automatically) and network
access to the real `asc-club` database; always `--remote`, there is no local-D1 mode for this
script.

## Verify

```sh
VERIFY_SQL=$(grep -v '^--' scripts/import/mw-members.verify.sql | grep -v '^\s*$')
npx wrangler d1 execute asc-club --remote --command "$VERIFY_SQL"
```

## Rollback

```sh
npx wrangler d1 execute asc-club --remote --file scripts/import/mw-members.rollback.sql
```

Removes every household/member/membership row this importer has ever created, in full (see the
rollback file's own header for why this is not scoped to a single run's batch id, and for the
circular-reference unwind order it uses). Only safe before any later pass (the member portal, the
admin member screens) has written a real edit into these rows; once real edits exist, a full
rollback would discard them too.

## Real run results (2026-07-07)

Ran against the real `asc-club` database with the real 146-row export:

- **First run:** 146 created, 0 skipped, 0 refused. `households`/`members`/`memberships` all at
  146, matching the export's own row count exactly (every row is a primary account with no prior
  `asc-club` member data to collide with).
- **Tier distribution:** `family`=68, `individual`=65, `young-adult`=13, exactly matching
  `docs/mw-export-findings.md`'s own aggregate.
- **Visibility distribution:** `visible`=102, `partial`=39, `hidden`=5, matching the export's 5
  `Do not list` flags and 41 `Do not show street address` flags minus the 2 accounts that set
  both (those 2 count as `hidden`, not `partial`).
- **Recurring billing:** 8, exactly matching the export's own count (the machine-local list above).
- **Re-run (idempotence):** 146 already present, 0 created, 0 refused; the real database's
  `households`/`members`/`memberships` counts were unchanged at 146/146/146 after the re-run.
- **Spot check:** `--spot-check 3` re-queried 3 newly-created rows from the real database
  immediately after the write and confirmed every mapped field (name, email, phone, directory
  visibility, household name and city, tier, price paid, paid_at) matched the value this import
  itself computed from the source row; a second, independent manual check (outside this script,
  re-deriving the expected phone/tier/visibility straight from the raw CSV with no shared code
  path) confirmed the same 3 rows' `members`/`households`/`memberships` columns match the source
  CSV field-by-field.
- **FK-chain proof:** a joined query on one real imported household
  (`households.primary_member_id = members.id`, `members.household_id = households.id`,
  `memberships.household_id = households.id`) confirmed all three ids are mutually consistent
  against the real database, not just the `fakeD1` test double.
