# Unified signup implementation plan

> **For agentic workers:** executed by a Workflow (conductor orchestrates; one Sonnet
> implementer per task; reviews between tasks). Tasks specify outcomes and contracts,
> not code — the implementer owns the code. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the self-serve membership lifecycle — public join with join+classes in one
combined checkout, the members-only class-door gate, portal renewal, welcome-back
renewal, and the asset-fee call site — on the ledger seams `money-ledger` finished.

**Spec:** `docs/2026-07-13-unified-signup-design.md` — READ IT FIRST; it carries the
rulings, the flow shapes, and the reconciler contract. This plan sequences the work and
pins the contracts between tasks.

**Architecture:** a new `src/member-signup/lib/` module holds the engine's pure core
(validation, pricing and credit math, the join write batch). A fifth payment kind
`join` extends `createCheckout` with multi-line support and adds `reconcileJoin` to the
webhook. Three entries call the engine: `/join/apply`, the class-door pivot, and the
portal renew card. Content and live-DB operations are conductor-owned.

**Tech stack:** SvelteKit on Cloudflare Workers, D1 (sqlite), vitest with
`src/tests/_fake-d1.ts`, Playwright for e2e/visual, Stripe Checkout (stub-degradable),
Turnstile.

## Global constraints

- Gates for every task: `npm run check` 0 errors/0 warnings, `npm test` green (all
  existing tests stay green), `npm run build` green.
- Member data regularizes on every write path: emails lowercase, phones E.164 (+1
  default), names conservatively recased — reuse the existing helpers in
  `src/admin-club/lib/people.ts`.
- Money amounts in new code are integer cents; `memberships.price_paid` stays dollars
  (it snapshots the settings value, matching the imported rows).
- `EVENTS_DB` is never touched; only `CLUB_DB` (asc-club). Engine (`AUTH_DB`) untouched.
- Standing vocabulary everywhere: `current`, `grace`, `lapsed` — from
  `getMemberStanding` (`src/member-auth/lib/standing.ts`), never re-derived.
- Tier prices come from `getTierPrices` (`src/admin-club/lib/club-settings.ts`); no
  dollar constant anywhere in code or copy.
- Credits: individual 1, young-adult 1, family 2; granted only on a household's first
  membership (`grant_credits` false for welcome-back); applied in class-pick order.
- Every public write carries an audit row (`public:join`, `public:signup` patterns) and
  Turnstile verification (reuse the class-signup seam).
- The board is notified of each join, never gated on. No `board@` email step anywhere.
- All copy member-facing strings follow the website content style guide
  (`~/Projects/aksailingclub-legacy/handbook/content/style-guides/website-content.md`);
  system emails follow its system-email rules (no internal names, no session IDs).
- TypeScript comments follow ts-conventions (TSDoc, contract-not-type); Svelte
  components follow svelte-conventions; no em dashes in code comments.
