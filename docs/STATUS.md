# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**BASIC-POLISH ARC EXECUTED, VERIFIED, AND LIVE ON DEV (2026-07-16 overnight, the
crash-recovery session; Fable conducted at art-director altitude per Geoff's explicit economy
ruling, all volume work dispatched). The session RECOVERED the crashed 2026-07-15
invisible-polish session (no code lost — all batches were pushed; the scratchpad probes and the
in-flight state were reconstructed from transcripts and banked in the plan doc), landed the
register round, then ran Geoff's escalation ("pages must feel DESIGNED, not assembled; basic
polish before my feedback; use a workflow, Fable conducts only") as a full site-wide arc.

REGISTER ROUND (Geoff-ratified from rebuilt probes): 12d2985 — component text one step below
prose, hierarchy by weight/ink, en-dash prose bullets sitewide, ClassSchedule/SpineRow
compaction, event-facts conformed to the :::facts idiom. DOCTRINE BANKED: the resolved-craft
bar is standing CLAUDE.md law (8378a37) — the invisible-craft catalogue applies to ALL design
work at build time; memory feedback_designed_not_assembled carries it.

THE ARC (Geoff's workflow opt-in): a 10-agent observation workflow (9 Opus page-group
observers + coverage critic, wf_f30a1c8a-039) produced 78 findings + 7 from a coverage-debt
observer; conductor adjudicated into docs/plans/2026-07-16-basic-polish-fixes.md. The verdict:
rollout debt, not system debt — home/education read designed; everything else lacked the
shared vocabulary. FIVE FIX ROUNDS, all Sonnet implementers, each diff-reviewed, pushed,
CI-baseline-regenerated, and CI-verified green: c78b77d Batch 1 component vocabulary (inline
card arrows killing ~7 pages of stranded glyphs, accent-color, ::::table hardening
(right-align/nowrap/single row treatment/legacy-table parity), chip baselines, clause-boundary
truncation, :empty-driven Turnstile slots); 0225f6c Batch 2a join-funnel/forms/system (join
dues/fees/related/page-cta with the live membership-pricing islands nested in :::facts, form
container+placeholder unification, designed success surfaces on BOTH confirmation pages,
callout icon attr bug fixed — was declared-but-never-rendered); 4c79cdb Batch 2b
governance/storage/guides/news (5 legal-doc :::facts metadata, storage facts + NEW
:::availability directive reusing shipped chip CSS, club-boat-use/discord :::steps, dock-party
raw tables → ::::table, posts index 2-col topic grid by count, tag-archive header); fa46a15
Batch 3 composition (NMG de-carded via SECONDARY_PAGE_OVERRIDES template devices, event/class
meta strip → borderless facts anatomy + iconed calendar link, legal card-stacks flattened,
donate hero/width/pre-selected fireweed submit, home news image swapped per image-standard,
banner icon converged, members 2x2); 6cf8d36 finish round (FAVICON — traced from the club
mark, svg/ico/apple-touch, the site's single most-felt gap closed; one field-label idiom;
24px radios/44px rows; signup waiver border; inputmode=decimal; fees right-align; members
2-up extension; tap-highlight/optical-sizing/h4-balance one-liners) + a16e6ea conductor's own
conformance fix (class-fee button honors the ratified fireweed-for-money rule;
button.asc-cta-btn selector leg + shared disabled state). Simplifier 9a21ba3 (render-neutral,
proven by CI on unchanged baselines).

CLOSING GATE (fresh-context Opus, no builder context): ALL 18 PAGES READ "DESIGNED", dark
mode resolved, the full catalogue coverage table banked — the site clears Geoff's bar. Two
art-director calls made and logged in decisions.md for Geoff's veto: uppercase tracked field
labels as the one form idiom; fireweed-for-money / navy-for-utility as the submit rule.
SETTLE: 0486fe7 recovered ALL FOUR crashed audit ledgers verbatim from subagent transcripts
(docs/design-benchmark/audits-2026-07-15/), folded verdicts into ledger.md, corrected the
brief's stale known-open section, CLAUDE.md gains the baseline HOW (CI-canonical via the
ci.yml update_snapshots dispatch, never local --update-snapshots — the crashed session's
workstation-rendered PNGs had silently broken main's CI; runner regen healed it) and the
honest content-guide status (ASC has never authored one — AUTHORING IT IS AN OPEN ITEM).

