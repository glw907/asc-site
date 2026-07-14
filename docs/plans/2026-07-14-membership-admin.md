# Membership admin implementation plan

> **For agentic workers:** executed by a conductor-run workflow, one implementer per task,
> serial. Each task ends with the full project gate green. Spec:
> `docs/2026-07-14-membership-admin-design.md` — read it before your task; its rulings
> are binding.

**Goal:** Replace the fixture-backed admin members screens with the live 285-member
database and add the missing membership CRUD: manual payments, tier changes, ledger-backed
refunds through the Stripe API, archive/visibility management, and household merge/move.

**Architecture:** One household-grouped Members list, a household desk, and a Money &
Renewals view, all reading new thin stores over `asc-club` and writing through
`clubAdminAction` and the ledger's `recordTransaction` invariants. Standing extends the
existing `src/member-auth/lib/standing.ts` module (household-keyed, refund-aware) so the
admin and the public doors share one definition.

**Tech stack:** SvelteKit 2 + Svelte 5 runes, Cloudflare D1 (`CLUB_DB`), the cairn admin
shell (`OfficeList`, `adminNav`), raw-fetch Stripe API, vitest, Playwright.

## Global constraints

- Gate per task: `npm run check` 0 errors / 0 warnings, `npm test` exit 0, `npm run build`
  green. The e2e suite runs at the pass close, not per task.
- Every member-data write normalizes via `src/admin-club/lib/member-normalize.js`
  (`normalizeEmail`, `normalizePhoneE164`, `normalizeNameCaps`).
- Every admin write composes `clubAdminAction` (`src/admin-club/lib/club-action.ts`) with
  an audit `action`/`entity`; no bare actions.
- Ledger writes go through `recordTransaction`/`buildTransactionStatements`
  (`src/admin-club/lib/ledger.ts`); never hand-write `transactions` rows.
- `EVENTS_DB` is read-only; this pass never touches it. Migrations target `asc-club` only.
- No live-D1 writes from implementer tasks. Migration 0023 applies to the LOCAL replica
  and a scratch database only; the conductor applies it live at the close.
- Comments follow TSDoc / the Svelte `@component` convention; match the density and idiom
  of the files you touch. No em dashes in comments.
- Member PII never enters fixtures, tests, or commits. Synthetic names only.

---

### Task 1: Migration 0023 + member-type extraction

