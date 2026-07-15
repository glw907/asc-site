# Payments hardening and the live-Stripe smoke: design

Authored 2026-07-15 from the settle-in-advance rulings on the ROADMAP `payments-live-smoke`
entry (Geoff, 2026-07-14). This spec briefs Geoff and the post-window Opus execution session.
It covers two pieces of one initiative: closing the Turnstile gaps and adding rate limits on
every public and authenticated write path (the hardening), then the first end-to-end money
proof against live Stripe keys (the smoke). The hardening lands and verifies first; the smoke
then also proves the hardened endpoints still work.

The live charge happens only on Geoff's explicit go, at execution time, on Geoff's own card.
Nothing in this spec runs against live keys before that go.

## 1. What the smoke proves

The webhook-reconcile path has never fired end to end. `processed_stripe_sessions` holds zero
rows on the live database. All 300 `source='stripe'` ledger rows are the MembershipWorks
backfill (`mw_ref` set); no webhook has ever written a row. The smoke is the first proof that a
real payment travels the whole path:

- checkout session created (`createCheckout`, `src/admin-club/lib/payments.ts`),
- `checkout.session.completed` delivered and signature-verified
  (`src/routes/(site)/api/stripe/webhook/+server.ts`),
- reconciled into `transactions` + `transaction_lines` with the ledger invariant held
  (`src/admin-club/lib/stripe-reconcile.ts`, write seam `src/admin-club/lib/ledger.ts`),
- receipt email sent through the cairn `EMAIL` binding,
- refunded through the admin refund path (`admin/club/money` `?/refund` →
  `src/admin-club/lib/refunds.ts`), which is part of the proof, not a cleanup step.

The real ledger rows and the confirmation email stay. They are marked as the smoke in the
audit trail (section 4). The smoke also exercises the hardened endpoints: the donation form
carries Turnstile, and the money paths sit under the new rate limits.

## 2. The hardening design

### 2a. Turnstile on every public unauthenticated POST

The ruling: Turnstile gates every public unauthenticated POST. Authenticated member and admin
forms rely on session plus rate limits instead (section 2b). The verify helper already exists
(`verifyTurnstile`, `src/theme/turnstile.ts`); the gate pattern is
`if (secret && !(await verifyTurnstile(...))) invalid(...)`, keyed off `TURNSTILE_SECRET_KEY`
so an unprovisioned environment degrades to open, matching the existing four gated forms.

Already gated, no change: `sendMessage`, `createDonationCheckout`, `applyJoin`, `joinClass`.

Gaps to close, endpoint by endpoint:

- **`payClassFee`** (`src/theme/class-fee-checkout-form.ts`, the testable schema and handler
  behind `class-fee-checkout.remote.ts`). Its schema has no `cf-turnstile-response` field.
  Add the field to `classFeeCheckoutSchema`, verify in `handleClassFeeCheckout`, and render
  the widget on the class-fee pay form. This is a money form; the gate is unambiguous.
- **`requestRenewLink`** (`class-signup.remote.ts`). Sends a magic-link email; already
  enumeration-safe (uniform response). Add the gate and the widget on the renew-link request
  form. Turnstile blunts automated mailing of the send path.
- **Offer `claim` / `decline`** (`(site)/classes/offer/[token]/+page.server.ts`). Form actions,
  token-gated, no CSRF token today; `claim` sends an email. The token already limits who can
  reach these actions, so the marginal abuse surface is small; the friction of a challenge on a
  member acting from their own offer link is real. The ruling stands: add Turnstile to both
  actions and the widget on the offer page. Flagged for Geoff to override in review if the
  friction outweighs the send-path protection.
- **`confirm` / `resend`** (`(site)/my-account/confirm/+page.server.ts`). Magic-link landing;
  CSRF double-submit only today; `resend` sends an email. A member reaches this page from their
  own email link, so a challenge adds friction to the confirm step. The ruling stands: add
  Turnstile; `resend` is the higher-value target. Flagged for Geoff the same way.

Where a form action lacks a CSRF token today (the offer actions), Turnstile plus the origin
check is the replacement; do not add a second CSRF scheme in this pass.

### 2b. Rate limits

No rate limiting exists today: no binding, no counters, no throttle. The ruling makes the
mechanism the spec author's call, with a tradeoff record.

