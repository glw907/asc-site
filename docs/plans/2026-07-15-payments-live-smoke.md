# Payments hardening and live-smoke implementation plan

> Executes `docs/2026-07-15-payments-live-smoke-design.md`. Per the workstation doctrine, tasks
> specify outcomes, constraints, and acceptance criteria, not implementation code. Execution:
> post-window under an Opus conductor, orchestrate-and-verify: dispatch each code task to a
> `site-implementer`, review its diff, clear the gate before the next. The sandbox dry-smoke,
> the live-key swap, the live charge, and the revert stay with the conductor (the
> "Conductor-owned smoke" section) and run only on Geoff's explicit go, never inside a task or a
> workflow.

**Goal:** close the Turnstile gaps and add rate limits across every write path, then prove the
first end-to-end live payment and its refund through the ledger, marked as the smoke.

**Stack:** SvelteKit 2 + Svelte 5, cairn-cms, Cloudflare Workers + D1, Stripe, Cloudflare
Turnstile, the Workers rate-limiting binding, vitest, Playwright.

## Global constraints

- Gate for every code task: `npm run check` at 0 errors / 0 warnings, `npm test` all green,
  `npm run build` green. Tasks touching public-form rendering also run `npm run test:e2e` and
  regenerate the pixel baselines in the same change. Paste output tails when reporting done.
- Each task commits its own diff (imperative conventional-commit subject,
  `Co-Authored-By: Claude <noreply@anthropic.com>` footer), specific files only.
- TSDoc / Svelte comment standards apply (ts-conventions, svelte-conventions); no em dashes in
  comments. The Turnstile gate follows the existing `if (secret && !verify) invalid(...)`
  pattern exactly, so an unprovisioned environment degrades to open.
- Behavior parity except where the spec names a change. Introduce no new CSRF scheme.
- Report any cairn DX or contract friction met, in a **DX notes** section, even when empty.
- Never touch `EVENTS_DB`, member auth internals, or live D1. No live-key work in any task.

---

### Task 1: Turnstile on the public-POST gaps

**Files:**
- Modify: `src/theme/class-fee-checkout-form.ts` and the class-fee pay form component;
  `src/theme/class-signup.remote.ts` (`requestRenewLink`) and the renew-link form component;
  `src/routes/(site)/classes/offer/[token]/+page.server.ts` and `+page.svelte`;
  `src/routes/(site)/my-account/confirm/+page.server.ts` and `+page.svelte`.
- Test: extend the schema/handler tests for each (the `*-form.test.ts` pattern).

**Outcome:** each of `payClassFee`, `requestRenewLink`, the offer `claim`/`decline` actions,
and `confirm`/`resend` verifies a `cf-turnstile-response` token via `verifyTurnstile` and
renders the Turnstile widget on its form, matching the four already-gated forms. The offer and
confirm gates carry the friction note from the spec in a code comment; the ruling stands unless
Geoff overrides in review.

**Acceptance:** each handler test proves the gate rejects a missing/invalid token when the
secret is set and passes when it verifies, and that an unset secret degrades to open. The four
previously gated forms are unchanged. e2e baselines regenerated for the four affected public
pages; the diff shows only the expected widget additions. Full gate green. Commit.

### Task 2: verify the cairn editor-login magic-link exposure

**Files:**
- No source change expected (package-owned). Create no local patch.

**Outcome:** determine whether cairn's editor-login magic-link POST under `/admin` is gated
(Turnstile, rate limit, or enumeration-safe uniform response). If ungated, write it up as a
cairn DX-harvest item per the standing mandate, filed to the harvest, not patched here.

**Acceptance:** a written finding in the task report stating the endpoint's protection posture
and, if ungated, the DX-harvest item text. No repo files changed. Gate not required (no code).

### Task 3: rate limits across the write paths

**Files:**
- Modify: `wrangler.toml` (declare the rate-limiting binding namespaces), the shared request
  helpers behind the public remote functions, `portalAction`, and the admin action wrapper
  (`clubAdminAction`), plus the enumeration `query()` probes (`checkKnownEmail`,
  `checkClassEligibility`). Add a small rate-limit helper module.
- Test: create a rate-limit helper test.

**Outcome:** the Workers rate-limiting binding throttles per key per the spec's coverage table:
public POSTs keyed per IP and per email (tightest caps on the money paths), authenticated
member POSTs per session, admin POSTs per editor, enumeration GET probes per IP and per probed
email. A coarse zone-level WAF rate-limiting rule is documented as the front net (configured on
Cloudflare, recorded in the task report, not code). Over-limit requests fail closed with a
clear message. Limit values are set conservatively and recorded in a code comment or the report.