**Files:**
- Create: `migrations/asc-club/0023_membership_admin/forward.sql`, `rollback.sql`,
  `verify.sql` (follow 0022's directory shape).
- Create: `src/admin-club/lib/member-types.ts`
- Modify: the 13 importers of `$admin-club/lib/demo-members` that import only types
  (`MembershipTier`, `DirectoryVisibility`, `MemberSegment`): `club-settings.ts`,
  `member-format.ts`, `join-apply-form.ts`, `membership-pricing-data.ts`,
  `settings/+page.server.ts`, `member-signup/lib/types.ts`, `member-signup/lib/pricing.ts`.
  Data importers (members screens, signups, overview, announcements) are later tasks; leave
  them on demo-members for now, but demo-members re-exports the types from `member-types.ts`
  so there is one definition.

**Outcome:**
- 0023 adds `memberships.refunded_at TEXT` (null default) and creates
  `signup_review_resolutions` (id TEXT PK, membership_id TEXT NOT NULL REFERENCES
  memberships(id), outcome TEXT NOT NULL CHECK (outcome IN ('approved','denied')), note
  TEXT, resolved_by TEXT NOT NULL, resolved_at TEXT NOT NULL DEFAULT (datetime('now'))).
- Scratch-prove the migration per the established pattern: create a disposable D1, apply
  forward, run verify, apply rollback, verify empty, delete the database. Record the
  transcript in the task report. Apply to the LOCAL replica (the e2e bootstrap picks it up
  by directory order). Do NOT apply live.
- `member-types.ts` owns `MembershipTier`, `DirectoryVisibility`, `MemberSegment`, and
  `TIER_LABEL`-adjacent unions; type-only importers repoint; `demo-members.ts` re-exports.

**Acceptance:** scratch proof recorded; local replica migrated; check/test/build green
with zero import churn visible to callers.

### Task 2: Standing goes household-keyed and refund-aware

**Files:**
- Modify: `src/member-auth/lib/standing.ts`
- Test: colocated per repo pattern (`standing.test.ts` beside it or the existing test home)

**Interfaces:**
- Produces: `getHouseholdStanding(db: D1Database, householdId: string):
  Promise<HouseholdStanding>` where `HouseholdStanding = { status: 'current' | 'grace' |
  'lapsed' | 'none'; lastSeason: number | null; tier: MembershipTier | null;
  pricePaid: number | null; paidAt: string | null }`. Status derivation reuses the
  existing expiry/grace math (`getRenewalGraceDays`), keyed on the household's latest
  non-refunded paid membership; `none` when no such membership exists.
- Modifies: every membership query in this module (member-keyed path included) gains
  `AND refunded_at IS NULL`, so `getMemberStanding` and the doors that consume it
  (class door, join door, portal renew, renewal reminders) become refund-aware with no
  caller changes.

**Outcome & acceptance:** unit tests cover current, grace boundary, lapsed, none,
refunded-row-ignored (a household whose only current-season membership is refunded reads
lapsed/none, never current), and the member-keyed path ignoring refunded rows. The
next-unclaimed-season logic (portal renew mint) treats a refunded season as unclaimed —
find its query (`src/routes/(site)/my-account/+page.server.ts` or the lib it calls) and
add the same predicate with a test.

### Task 3: The stores

**Files:**
- Create: `src/admin-club/lib/households-store.ts`, `src/admin-club/lib/money-store.ts`
- Test: colocated tests per repo store-test pattern

**Interfaces (later tasks rely on these exact names):**
- `households-store.ts`:
  - `listHouseholds(db, opts: { search?: string; segment?: 'all' | 'current' | 'lapsed';
    includeArchived?: boolean }): Promise<HouseholdListRow[]>` — one row per household:
    id, name, city, standing (via a single set-based query, not per-row
    `getHouseholdStanding` calls), latest tier/amount with `comped` (price 0) and
    `discounted` (price differs from the settings tier price) flags, activeAssets count,
    staleAssets boolean (active assignment + not current), members array (id, name,
    archived, isPrimary, matchedSearch boolean). Search matches household name, member
    name, member email (case-insensitive); `matchedSearch` marks which member hit.
  - `getHouseholdDesk(db, householdId): Promise<HouseholdDesk | null>` — household info,
    roster (contact fields + visibility + archived), memberships (with refunded state),
    assets (active and released).
  - `resolveMemberHousehold(db, memberId): Promise<string | null>` for the member-id
    redirect.
- `money-store.ts`:
  - `getHouseholdTimeline(db, householdId): Promise<TimelineTransaction[]>` — transactions
    with nested lines, newest first.
  - `listSeasonMemberships(db, season): Promise<SeasonMembershipRow[]>` — the flat table.
  - `getMoneyOverview(db, season): Promise<{ currentHouseholds: number; totalHouseholds:
    number; duesCollected: number; renewalCandidates: number; attentionCount: number }>`.
  - `listRenewalCandidates(db, season): Promise<RenewalCandidateRow[]>` — households whose
    latest paid season is `season - 1`.
  - `listAttentionItems(db, season): Promise<AttentionRow[]>` — active assignments whose
    household lacks a paid, non-refunded membership for `season`.
  - `listRecentTransactions(db, limit): Promise<TimelineTransaction[]>` with household
    names; flags each charge `refundable` (kind charge, not already fully refunded) and
    `apiEligible` (source stripe, `mw_ref` null, `processor_ref` starts with `cs_` or
    `pi_`).

**Outcome & acceptance:** stores are thin (no validation/audit inside, `db` parameter,
typed rows, camelCase mapping) per the `classes-store.ts` pattern. Tests cover the
standing aggregation against the seed shapes (multi-member, comped, discounted, refunded,
stale-with-asset) and the search matcher. Extend the e2e/local seed
(`e2e/fixtures/` + whatever Task 1 left) with synthetic households covering exactly those
shapes plus a same-season merge-conflict pair; document the seed rows in the SQL file
header.

### Task 4: Members list + household desk (read side)

**Files:**
- Modify: `src/routes/admin/club/members/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/admin/club/members/[id]/+page.server.ts`, `+page.svelte`
- Delete usage of demo-members in both (the files stop importing it entirely).

**Interfaces:** consumes Task 3's `listHouseholds`, `getHouseholdDesk`,
`resolveMemberHousehold`, Task 2's vocabulary; keeps `SEGMENT_CHIP`, `VISIBILITY_CHIP`,
`HEADER_CELL`, `formatCivilDate`, `formatDollars` from the UI kit.

**Outcome:**
- The list renders one row per household per the spec's Members section: standing badge
  (Current / Grace / Lapsed — last YYYY / No membership), tier + amount with comped and
  discounted rendered as visible flags, asset count with stale warning, member chips with
  primary marked and search-matched chip highlighted. Search/filter/pagination keep the
  current screen's controls and a11y patterns (the sr-only status mirror stays).
- `[id]` becomes the household desk (read blocks only in this task): roster, memberships
  with refunded state, money timeline via `getHouseholdTimeline`, assets. A member id in
  the URL resolves via `resolveMemberHousehold` and redirects to the household. Absorb the
  old detail screen's standing stat and credit display; the two-pane layout may simplify to
  stacked blocks per the office-list pattern.

**Acceptance:** both screens run entirely on live-store data (local replica in dev); no
demo-members import remains in either route; gate green. Screenshot both screens against
the local seed in the task report.

### Task 5: Desk write paths — roster CRUD, household surgery, manual payments, tier change

**Files:**
- Modify: `src/routes/admin/club/members/[id]/+page.server.ts`, `+page.svelte`
- Modify: `src/routes/admin/club/members/+page.server.ts`, `+page.svelte` (add-household
  action: name, city, first member's contact fields; the first member becomes primary;
  lands on the new desk — this is the walk-up-join entry point)
- Create: `src/admin-club/lib/household-surgery.ts` (move + merge plan builders)
- Create: `src/admin-club/lib/manual-payment.ts` (payment plan builder)
- Test: colocated tests for both new modules

**Interfaces:**
- Consumes portal helpers (`addHouseholdMember`, `updateProfile`, `setDirectoryVisibility`,
  `archiveMember`-equivalents from `src/member-portal/lib/household.ts`) where they fit;
  otherwise store-level writes in `households-store.ts`.
- Produces `buildMergePlan(db, survivorId, mergedId): Promise<{ ok: true; statements:
  D1PreparedStatement[] } | { ok: false; conflictSeasons: number[] }>` and
  `buildMovePlan(db, memberId, targetHouseholdId, newPrimaryId?)` with the same shape.
- Produces `buildManualMembershipPayment(db, input: { householdId, season, tier, amountCents,
  source: 'check' | 'cash' | 'comp', memo? }): { statements }` — membership insert (or
  refunded-row reclaim: same season updates the row, clears `refunded_at`) + ledger
  transaction via `buildTransactionStatements`, one `db.batch`.

**Outcome:** every action from the spec's desk section exists as a `clubAdminAction`
form action: member add/edit/archive/visibility, household edit (name, city, primary),
move member (primary reassignment enforced), merge (season-overlap refusal with the
conflict seasons in the message; `left_at` on the merged household; members, memberships,
transactions re-parented in one batch), record manual payment (prefilled tier price from
settings, editable amount, comp = 0), tier change (tier field edit + audit only; money
trues up through manual payment/refund).

**Acceptance:** unit tests cover the merge conflict pair from the seed, a clean merge, a
move that reassigns primary, manual payment atomicity (membership + ledger in one batch;
sum invariant holds), and the refunded-row reclaim path. Gate green.

### Task 6: Refund engine + Stripe refund + refund UI

**Files:**
- Create: `src/admin-club/lib/refunds.ts` (pure plan builder)
- Modify: `src/admin-club/lib/payments.ts` (add the Stripe refund call)
- Modify: `src/routes/admin/club/members/[id]/+page.server.ts` + `+page.svelte`
  (refund action + line-selection form on timeline charges)
- Test: `refunds` colocated tests

**Interfaces:**
- `refunds.ts` produces `buildRefundPlan(charge: TimelineTransaction, selection:
  { lineId: string; amountCents: number }[]): RefundPlan` where `RefundPlan = { mode:
  'api' | 'record-only'; refundAmountCents: number; header: TransactionHeader; lines:
  TransactionLineInput[]; unwinds: UnwindAction[] }` and `UnwindAction` is a typed union:
  `{ kind: 'membership-refunded'; membershipId }` (only when the dues line refunds in
  full) | `{ kind: 'drop-enrollment'; enrollmentId }` | `{ kind: 'unflip-asset-fee';
  assignmentId }`. Donation lines produce no unwind. Mode derives from the
  `apiEligible` flag (Task 3).
- `payments.ts` produces `issueStripeRefund(env, args: { processorRef: string;
  amountCents: number }): Promise<{ ok: true; refundId: string } | { ok: false; error:
  string }>` — resolves a `cs_` ref to its payment intent via GET
  `/v1/checkout/sessions/{id}`, then POST `/v1/refunds` with `payment_intent` and
  `amount`; a `pi_` ref refunds directly. Raw fetch with `STRIPE_SECRET_KEY`, matching
  `createCheckout`'s idiom.

**Outcome:** the desk timeline offers Refund on refundable charges; the form shows the
charge's lines with per-line amounts (join charges are multi-line), states whether the
refund issues via Stripe or records only, and on submit: API mode calls
`issueStripeRefund` first and writes NOTHING on failure; success (or record-only mode)
executes ledger refund + unwinds in one `db.batch`. The unwind executions: set
`refunded_at`, delete the enrollment (no automatic waitlist offer), unflip the asset
fee state (find the real column/rows the asset-fee reconciler flips and reverse exactly
that).

**Acceptance:** unit tests cover full-dues (membership marked), partial-dues (membership
untouched), multi-line join partial selection, class-fee unwind, MW/PayPal/check rows
routing record-only, sum invariant on the mirrored lines, and API-failure-writes-nothing
(mock fetch). Gate green.

### Task 7: Money & Renewals screen

**Files:**
- Create: `src/routes/admin/club/money/+page.server.ts`, `+page.svelte`
- Modify: `src/theme/cairn.config.ts` (add a `{ label: 'Money', href: '/admin/club/money' }`
  entry to `clubAdminNav` beside Members, reusing an icon name that already exists in the
  set that nav uses)

**Interfaces:** consumes `getMoneyOverview`, `listSeasonMemberships`,
`listRenewalCandidates`, `listAttentionItems`, `listRecentTransactions` (Task 3),
the manual-payment form action pattern (Task 5), and the refund action (Task 6, reused
or linked to the desk).

**Outcome:** per the spec's Money & Renewals section: four stat tiles (plain admin-styled
numbers with labels, no charts; values from `getMoneyOverview`), the read-only renewal
candidate list, the attention list linking each row to its household desk, the
season-picker flat memberships table, recent transactions with refund entry, and Record
manual payment (household picker + the Task 5 form). Every list row that names a
household links to its desk.

