# Money ledger implementation plan

> **For agentic workers:** executed by a Workflow (conductor orchestrates; one Sonnet
> implementer per task; reviews between tasks). Tasks specify outcomes and contracts,
> not code — the implementer owns the code. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the canonical `transactions`/`transaction_lines` ledger — schema, live Stripe
write path (including donations, persisted for the first time), and the 401-transaction
MW backfill script.

**Spec:** `docs/2026-07-13-money-ledger-design.md` — READ IT FIRST; it carries the full
schema, invariants, and category-by-category backfill mapping. This plan sequences the
work and pins the contracts between tasks.

**Architecture:** two new D1 tables (migration 0021) written through a new
`src/admin-club/lib/ledger.ts` seam; the three existing Stripe reconcilers and a new
fourth `donation` kind write ledger rows; a verified-import script backfills MW history.
Live DB operations (scratch proof, live apply, backfill run) are conductor-owned and are
NOT part of any implementer task.

**Tech stack:** SvelteKit on Cloudflare Workers, D1 (sqlite), vitest with the existing
`src/tests/_fake-d1.ts` fake, plain-node `.mjs` import scripts.

## Global constraints

- Gates for every task: `npm run check` 0 errors/0 warnings, `npm test` green (all
  existing tests stay green), `npm run build` green.
- All new money amounts are integer cents; existing dollar columns are untouched
  (spec: "Schema" preamble).
- snake_case columns, TEXT uuid PKs, `datetime('now')` timestamps — match migrations
  0014–0020, not 0005's camelCase.
- `EVENTS_DB` is never touched. Only `CLUB_DB` (asc-club).
- No plaintext member data is ever committed; import fixtures use invented people.
- TypeScript comments follow the ts-conventions standard (TSDoc, contract-not-type);
  no em dashes in code comments.
