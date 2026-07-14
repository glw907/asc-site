# The MembershipWorks full import (2026-07-13)

The second and completing MW import: the 2026-07-13 export pair carries the full member picture
(286 rows — 148 primaries + 138 household sub-members, vs the July 7 export's 146 primaries) plus
a 5-row transaction log with the two newest memberships' real payment records. Live `asc-club`
holds exactly the July 7 import (146/146/146, zero rows edited since), so every update below is
safe against pristine import-shaped rows.

Sources (PII): plaintext machine-local at `~/.local/asc-data/mw-export-2026-07-13.csv` (members)
and `~/.local/asc-data/mw-accounting-2026-07-13.csv` (the CANON accounting export, 401
transactions, Apr 2024 – Jul 2026 — Geoff: export-4 is canon; the earlier 5-row export-3 is
superseded and fully contained in it); age-encrypted archival copies committed at
`data/membershipworks/`. Structural findings: `docs/mw-export-findings.md` (updated at close).

Accounting containment facts (verified 2026-07-13): every transaction `Account ID` exists in the
member export; every one of the 148 primaries has at least one Membership transaction (239 rows
across 148 accounts), so real payment dates cover everyone; 157 Event rows span three seasons of
classes; 5 Donation rows; 9 negative-total refunds; 14 `Voided` items; 75 zero-total Event rows,
all discount-code comped (real enrollments, fee 0); membership `Items` bundle asset add-ons, so
membership money reads from `Membership Sub-Total`, never the transaction total.

## Rulings this plan executes (Geoff, 2026-07-13, this session)

1. **Regularize phone format and capitalization for all entries, and keep it going forward** —
   the import rewrites existing rows, and the live write paths normalize from now on. MW names
   are canonical: store the MW name, fixing only case issues (`JOHN SMITH` / `john smith` →
   `John Smith`), never rewording.
2. **One primary phone and one email per member** (reconfirms the lean-data ruling).
3. **The asc-club schema is fully evolvable** — never write around schema shortcomings in code
   (now in CLAUDE.md). Applied here as migration 0020.
4. **Exports live encrypted in the repo with logical names** (done: `data/membershipworks/`).

## Standing rulings that bind

- Verified-import-script pattern: dry-run plan, per-row audit trail, verify.sql, rollback story.
- Migrate-and-verify, never recreate; migrations scratch-proven before the real database.
- No `credit_grants` rows from import (ledger starts empty, committee enters balances by hand).
- Student-history columns are evidence, never enrollments; asset columns ignored (asc-ops is the
  asset authority); social/profile columns dropped.
- The conductor, not a dispatched agent, touches the real `asc-club` database.

## Task A — migration 0020 + import script v2 + tests (cairn-implementer)

**Migration `0020_mw_provenance`** (pattern-conforming directory: forward/rollback/verify/README):
`members.mw_account_id TEXT` plus a partial unique index (`WHERE mw_account_id IS NOT NULL`).
This is the stable import key: email matching breaks the moment a member edits their address.
Scratch-prove forward/rollback/verify on a disposable D1; do NOT touch the real database (the
conductor applies it in Task C).

**Shared normalization module** `src/admin-club/lib/member-normalize.js` (plain JS + JSDoc so the
Node import script and TS worker code share one implementation; `checkJs` is on):

- `normalizeEmail(raw)`: trim, lowercase.
- `normalizePhoneE164(raw)`: the existing rule, moved here — strip non-digits; 10 digits → `+1`
  prefix; 11 starting with `1` → `+`; anything else returns a not-normalizable signal (the import
  refuses; live paths store the trimmed raw rather than block a signup).
- `normalizeNameCaps(raw)`: conservative recase. Per whitespace token: only touch a token made of
  letters/apostrophes/hyphens that is either all-lowercase, or all-uppercase with length ≥ 3 and
  not a roman numeral (`^[IVX]+$`); recase = capitalize each hyphen/apostrophe segment's first
  letter, lowercase the rest; the particle stoplist (of, the, and, van, von, de, der, den, di,
  da, la, le, ter, y) stays lowercase unless it is the name's first token. Tokens with digits,
  quotes, parens, or interior capitals are untouched. Acceptance (real-data cases, as tests):
  `JERRY EDWARD` → `Jerry Edward`; `bruce lee` → `Bruce Lee`; `christian Hendrickson` →
  `Christian Hendrickson`; `AMUNDSEN` → `Amundsen`; `zan` → `Zan`; `Stanbro TL`, `David ‘DJ’`,
  `Christian (CC)`, `James R Johnson IV`, `McDonald`, `O'Brien` all unchanged; `The Family of
  Britt Goudey` unchanged (leading `The` already cased, `of` is a particle).

**`scripts/import/mw-members.mjs` v2** — extend in place (git history keeps v1). Inputs:
`--source` → the 2026-07-13 members CSV; `--accounting` → the canon accounting CSV (401
transactions, Apr 2024 – Jul 2026); `--attendees` → a DIRECTORY of MW per-event attendee CSVs
(`~/.local/asc-data/mw-attendees/`, arriving class by class). Full history imports (Geoff's
call). Six phases, all planned before any write, full before→after detail in `--dry-run`:

**Accounting pre-processing, shared by the phases below.** Drop `Items = 'Voided'` rows (14).
Net refunds: match each negative-total row to its most recent prior same-account, same-type
(and, for Events, same-`Reference`) positive row of the same absolute amount; the pair cancels,
both reported; an unmatchable refund is refused and reported. Donations (5) are reported, never
imported. An Event row with an empty `Account ID` (2) is refused and reported.

**Attendee files.** Each attendee CSV is purchase groups: a `Primary = Y` buyer row (seat
count, `Total`, `Payment ID`/`Discount Code`) followed by one row per attendee (own name,
experience/comments answers, `Check In`), all sharing the buyer's `Account ID`; the ticket
column name varies per event. Files are named `<season>-<class-slug>.csv` by the conductor at
stash time (all 13 identified 2026-07-13 by ticket name, registration year, and buyer-account
overlap against accounting — export-6/8 split 10:1 / 1:12 across the two 2024 adult events);
the script derives `{season, slug}` from the filename and VALIDATES it: the file's buyer
accounts must overlap that event's net accounting purchases more than any other event's, else
the file is refused by name and reported — never guessed. ALL 14 events have a file (the 2024
Intermediate gap closed same-session), so the accounting-only fallback exists in code but
fires for zero events in the real data. Attendee rosters are SUPERSETS of accounting
(comped/manual registrations appear with zero totals and no payment id), so the roster is the
enrollment source of truth and accounting supplies the money.

1. **Update pass over existing rows** (matched by email, the only key pre-0020): backfill
   `mw_account_id`; recase `members.name` / `households.name` where the normalizer differs.
   One `action='import.update'` audit row per changed entity naming the fields changed.
2. **New primaries** (2 in the real data): the existing create path (household + member),
   `mw_account_id` set. Their membership rows arrive via phase 4 like everyone else's.
3. **Sub-members** (138): resolve the parent household via `Parent Account ID` →
   `mw_account_id`; insert a `members` row in that household — normalized name, `email` only if
   not already claimed (in the database or earlier in the run; families share addresses — the
   claimed-elsewhere case stores NULL, the covered-child shape, and is reported), phone
   normalized or NULL, `directory_visibility` by the existing derivation, `mw_account_id` set.
   No membership row, no new household. `Position/relation` is NOT stored (Geoff's call, this
   session: messy free text, no feature needs it; recoverable from the committed archive)
   except as provenance in the sub-member's audit-row detail. A non-person row (the one `Dog`)
   is refused and reported (Geoff's call: skip it).
4. **Membership history** from the net Membership transactions (239 gross, 148 distinct
   accounts — every primary has at least one, verified): per transaction — tier from the
   leading `Items` token (`Single`/`Single membership` → individual, `Family`/`Family
   membership` → family, `Young adult …` → young-adult; the 4 historical `Youth membership`
   rows map to young-adult WITH `mw_tier=Youth` audit provenance and a run-report line — a
   3-value tier enum is not worth a table rebuild for 4 retired-tier rows; a row naming two
   tiers is refused); `price_paid` = `Membership Sub-Total` (asset add-ons ride the same
   charge, so never the transaction total; 0 for a comped row is real); `paid_at` = the
   transaction date; `stripe_ref` = `Payment ID` when present; `season` =
   year(`Renewal Date After Transaction`) − 1, falling back to year(`Date`). The
   CURRENT-season row already in the database updates in place under the guard (only rows
   still import-shaped: `stripe_ref IS NULL AND paid_at` = the members CSV renewal date;
   guard failures reported, never written); other seasons insert new rows; a
   `UNIQUE (household_id, season)` collision keeps the later transaction and reports the
   earlier. This retires the July 7 paid_at-from-renewal-date approximation with real money
   facts (the renewal-minus-one-year fallback stays in code but fires for zero accounts in
   the real data).
5. **Historical classes**: mint `classes` rows for accounting-referenced instances missing
   from the database, via an explicit full-reference → `{season, slug, name, track,
   start_date}` map in the script (2024: 1st/2nd adult and youth intros — including the
   `2st` reference typos — plus Intermediate; 2025: the same five; 2026 rows already exist;
   slugs reuse the existing per-season ids under `UNIQUE (season, slug)`, Intermediate gets
   `intermediate`). `fee` 100, `capacity` 10 (today's convention; historical capacity
   unknown — say so in the README), `start_date` parsed from the reference, `end_date` NULL
   (honest), `visible` 1. An Event reference with no map entry is refused and reported.
6. **Enrollments, all seasons.** With an attendee file (13 of 14 events), the ROSTER drives:
   each attendee row becomes one enrollment — the member matched within the buyer's household
   (via the buyer `Account ID` → `mw_account_id`) by normalized full-name equality, then
   first-name + last-name-initial; an attendee matching no household member falls back to a
   club-wide unique full-name match; still unmatched → the household primary with
   `identity=approximate` audit provenance and a report line (never invent a member). Money:
   the buyer group's matched net accounting purchase divides over its seats (`fee_paid` =
   event subtotal / seats); a roster group with NO accounting row (a comped/manual add)
   enrolls with `fee_paid` from the file's own `Total` divided over its seats (usually 0),
   provenance-noted. Without an attendee file (the 2024 Intermediate), the accounting-only
   fallback enrolls the household primary per net purchase, seats = subtotal / fee,
   `identity=approximate` for youth-class and multi-seat purchases (Geoff's call: approximate
   + report). Duplicate (class, member) pairs collapse to audit + report (the table's
   `UNIQUE (class_id, member_id)`). `enrolled_at` = the purchase date (the attendee row's
   `Date`, else the transaction date); `stripe_ref` = `Payment ID` when present; attendee
   experience/comments answers and `Check In` ride the enrollment's audit-row detail (schema
   untouched; archives keep the full text). Idempotent via the unique pair, planned as
   skips, never insert errors — EXCEPT that a previously-approximate enrollment whose
   attendee file has since arrived (the 2024 Intermediate, someday) is corrected in place to
   the true member, audited as `import.update` — re-runs upgrade identity.