**Decision: the Workers rate-limiting binding as the per-key throttle, with a coarse
zone-level WAF rule layered in front.** The binding (`unsafe.bindings` type `ratelimit`,
declared in `wrangler.toml`, one namespace per limit class) runs inside the worker where the
request already carries the discriminating key: the caller email, the endpoint, the payment
kind, the session or editor identity. It keys per email and per endpoint, which is what the
money forms and the enumeration probes need and what a per-IP-only scheme cannot express. It
adds no database round trip on the hot path and no new D1 table. In front of it, a single
zone-level WAF rate-limiting rule gives a free per-IP flood cap that never reaches the worker
and also fronts the webhook path.

Tradeoff record: the Workers binding is a beta namespace, and that risk is accepted. The
alternative, D1-backed counters, adds a database round trip to every gated request and its own
migration for a per-key audit the `audit_log` already provides on money actions; the gain does
not pay for the hot-path latency. Zone WAF alone cannot key on email or endpoint, so it cannot
carry the enumeration or per-form limits on its own; it earns its place only as the coarse
front net. If the beta binding is withdrawn or proves unreliable at execution time, the
fallback is D1 counters scoped to the money and enumeration paths only, recorded as a
follow-up rather than blocking the smoke.

Coverage the design must carry:

- **Public POSTs**: per-IP and per-email limits on the checkout, join, class-signup, contact,
  renew-link, offer, and confirm paths. The money paths get the tightest caps.
- **Authenticated member POSTs** (`portalAction`: CSRF plus session): keyed per member
  session. These rely on session plus rate limits per the ruling, not Turnstile.
- **Admin POSTs** (auth guard plus club-role gate, including `admin/club/money` `?/refund`):
  keyed per editor. Session plus rate limits, not Turnstile.
- **Public enumeration-capable GET probes** (`checkKnownEmail`, `checkClassEligibility`,
  read-only `query()`): keyed per IP and per probed email to blunt enumeration. Out of the
  Turnstile ruling's scope; in scope for rate limits.

Limit values are execution-time calls the implementer sets conservatively and records; they
tune post-smoke.

### 2c. The cairn editor-login magic-link POST

Cairn's own editor-login magic-link POST, mounted under `/admin`, is package-owned and was not
in the endpoint sweep. The plan includes a task to verify its exposure. If it is ungated, file
it as a cairn DX-harvest item per the standing mandate; do not patch the package locally.

## 3. The sandbox dry-smoke (runs first, must pass before any live-key swap)

The keys currently bound are sandbox mode, and the sandbox webhook endpoint is already
registered at `/api/stripe/webhook`. Because the reconcile path has never fired, prove the
wiring cheap before spending a real charge. The dry-smoke runs the same $1 donation flow with a
Stripe test card against the bound sandbox keys, on dev:

1. Complete a $1 donation checkout with a Stripe test card.
2. Confirm `checkout.session.completed` reaches the webhook and verifies its signature.
3. Confirm one `transactions` row plus its `transaction_lines`, invariant held, and one new
   `processed_stripe_sessions` row (the first ever).
4. Confirm the receipt email sent (controlled payer address).
5. Refund through `admin/club/money` `?/refund`; confirm the refund transaction, the
   `refunds_transaction_id` self-FK, and the audit-sink entry.

The dry-smoke must pass fully before the live-key swap. A failure here halts the initiative at
zero real cost.

## 4. The live smoke

Runs only on Geoff's explicit go, on Geoff's card, after the hardening is deployed and the
dry-smoke is green.