- Commit per task, imperative mood, `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

### Task 1: Migration 0021_money_ledger

**Files:**
- Create: `migrations/asc-club/0021_money_ledger/forward.sql`
- Create: `migrations/asc-club/0021_money_ledger/rollback.sql`
- Create: `migrations/asc-club/0021_money_ledger/verify.sql`
- Create: `migrations/asc-club/0021_money_ledger/README.md`

**Interfaces:**
- Produces: the `transactions` and `transaction_lines` DDL every later task writes
  against. Column set, CHECK vocabularies, nullability, and indexes exactly as the
  spec's "Schema" section tables — including the partial unique index on
  `transactions.mw_ref` (`WHERE mw_ref IS NOT NULL`) and the self-FK
  `refunds_transaction_id`.

**Steps:**
- [ ] Read the spec's Schema section and migration 0020's four files (the pattern:
      header comments naming the ruling, rollback drops in FK-safe order, verify.sql
      proves shape and emptiness).
- [ ] Write `forward.sql`: both tables, all CHECK constraints, FKs
      (`transaction_lines.transaction_id` → transactions; domain FKs to `memberships`,
      `class_enrollments`, `asset_assignments`; `household_id` → households), all
      indexes from the spec.
- [ ] Write `rollback.sql` (drop lines before transactions) and `verify.sql`
      (tables exist, expected column count, indexes present, zero rows).
- [ ] Write `README.md` in migration-0020's register: what the ruling is, the
      scratch-proof procedure with a disposable `asc-club-scratch-0021` database,
      noting the conductor performs it.
- [ ] Gates, then commit
      (`feat(data): migration 0021 — the transactions/transaction_lines money ledger`).

**Acceptance:** forward.sql applies cleanly to a fresh sqlite (the conductor
scratch-proves against real D1 later); rollback returns to the prior shape; verify.sql
passes on a freshly-migrated empty database; DDL matches the spec column-for-column.

---

### Task 2: `ledger.ts` — the write seam

**Files:**
- Create: `src/admin-club/lib/ledger.ts`
- Test: `src/tests/ledger.test.ts` (use `_fake-d1.ts` like `stripe-reconcile.test.ts`)

**Interfaces:**
- Consumes: Task 1's DDL.
- Produces (exact contracts later tasks import):
  - `type TransactionKind = 'charge' | 'refund' | 'void'`
  - `type TransactionSource = 'stripe' | 'paypal' | 'check' | 'cash' | 'comp' | 'other'`
  - `type LineItem = 'dues' | 'class-fee' | 'asset-fee' | 'donation' | 'discount' | 'other'`
  - `interface TransactionHeader { id?: string; kind: TransactionKind; source: TransactionSource; occurredAt: string; amountTotalCents: number; feeCents?: number | null; processorRef?: string | null; refundsTransactionId?: string | null; householdId?: string | null; payerName?: string | null; payerEmail?: string | null; memo?: string | null; mwRef?: string | null }`
  - `interface TransactionLineInput { item: LineItem; description: string; amountCents: number; membershipId?: string | null; enrollmentId?: string | null; assignmentId?: string | null }`
  - `buildTransactionStatements(db: D1Database, header: TransactionHeader, lines: TransactionLineInput[]): { id: string; statements: D1PreparedStatement[] }`
    — validates the lines-sum-to-total invariant and the one-domain-ref-per-line rule,
    throws on violation; mints `id` when the header omits it.
  - `recordTransaction(db: D1Database, header: TransactionHeader, lines: TransactionLineInput[]): Promise<string>`
    — executes the statements via `db.batch()`, returns the transaction id.
  - `signedAmountCents(kind: TransactionKind, amountTotalCents: number): number`
    — charge positive, refund negative, void zero (the spec's sum convention).

**Steps:**
- [ ] Test-first: invariant violations throw (lines don't sum; a line with two domain
      refs); a valid call produces one transactions INSERT plus one INSERT per line
      with the right bindings; `recordTransaction` batches and returns the id;
      `signedAmountCents` covers all three kinds.
- [ ] Implement minimally; follow `stripe-reconcile.ts`'s module-header comment style
      (why this module exists, who calls it).
- [ ] Gates, then commit (`feat(club): ledger.ts, the transactions write seam`).

**Acceptance:** the exported names/signatures above exactly; invariants enforced at the
seam, not left to callers.

---

### Task 3: Reconciler ledger writes + the donation kind

**Files:**
- Modify: `src/admin-club/lib/payments.ts` (PAYMENT_KINDS grows `'donation'`)
- Modify: `src/admin-club/lib/stripe-reconcile.ts`
- Modify: `src/theme/donate.remote.ts` (switch to `createCheckout`)
- Modify: `src/routes/(site)/api/stripe/webhook/+server.ts` (dispatch `'donation'`)
- Test: extend `src/tests/stripe-reconcile.test.ts`; touch
  `src/tests/donate-pricing.test.ts` only if its assertions break.

**Interfaces:**
- Consumes: Task 2's `recordTransaction` exactly as pinned there.
- Produces: `reconcileCheckoutSession` accepts `kind: 'donation'`; behavior contracts
  below.

**Behavior contracts (from the spec's "Live write path"):**
- Each existing reconciler (`dues`, `class-fee`, `asset-fee`) calls
  `recordTransaction` ONLY after its guarded domain flip reports `changes: 1`; the
  no-op and unknown-refId paths write no ledger row. Sequential, not batched with the
  domain flip (the spec explains why); existing guards, audit writes, and receipt
  emails are preserved byte-for-byte in behavior.
- Ledger header per reconciler: `kind: 'charge'`, `source: 'stripe'`,
  `occurredAt` now, `amountTotalCents: session.amount_total ?? 0`,
  `processorRef: session.id`, `householdId` resolved from what the reconciler already
  loads (dues: the membership's household; class-fee: the member's household — extend
  the existing SELECT; asset-fee: the assignment's household via its membership). One
  line: item = the payment kind, description = the same display string the receipt
  email already builds, the matching domain ref.
- Donations: `donate.remote.ts` replaces its hand-rolled checkout body with
  `createCheckout({ kind: 'donation', refId: crypto.randomUUID(), ... })`, preserving
  its current amounts, copy, keyless-degrade stub, and error UX. A new
  `reconcileDonation` inserts the transaction (id = refId so a Stripe retry collides
  on the PK; header `source: 'stripe'`; payer snapshot from the session's
  `customer_details.name`/`customer_details.email` when present — extend
  `StripeCheckoutSession` accordingly) with one `donation` line. No receipt email in
  this initiative unless one already exists for donations (it does not).
- The webhook route's metadata validation accepts the fourth kind with no other
  behavior change.

**Steps:**
- [ ] Test-first against the contracts above, including: reconciler no-op paths write
      zero ledger rows; a successful dues reconcile writes exactly one transaction +
      one line with the right household; donation reconcile is idempotent on PK
      collision (second call returns an ok no-op, never throws).
- [ ] Implement; gates; commit
      (`feat(club): reconcilers write the ledger; donations persist as a fourth kind`).

**Acceptance:** all behavior contracts hold under test; every pre-existing
`stripe-reconcile.test.ts` assertion still passes unmodified unless it asserted the
absence of ledger writes.

---

### Task 4: `mw-ledger.mjs` — the backfill import

**Files:**
- Create: `scripts/import/mw-ledger.mjs`
- Create: `scripts/import/mw-ledger.README.md`
- Create: `scripts/import/mw-ledger.verify.sql`
- Create: `scripts/import/mw-ledger.rollback.sql`
- Test: `src/tests/mw-ledger-import.test.ts`

**Interfaces:**
- Consumes: Task 1's DDL; the spec's "Backfill" section (the category-by-category
  mapping for all 401 rows is there — treat it as the requirements list); the
  conventions of `mw-members.mjs` v2 (flags, plan-then-apply phases, audit provenance)
  and its README/verify/rollback siblings.
- Produces: a CLI with `--accounting` (default
  `~/.local/asc-data/mw-accounting-2026-07-13.csv`), `--db` (the wrangler d1 name),
  dry-run by default, `--apply` gate; planning functions exported for the vitest
  fixtures (the `mw-members-import.test.ts` pattern).

**Behavior contracts (beyond the spec's mapping):**
- Idempotency key: `mw_ref`, minted deterministically from the export row's own
  transaction identifier (inspect the real export's columns at build time via its
  header row only — the README documents the chosen derivation). A re-run after apply
  plans zero changes.
- Domain linking: memberships matched via `mw_account_id` + season (cross-checked
  against stored `stripe_ref` where both exist); enrollments via the roster-identified
  rows' provenance; a transaction that resolves to no imported member is REFUSED
  loudly in the plan output, never skipped silently.
- Rollback deletes exactly the imported rows (`WHERE mw_ref IS NOT NULL`), lines first.
- verify.sql implements the spec's cross-checks: per-category row counts, every paid
  membership has exactly one dues line, dues totals reconcile to
  `memberships.pricePaid` (dollars-to-cents), lines-sum-to-total for every transaction.
- Test fixtures cover: a membership bundle with an asset add-on line, a comp
  (zero-total, negative discount line), a refund linked to its charge, a void, a
  donation, and an unmatchable row refused.

**Steps:**
- [ ] Read `mw-members.mjs` + its README/verify/rollback and
      `mw-members-import.test.ts` for the pattern; read only the HEADER ROW of the
      real accounting CSV for column names (never print data rows).
- [ ] Test-first with invented-people fixtures per the list above.
- [ ] Implement the script + README + verify.sql + rollback.sql; gates; commit
      (`feat(data): mw-ledger.mjs, the 401-transaction MW ledger backfill`).

**Acceptance:** fixtures pass; a dry run against the real local plaintext produces a
readable plan whose category totals match the spec's counts (239/157/75/5/9/14) — print
counts only, no PII in the plan output beyond what mw-members.mjs already prints.

---

### Task 5 (conductor-owned — never dispatched): live database operations

- [ ] Scratch-prove 0021: create `asc-club-scratch-0021`, forward, verify, rollback,
      verify-empty, delete.
- [ ] Apply 0021 to the live `asc-club`; run verify.sql.
- [ ] Back up live (`~/.local/asc-data/backups/`, the mw-members pattern).
- [ ] Run `mw-ledger.mjs` dry-run against live; READ the plan; then `--apply`; run
      mw-ledger.verify.sql; re-run dry-run and confirm a zero-change plan.
- [ ] Reviewer fan-out + code-simplifier over the initiative's diff; fix confirmed
      findings; full gate; push.