**Constraint:** if the beta binding is unavailable at execution time, stop and report; the
fallback (D1 counters scoped to money and enumeration paths) is a separate follow-up, not an
in-task pivot.

**Acceptance:** the helper test covers under-limit pass and over-limit reject for a
representative key. `npm run check`/`test`/`build` green. The binding is declared in
`wrangler.toml` and the WAF rule is recorded. Full gate green. Commit.

### Task 4: smoke-marking mechanism

**Files:**
- Modify: the refund/reconcile audit path only as needed to carry a memo; no schema change by
  default.
- Optional (Geoff's call, section 6 of the spec): `migrations/asc-club/0027_txn_smoke_marker/`
  (`forward.sql`, `rollback.sql`, `verify-forward.sql`, `verify-rollback.sql`, following the
  0026 exemplar) adding a first-class marker column to `transactions`.

**Outcome:** the default path lets the smoke write memo `live-smoke 2026-07-XX` on the charge
and refund rows and an `audit_log` entry, with no schema change. If Geoff picks the marker
column, this task scratch-proves the migration forward/rollback/verify on a local D1 copy only;
applying it to the live `asc-club` database is the conductor's step (conductor-owned smoke,
step 5a), never this task's.

**Acceptance:** default path needs no migration and only the memo/audit affordance; a test or
the task report shows the memo reaches the ledger row. If the column is chosen, the scratch
transcript (commands and outputs, both cycles clean) is in the report. Full gate green. Commit.

### Task 5: the key-swap procedure

**Files:**
- Modify: `docs/2026-07-15-payments-live-smoke-design.md`: the procedure lands as an appendix
  of the design doc, which is the document the mw-cutover runbook already points at. No secret
  values committed.

**Outcome:** a single reusable procedure for swapping `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` between sandbox and live, and registering the live-mode webhook endpoint
for `https://dev.aksailingclub.org/api/stripe/webhook`. Values flow through the ASC secret store
(`aksailingclub-legacy/secrets/`); the Stripe dashboard is the mint origin. The procedure serves
both the temporary smoke swap and the permanent cutover flip so `docs/2026-07-15-mw-cutover-runbook.md`
reuses it verbatim.

**Acceptance:** the procedure names every step for swap, register, and revert, with no secret
values in the repo. Reviewed against the mw-cutover runbook's key-procedure reference. No code
gate (documentation).

### Task 6: review fan-out (parallel, prose reports)

Reviewers over the whole pass diff (`git diff <pre-pass-commit>..HEAD`), each returning a prose
findings report: `web-auth-security-reviewer` (the Turnstile gates, the rate-limit keys, the
magic-link send paths, the CSRF-less offer actions), `cloudflare-workers-reviewer` (the
rate-limiting binding, `wrangler.toml`, any migration SQL, D1 usage), `svelte-reviewer` and
`daisyui-a11y-reviewer` (the Turnstile widget additions on the four public forms). The conductor
triages and dispatches fixes before the smoke.

---

## Conductor-owned smoke (never in a task or workflow)

1. Triage review findings; dispatch fixes; re-gate.
2. `code-simplifier` over the pass diff; apply; re-gate.
3. Deploy the hardening to dev through the normal gates (including e2e). Take Geoff's
   before/after on the four changed public forms per the member-facing rule.
4. **Sandbox dry-smoke** (spec section 3), against the currently bound sandbox keys: $1 donation
   with a Stripe test card, confirm webhook → reconcile → the first-ever `processed_stripe_sessions`
   row → ledger with the invariant held → receipt email → refund through `admin/club/money`.
   This must pass fully before any live-key swap.
5. **Geoff's go, product choice, dev-Access posture, and marking mechanism confirmed** (spec
   section 6).
   5a. If Geoff picked the marker column: apply the scratch-proven migration to the live
   `asc-club` database (forward + verify) before the smoke.
6. **Live smoke** (spec section 4), on Geoff's card: apply the key-swap procedure (Task 5),
   register the live webhook, run the chosen product's charge (default: the $1 donation),
   verify the whole path, refund through the admin path, write the memo + audit marking. Honor
   the abort criteria (spec section 5) at each stage.
7. **Revert** to sandbox keys; document the live webhook endpoint's disposition. Pre-cutover dev
   must not sit on live keys.
8. STATUS + ROADMAP + effort-memory updates; DX-notes aggregation filed for the cairn harvest.
   The mw-cutover runbook is confirmed to reuse the Task 5 key procedure. The apex is untouched.
