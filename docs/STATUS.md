# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**PAYMENTS HARDENING EXECUTED — CONSOLIDATED, GATE-GREEN, DELIBERATELY UNPUSHED (2026-07-15
overnight). Ran the hardening half of docs/plans/2026-07-15-payments-live-smoke.md (Tasks
1-6 + conductor steps 1-2) per the go. CONDUCTOR-COST NOTE: the go ruled this Opus-conducted,
but it STARTED as Fable (75% weekly Fable already spent) and switched to Opus 4.8 early at
Geoff's prompt — flagged so the spend shows; a Fable-conducted execution run against a
finished plan was not the intended config. SEVEN COMMITS, UNPUSHED (push=dev-deploy; leave
them, push on the morning go): 56500fb Turnstile on the five remaining public POSTs
(payClassFee, requestRenewLink, requestLink, offer claim/decline, confirm/resend, all
degrade-to-open); 85e580f rate limits (five [[ratelimits]] namespaces MONEY/PUBLIC_POST/
MEMBER/ADMIN/ENUMERATION, a degrade-to-open helper, keyed per IP+email / session / editor,
fail-closed 429 with an admin audit row); 404b44e an optional smoke memo threaded through the
reconcile + refund ledger writes (no schema change); 73683d8 the Stripe key-swap procedure
(design-doc appendix A, one procedure for both the smoke swap and the cutover flip); 81b2ffb
the review-fix round; 34d947f offer-fixture determinism; fd61fcf the simplifier. FINAL GATE:
check 0/0, test 1216, build green, e2e 33/33 on the correct asc-site. Tasks map 1:1 to the
plan: T1 Turnstile, T2 (no code) cairn login exposure, T3 rate limits, T4 memo, T5 appendix,
T6 the four-lens review.

THE REVIEW GATE EARNED ITS KEEP. (1) svelte-reviewer caught a LIVE-PROD BLOCKER: the signup
page's pay-fee and renew widgets live in client-revealed {#if} branches, so Turnstile's
one-time implicit scan never renders them, no cf-turnstile-response is injected, and in prod
(TURNSTILE_SECRET_KEY confirmed live by web-auth) verifyTurnstile('') fails CLOSED — silently
breaking payClassFee (the smoke's own money path) and requestRenewLink, invisible in dev (no
secret) and to the pixel baselines. Fixed with explicit render (a turnstileExplicit action +
onTurnstileReady, api.js loaded once in <svelte:head>), signup page ONLY; the four working
forms and the native-form pages left on their working implicit render. (2) daisyui-a11y caught
a regression: the confirm page funneled Turnstile/rate-limit failures into the "sign-in link
expired" heading (misleading) and silently swallowed resend failures; fixed with a distinct
spam-check error shape, enumeration-safe. (3) I CAUGHT what the fix agent misreported as a
pre-existing offer-test flake: it was a determinism defect THIS pass introduced (the offer
page renders expires_at with timeStyle:'short' and the fixture used datetime('now','+1 day'),
so the clock shifted every run and the CI pixel rider would flake); pinned the fixture to a
fixed timestamp and regenerated the baseline. web-auth + cloudflare-workers reviewers: CLEAN,
no Critical/High; their notes are operational/residual (below).