- Commit per task, imperative mood, `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Conductor-owned, never an implementer task: migration scratch-proof and live apply,
  diff review between tasks, the content pass (Task 7), deploy, Geoff's before/after.

---

### Task 1: The signup engine's pure core

**Files:**
- Create: `src/member-signup/lib/types.ts`, `src/member-signup/lib/pricing.ts`,
  `src/member-signup/lib/validate.ts`, `src/member-signup/lib/statements.ts`
- Test: `src/member-signup/lib/*.test.ts` (colocated, matching the repo's pattern)

**Interfaces:**
- Consumes: `getTierPrices(db)` from `$admin-club/lib/club-settings`;
  `normalizeEmail`/`normalizePhone`/`recaseName` from `$admin-club/lib/people`; class
  fee/fullness facts as plain inputs (no DB reads in pure functions).
- Produces (later tasks depend on these exact names):
  - `type JoinInput = { tier: 'individual'|'family'|'young-adult', purchaser: { name,
    email, phone?, birthdate? }, members: Array<{ name, birthdate?, email? }>,
    classPicks: Array<{ memberIndex: number, classId: string }>, waiverAccepted:
    boolean }` (memberIndex 0 is the purchaser).
  - `validateJoinInput(input, { today }): ValidationResult` — young-adult requires a
    purchaser birthdate under 26 at `today`; family accepts additional members, the
    other tiers reject them; waiver must be accepted; normalization applied.
  - `computeJoinPricing(input, prices, classFees: Map<string, number>):
    { duesCents, creditsGranted, coveredPicks: number[], paidPicks: Array<{ pickIndex,
    amountCents }>, totalCents }` — credits in pick order; young-adult grants 1.
  - `buildJoinStatements(db, validated, pricing, { season, waiverVersion, fullClassIds:
    Set<string> }): { statements: D1PreparedStatement[], membershipId, enrollmentIds:
    string[], waitlistIds: string[] }` — household + members (purchaser is
    `primary_member_id`) + unpaid membership (`price_paid` = settings dollars,
    `paid_at` NULL) + enrollments (`fee_paid = 0`) or waitlist rows for full classes +
    waiver acceptance (`context = 'join'`) + audit rows, for one `db.batch()`.

- [ ] Failing unit tests first: young-adult age gate (edge: 26th birthday is `today`),
  family multi-seat pricing (two parents + three kids: 2 covered, 3 paid), pick-order
  credit application, non-family tier rejecting extra members, full-class pick landing
  in waitlist statements, normalization of email/phone/name, statement shape (unpaid
  membership, waiver context).
- [ ] Implement to green; full gate; commit.

### Task 2: The `join` payment kind — migration 0022, checkout lines, `reconcileJoin`

**Files:**
- Create: `migrations/asc-club/0022_join_emails/` (forward/rollback/verify/README)
- Modify: `src/admin-club/lib/payments.ts`, `src/admin-club/lib/stripe-reconcile.ts`,
  `src/routes/(site)/api/stripe/webhook/+server.ts` (dispatch only, if needed)
- Test: colocated tests beside each modified file

**Interfaces:**
- Consumes: `recordTransaction`/`buildTransactionStatements` from
  `$admin-club/lib/ledger`; `sendClubEmail` from `$admin-club/lib/club-email`;
  `credit_grants`/`credit_redemptions` DDL as in migration 0005 (grants already carry
  `membership_id` provenance — no schema change needed for credits).
- Produces:
  - `PAYMENT_KINDS` grows `'join'`.
  - `createCheckout` accepts optional `lines: Array<{ amountCents: number, name:
    string, description?: string }>`; when present it emits indexed
    `line_items[i][...]` params and ignores `amountCents`/`description`; single-line
    callers are unchanged. Metadata keys for `join`: `enrollment_ids` (comma-joined),
    `covered_enrollment_ids`, `grant_credits` (`'1'`/`'0'`), `purchaser_member_id`.
  - `reconcileJoin(db, env, refId, session)` — refId is the membership id. Guarded flip
    (`WHERE paid_at IS NULL`) is the idempotency anchor past the session claim; on a
    fresh flip it inserts the tier's `credit_grants` row when `grant_credits`,
    `credit_redemptions` (`redeemed_by` = purchaser member id) plus `fee_paid = 1` for
    covered enrollments, `fee_paid = 1` + `stripe_ref` for paid enrollments, records
    ONE ledger transaction (a `dues` line linked to the membership plus a `class-fee`
    line per PAID enrollment; covered enrollments get no money line), sends the
    `join_welcome` email and the board notification, writes audit rows.
- Migration 0022 seeds `email_templates` defaults (`INSERT OR IGNORE`, the 0016
  pattern): `join_welcome` (member-facing: welcome, portal magic-link door, credit
  status, Discord invite — style guide's system-email rules) and `board_join_notice`
  (internal: household, tier, classes; sent to the board reply address).

- [ ] Failing tests first: multi-line param emission (indexed line_items, single-line
  callers byte-identical), reconcileJoin happy path (flip + grants + redemptions +
  fee_paid + one transaction with summing lines), replay no-op, `grant_credits='0'`
  path granting nothing, welcome-back metadata shape, missing-membership refusal.
- [ ] Implement to green; full gate; commit. Conductor scratch-proves and live-applies
  0022 after review.

### Task 3: The `/join/apply` route and form

**Files:**
- Create: `src/routes/(site)/join/apply/+page.server.ts`, `+page.svelte`, and a
  `src/theme/` remote-function file for the form action (follow
  `class-signup.remote.ts`'s pattern); `src/theme/components/MembershipPricing.svelte`
  plus a `membership-pricing` directive registration in
  `src/theme/markdown/components.ts`
- Test: form-action tests beside the remote file; component unit tests

**Interfaces:**
- Consumes: everything Task 1 produces; `createCheckout` with `lines` from Task 2;
  open-class facts from the schedule data seam (`buildClassSchedule`,
  `src/theme/class-schedule-data.ts`); Turnstile verification as in
  `class-signup-form.ts`; `getTierPrices`.
- Produces:
  - The public join door: tier selection with live prices, purchaser + household
    members (family shows the inline add), optional class picks per member from open
    classes only (full ones offer the waitlist), a running total (dues, credits
    applied, class fees), waiver checkbox with version, Turnstile, submit → one
    `db.batch()` → Stripe redirect (`successPath: '/payment/confirmation/'`); stub
    mode surfaces the no-key degradation exactly as the class flow does.
  - Retry semantics: a submit for a household that already holds an UNPAID membership
    row for the target season reuses that row (update tier/price) instead of failing
    the unique constraint.
  - `checkKnownEmail` remote function: given an email, answers `{ known: boolean }`
    for the blur-time pivot (used here for welcome-back and by Task 4's early pivot).
  - A purchaser email matching an existing member does NOT create anything; the action
    answers with the welcome-back pivot (Task 5 renders that mode).
- UI follows the locked design system: quiet composition, the page's fireweed budget
  (at most the submit door), tokens only, no new chrome vocabulary.

- [ ] Failing tests first: action happy path (batch then redirect), duplicate-email
  pivot (no writes), unpaid-row reuse on retry, running-total math delegated to
  `computeJoinPricing` (no duplicated pricing logic in the route), Turnstile refusal.
- [ ] Implement to green; full gate; commit. Conductor reads a full-page render before
  the task closes (one-check discipline; Geoff's before/after waits for the deploy
  gate at settle).

### Task 4: The class-door standing gate

**Files:**
- Modify: `src/theme/class-signup-form.ts` (or the action seam it feeds),
  `src/routes/(site)/classes/[id]/signup/+page.svelte`
- Test: extend the existing class-signup tests

**Interfaces:**
- Consumes: `getMemberStanding` (member resolved by normalized email);
  `checkKnownEmail` from Task 3.
- Produces: at submit, an email resolving to a member whose household stands `current`
  or `grace` proceeds through today's exact path (enroll/waitlist, credit-or-pay step
  unchanged). No match, or `lapsed`, answers a pivot outcome the page renders as an
  invitation into `/join/apply?class=<id>&name=…&email=…&phone=…` (query-string
  carry-over; the join form prefills and preselects the class pick). With JS, an
  email-blur `checkKnownEmail` + standing probe pivots before the rest is filled.
  The signed-in portal class flow is untouched.

- [ ] Failing tests first: the three branches (current proceeds, grace proceeds,
  no-match/lapsed pivots with carried fields), member resolution uses normalized
  email, no behavioral change for the portal flow.
- [ ] Implement to green; full gate; commit.

### Task 5: Welcome-back renewal on the public door

**Files:**
- Modify: Task 3's route files (`/join/apply`)
- Test: extend Task 3's action tests

**Interfaces:**
- Consumes: Tasks 1-3's seams; `getMemberStanding`.
- Produces: the welcome-back mode — an email match renders the household's name, last
  tier (changeable), settings price, optional class picks for existing household
  members, optional NEW members added inline (audited `public:join`; no edits or
  removals of existing members). Submit mints (or reuses) the unpaid membership row
  for the next unclaimed season at or after `current_season`, plus enrollments, then a
  `join`-kind checkout with `grant_credits='0'`. Existing unexpired credits still
  apply to picks (the credit ledger is household-scoped and never expires).

- [ ] Failing tests first: match renders renewal not a duplicate household, season
  assignment (current season already paid → next season), `grant_credits='0'` in the
  session, new-member addition audited, existing-member edits impossible, credit
  application for a household holding an unredeemed grant.
- [ ] Implement to green; full gate; commit.

### Task 6: Portal renew and the asset-fee call site

**Files:**
- Modify: `src/routes/(site)/my-account/+page.server.ts`, `+page.svelte` (the renew
  stub), the portal assets section files under `src/routes/(site)/my-account/` and
  `src/member-portal/lib/`
- Test: extend the portal tests

**Interfaces:**
- Consumes: `createCheckout({ kind: 'dues' })` and `({ kind: 'asset-fee' })` (both
  reconcilers already live); `getTierPrices`; `getMemberStanding`.
- Produces: the renew card shows the household's standing line, last tier (changeable
  in place), and the settings price; confirming mints/reuses the unpaid membership row
  (same season rule as Task 5) and redirects to a plain `dues` checkout. The
  `#renew` anchor the reminder emails target lands on the working card. An approved,
  unpaid asset assignment shows its fee and a pay door through the `asset-fee`
  checkout. The stub copy ("online renewal is coming soon") is gone.

- [ ] Failing tests first: mint-then-checkout action, tier change repricing from
  settings, unpaid-row reuse, asset pay door only on approved+unpaid assignments.
- [ ] Implement to green; full gate; commit.

### Task 7: The content and language pass — CONDUCTOR-OWNED

Main-loop work per the standing ruling (content is never dispatched). Rewrite
`join.md` ("How to Apply" becomes the live door; the interim callout dies;
`membership-pricing` directive replaces hardcoded dollars), rewrite
`renewing-your-membership.md` (portal door), touch `class-registration.md` and
`new-member-guide.md` where they describe the doors, retire the dormant
`membershipworks` directive from the registry, regenerate the manifest. Copy through
the content-review gates; standing vocabulary consistent with the flows.

- [ ] Rewrites drafted against the style guide, content-review pass, manifest
  regenerated, full gate, commit.

### Task 8: Settle — e2e, visual, reviewer fan-out

**Files:**
- Create/modify: `e2e/` specs and visual baselines
- Test: `npm run test:e2e`

- [ ] E2E: the join happy path (stub checkout), the class-door pivot, the portal renew
  action — against the local D1 seed (no member PII).
- [ ] Visual: `/join/apply` and the changed portal card join the five-viewport suite;
  baselines regenerate in this change.
- [ ] Reviewer fan-out (workflow lenses): `web-auth-security-reviewer` over the public
  money paths (join action, welcome-back, class gate, webhook changes),
  `svelte-reviewer` over the new UI, `cloudflare-workers-reviewer` over
  payments/reconcile/webhook diffs. Conductor triages; confirmed findings fixed.
- [ ] `code-simplifier` over the arc's diff; full gate; STATUS.md + ROADMAP.md updated;
  commit. Deploy to dev via wrangler (Actions billing-blocked) and hand Geoff the
  before/after — the apex never moves here.

## Sequencing

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, serial (one working tree, one implementer at a time;
clock time is not a budget). Tasks 4 and 6 could swap or interleave with 5 if a
dispatch fails and needs isolation, but the default is the listed order.

## Live-DB checklist (conductor)

- [ ] Scratch-prove 0022 (forward, verify, rollback, verify-empty) on a disposable D1.
- [ ] Apply 0022 to live asc-club; verify template rows.
- [ ] Rebuild local D1 with 0022 for the dev server and e2e seeds.