Idempotency: a re-run with unchanged inputs creates 0 rows and updates 0 fields. Update
`mw-members.verify.sql` to the new end-state invariants and the README (mapping deltas,
second-run section, the update-pass rollback caveat: `rollback.sql` still wipes import-created
rows wholesale but cannot un-apply in-place field updates; the archives are the recovery path).
Tests: extend `src/tests/mw-members-import.test.ts` + fixtures for every new behavior
(pre-processing nets, fingerprint identification, both identity paths, the approximate→exact
upgrade); the normalize module gets its own test file.

Expected end state: 148 households, 285 members (286 − the Dog), ~230 membership rows across
seasons 2024–2026 (239 gross minus netting/collisions; exact counts printed by the run), 14
classes rows (5 existing + ~9 minted historical), enrollments = the net seat count across all
events; every member carries `mw_account_id`; zero paid_at values equal to a renewal date.

## Task A2 — asset-holder reconciliation (cairn-implementer, after A)

The 2026-07-07 ops-assets run left three holders unimported (no `members.email` match; the
machine-local report at `~/.local/asc-data/ops-assets-unmatched.md`). All three exist in the new
MW export (Geoff: "they should all exist in MW; names might not match perfectly"):

- ops person 19 (Oliver Wright): a household sub-member with the exact ops email — matches by
  email automatically once phase 3 lands. No change needed.