**Acceptance:** screen renders against the local seed with correct aggregate numbers
(assert the store aggregates in tests, not the page); nav shows Money for club-role
editors; gate green.

### Task 8: Signup queue live, announcements repoint, demo-members deleted

**Files:**
- Modify: `src/routes/admin/club/signups/+page.server.ts` (+ `.svelte` as needed)
- Modify: `src/routes/admin/club/+page.server.ts` (overview's pending count)
- Modify: `src/admin-club/lib/announcements.ts` (recipient segments to live data)
- Create: `src/admin-club/lib/signup-reviews-store.ts`
- Delete: `src/admin-club/lib/demo-members.ts`
- Modify: `src/admin-club/lib/member-format.ts` (imports from `member-types.ts`)

**Interfaces:**
- `signup-reviews-store.ts` produces `pendingSignupReviews(db, opts?: { windowDays?:
  number }): Promise<SignupReviewRow[]>` (first-season memberships — household has no
  earlier season — created in the last 30 days, LEFT JOIN resolutions, unresolved only)
  and `resolveSignupReview(db, input: { membershipId; outcome: 'approved' | 'denied';
  note?; resolvedBy }): Promise<void>`.
- Announcements' "current members" recipient set moves to a real query (emails of
  non-archived members in households with current standing, per Task 2's definition);
  keep the existing announcement send path untouched otherwise.

**Outcome:** the queue keeps its designed post-hoc semantics and its existing screen
shape, now on live rows; approve/deny write `signup_review_resolutions` through
`clubAdminAction`; the admin overview count reads the same store. `demo-members.ts` is
deleted and nothing imports it (grep proves it).

**Acceptance:** tests for the queue derivation (first-season only, window, resolution
hides the row) and the live segment query; `grep -r demo-members src/` returns nothing;
gate green.

---

## Close ritual (conductor, not an implementer task)

0. Rider task (dispatched once the 8 tasks finish, before the review lenses' findings are
   folded): the reminder-blast guard, from the 2026-07-14 incident (first cron tick after
   the MW import fired 655 catch-up sends; 471 hit the account sending quota, 184
   delivered). Three pieces, all site-level (Geoff ruled no engine bug — cairn has no
   jobs/email seam): (a) staleness cutoff in `dueClassTouches` and `dueTouches` — a touch
   whose due date is more than 10 days past is never sent, with tests; (b) a per-tick
   send cap in `src/jobs/runner.ts`, well under the account quota, that stops the tick
   loudly with an audit row when hit; (c) fix `renewal_reminders_sent` dedup so markers
   key on the household's renewal boundary, not household+touch forever (today a renewed
   household would never get next cycle's reminders) — this needs a small migration
   riding 0023's pattern.
1. code-simplifier over the pass diff; fold accepted findings.
2. Review lenses on the full diff: `cloudflare-workers-reviewer` (D1 batches, migration,
   Stripe fetch), `web-auth-security-reviewer` (refund authz, merge/move authz, the money
   screen's role gate), `svelte-reviewer` (the three screens). Conductor triages, fix
   rounds as needed.
3. Full gate + e2e (existing suite; admin e2e stays out — no editor-auth helper exists,
   same known debt as portal-renew e2e).
4. Conductor render-read of the three screens against the local seed.
5. Apply migration 0023 LIVE (scratch proof already on record); confirm with a live
   standing spot-check (Hunter household reads lapsed-with-asset attention item).
6. Merge to main, push, `npx wrangler deploy` (Actions billing still blocked), smoke dev.
7. STATUS.md entry + ROADMAP tick; queue `segment-email` as the next initiative;
   memory refresh.
