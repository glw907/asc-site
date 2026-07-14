# Membership admin on live data — design

Initiative 3 of the MembershipWorks replacement program (`membership-admin` in ROADMAP.md).
This spec replaces the fixture-backed admin members screens with real `asc-club` data and
adds the missing membership CRUD: manual payments, tier changes, refunds against the
ledger, archive, directory visibility, and household merge/move. The staff-roles collapse
onto cairn's editor-roles seam stays out of this pass; it waits for the cairn release
(`docs/2026-07-13-cairn-editor-roles-consumer-brief.md`) and lands as its own follow-up.

Brainstormed with Geoff 2026-07-14. The rulings below are settled; later work does not
re-litigate them unless Geoff reopens one.

## Rulings

1. **One household-grouped Members screen, plus a Money & Renewals view.** Geoff's
   screen-shape fork, settled against the real data: standing and money are household
   facts by schema (one membership per household per season), MembershipWorks trained
   volunteers on account = household, and the messy real shapes (a comped household
   holding an asset, an active assignment against a 2024 membership) read as household
   states. The season-flat audit view the grouped list gives up moves to Money &
   Renewals.
2. **Member-first search is a hard requirement.** Finding a specific person is the
   common case. Search matches any member's name or email, not just the household name,
   and the result row shows which member matched.
3. **Refunds issue through Stripe's API from the admin** (full or partial), then write
   the ledger and unwind the domain row atomically. Record-only refunds cover payments
   the API cannot reach (checks, cash, and imported MW rows).
4. **Refunds never delete history.** A refunded membership is marked, not deleted
   (`refunded_at`, migration 0023). Standing ignores refunded rows; rejoining the same
   season reclaims the row. This supersedes the import-era delete precedent for live
   operations.
5. **Household merge and member move are in scope.**
6. **No renewal-chase action.** Members renew themselves and the automated reminders
   already exist. The lapsed list stays as a read-only segment view (the same segments
   `segment-email` later consumes); there is no per-row send button.

## Screens

All three screens live under `/admin/club`, mount through the existing `adminNav` seam,
gate through `clubAdminAction` on writes, and follow the office-list visual pattern the
Events and Classes screens already use.

### Members (household-grouped list)

Replaces the fixture screen at `/admin/club/members`. One row per household (148 rows at
current scale, paginated):