- ops person 18 (Cathy Wright) and ops person 120 (Camille Oliver): both in MW under a
  *different* email than ops held. Extend `scripts/import/ops-assets.mjs` with an explicit
  override map, ops person id → MW account id (`18` → `661f6b677abbb920560b306b`, `120` →
  `662f056a120ba1f321076c25`; opaque ids, safe to commit), resolved through
  `members.mw_account_id` ahead of the email match. Document in its README.

The conductor re-runs ops-assets against the real database in Task C, after the member import;
its unmatched report should then read empty.

## Task B — going-forward normalization in the live write paths (cairn-implementer, after A)

Apply `member-normalize.js` at the three write paths: `src/admin-club/lib/people.ts`
`ensureMember` (create path only — the existing-row path stays a strict no-write),
`src/member-portal/lib/profile.ts` (email/phone update), `src/member-portal/lib/household.ts`
(add-member name/email/phone). Live paths never refuse on an unparseable phone — they store the
trimmed raw. Tests per path.

## Task C — the real run (conductor only)

Apply 0020 to real `asc-club` (after its scratch proof). `--dry-run`, read the full plan output,
then the real run; verify.sql; spot checks; FK-chain proof on one household with sub-members.

## Task D — close

`docs/mw-export-findings.md` gains the 2026-07-13 export findings; gates (`npm run check`,
`npm test`); code-simplifier; commit; STATUS top entry + memory refresh.