FOR GEOFF'S MORNING GO (the sandbox dry-smoke, the deploy, your before/after, and the live
smoke ALL still wait on you):
- CONDUCTOR FLAG (touches the smoke's refund step): the household-desk ?/refund UI form has NO
  memo field (unmodified, no new public surface), so the smoke's REFUND memo must be written by
  calling executeRefund with the memo directly (a script/one-off), NOT through the plain UI. The
  CHARGE memo rides createCheckout metadata.memo cleanly. Memo string: `live-smoke 2026-07-XX`.
- HELD DECISIONS still open (spec §6): smoke product ($1 donation default vs $100 domain-unwind);
  dev-Access posture — dev IS public today, so the now-hardened-but-degrade-to-open magic-link/
  money endpoints face the open internet against real member data UNTIL these commits deploy
  (re-protect-dev vs accept-public); memo vs marker-column marking (Task 4 shipped memo only, the
  column stays your call).
- STEPS IN ORDER: push the 7 commits (= the dev deploy) → your before/after on the four changed
  public forms → sandbox dry-smoke (spec §3, the FIRST-EVER webhook-reconcile execution,
  processed_stripe_sessions=0 live) → your go → key-swap per appendix A → live smoke → revert to
  sandbox keys.

DX HARVEST (for cairn; NOT written into the cairn-cms repo — it had a LIVE session running a
workflow tonight; route these there yourself/next cairn session): (1) cairn /admin/auth/request
editor-login is UNGATED — no Turnstile/rate-limit seam, only a per-email 60s cooldown that LEAKS
editor membership (a `throttled` status body a non-editor can't produce + a send-timing gap);
cairn wants a public-auth abuse seam (built-in per-IP [[ratelimits]] + an optional injected
verifyChallenge hook). Full text: this session's scratchpad task2 note. (2) degrade-to-open is
operationally load-bearing (web-auth M1 + cloudflare reviewer) — a cairn-doctor check that fails
LOUD in prod when TURNSTILE_SECRET_KEY is unset would catch a silent wide-open. (3) site bindings
(RATE_LIMIT_*) aren't expressible on the engine's narrow AdminActionEvent/PortalActionEvent
platform.env type, forcing documented cast bridges (resolveAdminRateLimit etc).

INFRA FOLLOW-UPS (backlog, not blocking the smoke): (A) e2e/fixtures/events-seed.sql doesn't
clear class_reminders_sent + credit_redemptions before DELETE FROM class_enrollments, so a warm
workstation .wrangler replica fails the 2nd `npm run test:e2e` bootstrap with an FK error (CI
cold-replica unaffected); worked around this run by clearing those two tables — real fix is to add
those deletes to the top of events-seed.sql. (B) playwright.config.ts reuseExistingServer:!CI on
hardcoded port 4173 SILENTLY reuses whatever squats 4173 and renders the WRONG SITE — a live
cairn-cms session's `vite preview --port 4173` made ASC e2e render the Cairn Showcase; verified on
port 4174 temporarily (config edit reverted, NOT committed). Wants a webServer identity guard or a
dedicated port. Residual security notes carried for the smoke threat model: the enumeration oracle
(checkKnownEmail/checkClassEligibility) is rate-limited but still slow-scrapable; IP-only keys on
money/token paths; per-colo approximate rate-limit caps (treat as speed bumps under Turnstile+auth);
no CSP header (pre-existing, more relevant now with the added third-party script; token-in-URL pages
stay safe only via the existing no-referrer policy).

QUEUED (unchanged, for a Geoff-attended session): the five-stop dev walkthrough; the 07-15
apology-send verification (check the JSONL beside ~/.local/asc-data/send-apology-2026-07-15.mjs if
that session died).**

**OVERNIGHT AUTHORING RUN COMPLETE (2026-07-15, the predecessor to the hardening run above: Opus
agents researched, drafted, and adversarially verified; Fable briefed, reviewed line-level,
triaged). Authored the payments-live-smoke spec (docs/2026-07-15-payments-live-smoke-design.md) +
plan (docs/plans/2026-07-15-payments-live-smoke.md) + the mw-cutover runbook
(docs/2026-07-15-mw-cutover-runbook.md), the polish-backlog triage
(docs/design-benchmark/polish-triage.md), and the admin e2e login helper
(e2e/helpers/admin-session.ts + admin-login.spec.ts). Commits 5abff25 / 4fc774e / 7598470 /
f920d2f, DELIBERATELY UNPUSHED (push=dev-deploy; part of the same unpushed stack as the hardening
commits above — push them all together on the morning go). THE ADVERSARIAL VERIFY ROUND PAID (all
findings confirmed against source before editing): (1) the cutover flip is ROUTE reassignment, not
custom domains — a custom domain refuses the existing proxied records and its rollback strands the
apex recordless; runbook rewritten, routes primary; (2) the pre-flip permalink crawl was
legacy-against-legacy false green — now the legacy URL list against the dev build; (3) requestLink
(/my-account signed-out sign-in) is a FIFTH ungated public magic-link sender both researcher and
drafter missed — added to spec+plan (and gated by the hardening run above); (4) refunds live on the
household desk (admin/club/members/[id] ?/refund), not the money screen — all references fixed; (5)
the Workers ratelimit binding went GA 2025-09 — the plan declares [[ratelimits]], not
unsafe.bindings. STANDING FINDINGS still true: dev.aksailingclub.org is NOT behind Access (verified
live 200 tokenless; project CLAUDE.md's Access section is STALE, left unedited pending Geoff's §6
ruling; the asc-cloudflare-access memory is updated); the webhook-reconcile path has never fired
(the smoke is its first execution); three Turnstile widgets cover the site (0x4AAAAAACaRcPmackdot0hZ),
two orphans routed to the infra tidy (polish-triage.md).**