- Household name and city, linking to the household desk.
- Standing badge: **Current** (paid membership for `current_season`), **Grace** (the
  doors' existing grace semantics), **Lapsed — last YYYY**, or **No membership**. One
  badge per household; the per-member repetition of the fixture screen goes away.
- Tier and amount for the latest membership, with comped ($0) and discounted (amount
  differs from the settings price) rendered honestly — Nancy Black's $324 family and
  Geoff Wright's $0 comp are the live examples.
- Active-asset count, with a warning mark when the household holds an active assignment
  but standing is stale (Elayne C Hunter's Yellow Laser against a 2024 membership).
- Member chips: each member's name, primary marked. Chips are display, not edit; all
  member CRUD lives on the desk.

Search matches household name, member names, and member emails. When a sub-member
matches, that chip highlights in the result row. Filters: standing segment (all active /
current / lapsed) and an include-archived toggle, matching the current screen's
vocabulary.

### Household desk

`/admin/club/members/[id]` where `id` is a household id; this absorbs the fixture
member-detail screen. Any surviving member-id link resolves through a member → household
redirect. Four blocks:

1. **Roster.** Per-member edit of name, email, phone, birthdate, and directory
   visibility; archive and unarchive; add member. Every write normalizes (emails
   lowercase, phones E.164, conservative name recasing), the same rules as every other
   write path. Household-level edits: name, city, primary member.
2. **Memberships.** Season, tier, amount, paid date, source, and refunded state, with
   per-row actions: **tier change** and **refund**. Tier change edits the tier and
   audits; money truing-up happens through a manual payment or refund, never a silent
   price edit (`price_paid` stays the snapshot of what was actually paid).
3. **Money timeline.** Every ledger transaction for the household with its lines —
   the Oliver household's two-charge 2024 plus void renders as it actually happened.
   Refundable charges carry the refund action; a **record manual payment** action
   opens the same form as Money & Renewals.
4. **Assets.** Active and released assignments, read-only here (asset management keeps
   its own screen).

Move member and merge household both live on the desk (see Household surgery below).

### Money & Renewals

`/admin/club/money`, the season-flat view. Reads:

- Stat tiles: households current this season, dues collected this season, renewal
  candidates (lapsed since last season), and attention count. Live values at design
  time: 84 of 148 current, $30,044 collected for 2026, 36 candidates, 1 attention item.
- The renewal-candidate list (read-only, per ruling 6).
- The attention list: active asset assignments whose household lacks a paid
  current-season membership.
- The season-flat memberships table with a season picker: household, tier, amount,
  paid date, source, refunded state.
- Recent transactions across all kinds (dues, class fees, asset fees, donations) with
  refund entry on refundable charges.

Writes: **record manual payment** and the refund flow. Everything else on the screen is
read-only.

### Signup review queue disposition

The fixture-backed queue at `/admin/club/signups` keeps its designed post-hoc semantics
(review is a background check, never a gate) but moves to live data. The queue derives
from first-season memberships created in the last 30 days; resolutions persist in a new
`signup_review_resolutions` table (migration 0023) so `reconcileJoin` stays untouched.
A row is pending when a recent join has no resolution row. Approve/deny keep their
existing meaning: deny only records that the board wants a human follow-up.

## Standing

Standing becomes one shared module (`src/admin-club/lib/standing.ts`) instead of
per-door inline logic. It answers, for a household:
current / grace / lapsed / none, from membership rows and `current_season`, and it
treats refunded rows as absent. The admin badges, the class-door gate, and the portal
renew path all consume the same module, so the admin and the public doors can never
disagree about who is current. The plan's first task inventories the existing inline
computations (class door, portal renew, reminder logic) and repoints them.

## Money semantics

### Manual payments

Source check, cash, or comp; kind `charge`; a single `dues` line at the actual amount.
The form prefills the tier price from settings and allows edits (discounts are real:
$324 exists in the data). Comp is amount 0 with source `comp`. The write creates the
membership row and the ledger transaction in one `db.batch` through
`recordTransaction`'s invariants. A walk-up join by check is: create household and
members on the desk (reusing `ensureMember` and the portal household helpers), then
record the payment. Manual class-fee and asset-fee payments keep their existing homes
(the classes screens and `recordAssetPayment`).

### Refunds

The refund flow starts from a ledger charge (on the desk timeline or Money & Renewals).
The admin picks the lines and amounts to refund — join charges are multi-line, and
Stripe refunds by amount, not by line, so the ledger refund transaction mirrors the
selected lines and sums to the refund amount (the existing sum invariant enforces this
by construction).

Eligibility: a charge refunds through the Stripe API only when its `processor_ref` is a
session or payment-intent id this site's own checkout minted. Imported MW rows
(`mw_ref` set), PayPal rows, and check/cash rows take the record-only path: same ledger
row, same unwind, no API call. The UI states which path applies before the admin
confirms.

Sequence for an API refund: call Stripe, and only on success write the ledger refund
(linked via `refunds_transaction_id`) plus the domain unwind in one batch. A Stripe
failure writes nothing.

Unwind rules, per refunded line:

- **Full dues refund:** set `refunded_at` on the membership. Standing recomputes to not
  current; the household's history stays intact (ruling 4). A partial dues refund
  leaves the membership standing.
- **Class-fee refund:** drop the enrollment and free the seat. No automatic waitlist
  offer fires; the existing offer machinery on the classes screen handles the freed
  seat deliberately.
- **Asset-fee refund:** unflip the season's fee-paid state.
- **Donation line:** ledger only; nothing to unwind.

### Household surgery

**Move member** re-parents one member to another household, audited. Moving the primary
requires naming a new primary first. Moving the last member out leaves an empty
household, which lists under No membership; that is acceptable and visible, not an
error.

**Merge households** picks a survivor and re-parents the other household's members,
memberships, ledger transactions, and (through memberships) asset assignments, then
marks the merged household with `left_at`. Merge is blocked with a clear message when
both households hold a membership row for the same season (the UNIQUE constraint; the
two Wright households both holding 2025 is the live example) — the admin resolves the
duplicate season first. The whole merge is one `db.batch`, audited with both household
ids.

## Migration 0023

One migration, scratch-proven on a disposable D1 (forward, verify, rollback,
verify-empty) and then applied live, per the standing pattern:

- `memberships.refunded_at TEXT` (null default).
- `signup_review_resolutions` (id, membership_id, outcome, note, resolved_by,
  resolved_at).

`EVENTS_DB` is untouched, per the read-only rule.

## Interactions with unified-signup

- The next-unclaimed-season rule (portal renew, reminder deep links) treats a refunded
  row's season as unclaimed. Rejoining or renewing a refunded season updates the
  existing row (new `paid_at`, cleared `refunded_at`, new snapshot) rather than
  inserting, so the UNIQUE constraint holds.
- The class-door standing gate and the admin consume the same standing module, so a
  refund immediately changes what the public doors offer that household.

## Architecture

- **Stores:** `households-store.ts` and `members-store.ts` on the `classes-store`
  pattern — thin, typed rows, `db` as a parameter, no validation or audit inside. The
  money reads for the desk timeline and Money & Renewals live in a `money-store.ts`
  over `transactions`/`transaction_lines`.
- **Refund engine:** a pure plan-builder module (given a charge, its lines, and the
  admin's selection, produce the Stripe call parameters, the ledger refund
  header/lines, and the domain unwind statements), unit-tested against the messy
  shapes; the route action performs the Stripe call and executes the batch.
- **Writes** all compose `clubAdminAction` (role gate + typed audit), the established
  exemplar.
- **`demo-members.ts` is deleted.** Its two consumers (members screens, signup queue)
  both move to live data in this pass.
- **Tests and e2e run on synthetic seeds.** Local D1 seeds synthetic households
  covering the real shapes (multi-member family, solo, comped, discounted, refunded,
  stale-with-asset, same-season merge conflict); no member PII leaves the live
  database.

## Out of scope

The staff-roles collapse (waits for cairn's editor-roles release; the consumer brief is
the contract), segment-email sending (reads this pass's segments later), class rosters
and attendance (`class-management`), season rollover, QBO sync, and any `EVENTS_DB`
change.

## Acceptance criteria

1. The Members list, household desk, and Money & Renewals render the live 285-member
   database with zero fixture imports, and the four named real shapes read correctly:
   Elayne C Hunter (stale with active asset, flagged), Geoff Wright (comped, current),
   Nancy Black (discounted, 4 assets), the Oliver 2024 timeline (two charges + void).
2. Searching a sub-member's name (for example "Oliver Wright") finds the household and
   highlights the matched member.
3. A manual check payment creates membership + ledger atomically and the household goes
   current everywhere (admin badge, class door, portal) in one write.
4. An API refund against a test-mode Stripe charge writes the linked ledger refund and
   the correct unwind; a Stripe failure leaves the database untouched. Record-only
   refunds produce the same ledger + unwind without an API call.
5. A same-season merge is refused with the explaining message; a clean merge moves
   members, memberships, and transactions and `left_at`-marks the loser.
6. Migration 0023 is scratch-proven, applied live, and the post-apply import dry-run
   still plans zero changes.
7. Full gate green: `npm run check` 0/0, `npm test`, build, and the e2e suite including
   any new admin flows; visual baselines regenerate only if a public page changed
   (none is expected to).