GATE AT CLOSE: check 0/0 (857 files), 1268 unit tests, build green, final CI verification
green on runner-canonical baselines (393302b). FOR GEOFF: the before/after gallery
(polish-gallery.html, opened in your browser; before-captures archived in the session
scratchpad) — your read is the pass's last human step; the payments-smoke gate list below is
untouched and still first in your queue. DX HARVEST (for cairn, not yet filed there): (1)
directive parser breaks on a multi-fact ::::facts nested inside ::::page-cta (fence leak;
single-fact works) — probe-verified by the 2b implementer; (2) chassis prose.css lacked h4 in
its text-wrap:balance heading rule (fixed here, upstream candidate); (3) deriveExcerpt doesn't
strip ::: directive syntax — system pages need explicit description frontmatter or leak
literal directives into meta. BUDGET SCORING: ~3.3M subagent tokens across 13 dispatches + 1
workflow (10 agents) + 5 CI regen cycles; INTERACTION POINTS: 0 questions asked of Geoff
(7 unprompted steers received and executed); avoidable spend: byte-based runaway guards cried
wolf 5x on image-heavy transcripts (bytes overstate image token cost ~100x — future guards
should count tool rounds, not bytes). NEXT CANDIDATES: author docs/content-guide.md (the
family-standard file ASC never wrote); the ledger's remaining OPEN items (off-token component
spacing literals as a probe gate, scrollbar styling ruled skip); portal dark-mode round; the
TOC-rail pixel-rider gap (carried); cairn DX filings above.**

**PAYMENTS HARDENING EXECUTED AND RELEASED TO DEV (2026-07-15 overnight; pushed on Geoff's
explicit "make the accounting updates, then release"). Ran the hardening half of
docs/plans/2026-07-15-payments-live-smoke.md (Tasks 1-6 + conductor steps 1-2) per the go,
then RELEASED: the whole held stack (the 4 authoring-run commits + these 7 hardening commits +
the docs) pushed to main, which triggers deploy.yml → the asc-site DEV worker
(dev.aksailingclub.org), NOT the production apex (the apex cutover stays a separate deliberate
step). The release CLOSES the open-internet exposure the earlier entry flagged: Turnstile +
rate limits now run live on dev, where TURNSTILE_SECRET_KEY is set. CONDUCTOR-COST NOTE: the go
ruled this Opus-conducted, but it STARTED as Fable (75% weekly Fable already spent) and switched
to Opus 4.8 early at Geoff's prompt — flagged so the spend shows; a Fable-conducted execution
run against a finished plan was not the intended config. THE SEVEN HARDENING COMMITS: 56500fb
Turnstile on the five remaining public POSTs
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
- SMOKE MARKING: SETTLED (Geoff, 2026-07-15) — MEMO, no marker column. The shipped memo path
  (Task 4) is the final mechanism; migration 0027 is dropped. Rationale: the smoke is one-time, so
  a permanent typed column is over-engineering; `memo LIKE 'live-smoke%'` finds the row and the
  memo column is a legitimate free-text field, not a schema workaround. If a recurring/scheduled
  smoke is ever wanted, revisit the column then.
- HELD DECISIONS still open (spec §6), now TWO: smoke product ($1 donation default vs $100
  domain-unwind); dev-Access posture — the endpoints are now hardened and live on dev (deployed),
  but dev is still public, so the choice is whether to re-protect dev with Access before the
  cutover (re-protect-dev vs accept-public).
- STEPS IN ORDER (push DONE — dev deploy triggered): your before/after on the four changed public
  forms on dev → CONFIRM the deferred-widget fix in a REAL browser against the live secret (drive
  the signup enrolled + renew branches on dev, verify the Turnstile widget renders and injects
  cf-turnstile-response — this is the one verification a headless/dev-secretless run could not do,
  and payClassFee's correctness rides on it) → sandbox dry-smoke (spec §3, the FIRST-EVER
  webhook-reconcile execution, processed_stripe_sessions=0 live) → your go → key-swap per appendix
  A → live smoke → revert to sandbox keys.

PASS-END BUDGET SCORING (per the model-economy doctrine, recorded even where imperfect): ~1.2-1.5M
subagent tokens across 11 dispatches (3 implementers, 1 no-code investigation, 4 review lenses, 1
fix round, 1 simplifier), main-loop Opus/Fable additional. INTERACTION POINTS: 2 (Geoff's
model-switch offer + this release instruction) — zero correction-driven interactions; the pass ran
autonomously through the gates. AVOIDABLE SPEND, named: (1) the Task 1 implementer stalled in a
background-e2e loop and never committed, costing ~1 extra implementer run (~250k) before the main
loop took over its gate+commit; (2) the run's first phase was Fable-conducted before the Opus
switch. Net: interaction budget clean, token budget carried avoidable waste from the T1 loop.

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