**Key swap.** Register the live-mode webhook endpoint for
`https://dev.aksailingclub.org/api/stripe/webhook` in Stripe (live and sandbox modes have
separate endpoints and signing secrets). Swap `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
to live values. Secret values flow through the ASC secret store
(`aksailingclub-legacy/secrets/`), never loose files; the Stripe dashboard is the mint origin.
This spec owns the key procedure; the mw-cutover runbook
(`docs/2026-07-15-mw-cutover-runbook.md`) reuses it, for the temporary smoke swap here and the
permanent cutover flip there. Write the procedure once so both callers share it.

**The charge.** Default product: a **$1 donation**. It is the cheapest real charge, mints its
own `refId` (`crypto.randomUUID()`) with no domain row, and exercises the full checkout →
webhook → reconcile → ledger → refund path. See section 6 for the alternative Geoff can pick.

**Verify**, in order: checkout completes; the live webhook delivers and verifies; one
`transactions` row plus lines with the invariant held; the receipt email sent to the controlled
payer address; the refund executed through `admin/club/money` `?/refund`. The refund is
API-eligible because the smoke minted a `cs_`/`pi_` processor ref this site owns
(`apiEligible`), and the idempotency key (`buildRefundIdempotencyKey`, SHA-256 over chargeId +
refundedSoFar + sorted lines) is deterministic, so a retry is safe.

**Smoke marking.** The `transactions` table has no test or synthetic column. Default to a memo
convention: memo `live-smoke 2026-07-XX` on both the charge and refund rows, plus an
`audit_log` entry naming the smoke. The rows and the receipt email stay, marked. A first-class
marker column is the honest alternative if Geoff prefers it (section 6); the memo convention is
the conservative default and needs no migration.

**Revert.** Swap `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` back to sandbox values.
Pre-cutover dev must not sit on live keys. The live-mode webhook endpoint may stay registered
in Stripe (harmless, disabled) or be removed; document which. Record the revert in the runbook.

## 5. Expected outcomes and abort criteria

Each stage names what observation halts it and what the halt-state cleanup is.

- **Checkout session fails to create.** Stop; fix wiring; no cost. Sandbox stage.
- **Webhook never received** (`processed_stripe_sessions` stays 0). Stop. Check the endpoint
  registration and the signing secret for the active mode. This is exactly the never-fired path
  under test. No cost in sandbox; in live, see the orphaned-charge case below.
- **Reconcile 500 loop** (donation/join reconcile returns 500 on DB error so Stripe retries).
  Inspect Workers logs; fix the reconciler; sandbox only, no live money at risk.
- **Ledger invariant violation** (`SUM(lines) != header`). The write seam threw before writing.
  Stop and inspect; nothing partial was written.
- **Live charge succeeded but the webhook never reconciled.** The money left Geoff's card and
  no ledger row exists. HALT. Do not retry the charge. Refund directly in the Stripe dashboard
  or API against the `payment_intent` (the API refund path needs a ledger row it does not have).
  Record the orphaned charge and its manual refund. Diagnose the webhook before any retry.
- **Refund succeeded at Stripe but the batch write failed.** Stripe refunded; the ledger still
  shows the charge unrefunded. The idempotency key is deterministic, so re-running
  `executeRefund` returns the same Stripe refund and re-attempts the single `db.batch`. If the
  batch still fails, reconcile the ledger row with a documented manual correction; do not issue
  a second Stripe refund.
- **Receipt email fails to send.** Non-fatal to money correctness. Note it; inspect the
  `EMAIL` binding. Does not halt the smoke.

`executeRefund` calls Stripe first and writes nothing on Stripe failure, so a refund that fails
at Stripe leaves the ledger untouched and is safe to retry.

## 6. Geoff's decision points

1. **Product choice.** Default: the $1 donation (cheapest, no domain row). Alternative: a $100
   class fee or a $100 young-adult membership, which additionally exercises a domain-row unwind
   on refund. Geoff picks at go time.
2. **Dev-Access posture.** `dev.aksailingclub.org` is public today (verified live: 200 with no
   token, contradicting stale CLAUDE.md). The Turnstile-gap endpoints are therefore exposed to
   the open internet against the real member database until the hardening lands. The choice:
   re-protect dev with a Cloudflare Access app (which then needs a webhook-path bypass app, the
   estate precedent being the "ASC Ops Schema API (public)" bypass) versus accept dev-as-public
   until cutover. Both are presented; neither is decided here. This is a security flag Geoff
   resolves.
3. **Smoke marking.** Memo convention (default, no migration) versus a first-class marker column
   on `transactions` (an optional migration, honest but heavier). The schema is fully evolvable
   by project doctrine, so the column is a legitimate option; the memo convention is the
   conservative default.

## 7. Execution constraints

- Execution runs post-window under an Opus conductor, orchestrate-and-verify: dispatch each
  hardening task to a `site-implementer`, review the diff, clear the gate before the next.
- The live charge happens only on Geoff's explicit go, at execution time.
- The hardening deploys through the normal gates: `npm run check` (0/0), `npm test`,
  `npm run build`, and the e2e pixel-diff suite. The Turnstile widgets touch public forms, so
  their rendering changes; regenerate the visual baselines in the same change, and take Geoff's
  before/after per the member-facing rule.
- The dry-smoke passes before any live-key swap. The revert to sandbox keys is mandatory and
  documented.
- Never touch `EVENTS_DB`. `AUTH_DB` and `asc-club` are this site's own; the only schema change
  this spec might make is the optional marker column, and only if Geoff picks it.

## Non-goals

No production-apex cutover (that is the mw-cutover runbook, on Geoff's separate go). No changes
to the refund business rules or the ASC refund policy. No new CSRF scheme. No member-facing
copy changes beyond the Turnstile widgets. No live charge without Geoff's go.
