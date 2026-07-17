# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**IN FLIGHT: THE PORTAL REDESIGN PASS — branch `portal-redesign`, spec
docs/2026-07-16-portal-redesign-design.md + plan docs/plans/2026-07-16-portal-redesign.md
(Geoff-ratified from the mock-D probe arc; visual reference docs/design-benchmark/portal-mock-d/).
Round-1's settle batch landed and verified (980dd09); a stale runaway guard from that session
alarmed "idle 1557s" AFTER the job finished, not a real stall. LANDED THIS PASS (uncommitted on
the branch as of this writing): T1 portal-state.ts (pure four-way state machine + valueMirror, 17
tests) and T5a the member-session e2e mint helper + deterministic portal fixture. THREE MID-PASS
GEOFF RULINGS, all logged in docs/design-benchmark/decisions.md and the plan — read those, not
this summary: (1) THE GEAR DOOR — /my-account/gear becomes the gear home absorbing the asset
verbs (Release/Request/Cancel) mock D's reference-only rail gave no home; grounded in live data
(ZERO asset_requests ever filed, 40 assignments / 148 households), so a rare verb earns a door,
not landing real estate. Gear joins the doors row (spec amendment). (2) RECEIPTS REPOINT AT THE
LEDGER — listReceipts' memberships/asset_payments union went stale when 0021_money_ledger landed;
143 class-fee lines + 5 donations are invisible to the members who paid them. NOT a schema change;
adding class-fee payment columns would duplicate the ledger and BE the write-around. Must REPLACE
the union (217 dues lines overlap 235 paid memberships; a combined read double-counts) and the
units change (cents, not dollars). (3) RELEASE GETS A TWO-STEP CONFIRM — it gives up a scarce
resource with a waitlist behind it, no undo, admin-only recovery, and shipped as one tap beside
Pay. ALSO RULED (Geoff, live): the old "full-bleed bands are HOME-ONLY, no per-page exception"
rule is reframed to "considered and justified" — decisions.md carries the standard WITH the worked
examples in both directions (home yes, portal yes, education still no), since a bright line
carries information a bare judgment standard loses. Task order: T1 ✓, T5a ✓, T1b (receipts, in
flight) → T2 (desktop landing) → T2b (gear door) → T3 (mobile) → T4 (child riders) → T5 (visual
spec + CI baselines) → T6 (review fan-out, gate, push). Baselines regen ONLY via the ci.yml
update_snapshots dispatch. Geoff's before/after against mock D still gates the apex.
Still awaiting Geoff verdicts (arc log): racing passage treatment, class-door template line.
QUEUED BEHIND IT (ROADMAP, Geoff 2026-07-16): the events-redesign initiative (from-scratch,
FUNCTIONAL brainstorm first, own template licensed) and the member-directory initiative
(number-one member-requested feature, full brainstorm + pass) — both open INTERACTIVE with
Geoff, fresh sessions, probe-iteration process governing the design work.**

**ROUNDS 2-3 LANDED + THE PROCESS SHIFT TO PROBE ITERATION (2026-07-16 day, same session
continuing the arc below on Geoff's live notes). ROUND 2 (Geoff's five gallery notes, ruled
whole): the CARD FAMILY REDESIGNED (239b995/820fa64 — hanging icon column, count-aware
lattices asc-cards-1..6 with one shared row height, single cards as full-measure row-cards,
the members/two-up patch devices retired; then e80f73b moved the lattices to CONTAINER
QUERIES after a verify lens caught the viewport-breakpoint root cause squeezing the NMG
panel); the FORM LABEL REGISTER split two-level (uppercase tracked eyebrows for group/section
titles, sentence-case 600 dark for field labels — Geoff overruled the one-idiom call;
decisions.md updated); HEADING RHYTHM fixed at the real root cause (a Svelte scope-hash
specificity loss, NMG 56px→13.44px measured, education pixel-identical). ROUND 3 (the
five-template first pass Geoff ordered before receiving exemplars; adjudicated from a
7-agent workflow wf_2dd7fd6d-362 incl. the PORTAL'S FIRST-EVER SIGNED-IN AUDIT via a seeded
local session): 3A component contracts (e80f73b — also scoped down Batch 1's over-broad
table nowrap that clipped racing's gear table, and fixed the availability note's invalid
nested-<p> hoisting); 3B+3C combined (5917d99 — class-door recomposed: eyebrow title, facts
meta, availability chip, outcome panels off daisyUI tints, :has(iframe) Turnstile collapse;
utility-leaf converged: multi-row facts, related closers; news-post head/tail designed:
News back-link, lede, LINKED tag chips, prev/next via the engine's own site.adjacent(),
More-news; racing: page-cta closer, nested-h3 TOC via NESTED_TOC_SLUGS, caption echo → new
gated ariaLabel table attribute); 3D portal (ba39fc3 — shared .portal-field-label, one
assets-row grammar with chips + tabular fees, one date formatter in member-auth/lib/format.ts,
.portal-quiet-action on row actions, deliberate card-vs-flat grouping). Every batch
CI-baseline-regenerated and VERIFY GREEN. PROCESS RULED BY GEOFF (banked in memory
feedback_probe_iteration_process + the design-refinement skill, dotfiles 21d9129, verified by
scenario test): design iteration now runs ASYNC PROBE PAGES he verdicts (the cairn-admin
process) — "we're only running the deep and expensive full rebuild a minimum number of
times"; the batch pipeline is for ratified mechanical rollout only. FOR GEOFF: probes-index
.html (opened in your browser; session scratchpad probes/) — five template probe pages, each
first-pass before/after + captioned candidates awaiting verdicts: racing's three season-event
passage treatments (A eyebrow / B navy rule / C gold tick / none), the post-hero width A/B,
the waitlists spec-sheet-vs-status-index fork (B is a real token-built mock), class-door and
portal whole-template verdicts. DEFERRED to the interactive rounds: racing's lower-two-thirds
pacing beats, the northern-lights PDF asset (never migrated from legacy — needs re-locating
before a download slot is worth building). BUDGET rounds 2-3: ~2.3M subagent tokens (2
implementer rounds + 1 workflow of 7 + 3A/3BC/3D + probe builder + skill verify); 0 questions
asked (6 unprompted steers executed). The overnight arc entry is in docs/status-archive.md.**

**PAYMENTS SMOKE — STILL WAITING ON GEOFF (unchanged since 2026-07-15; full entry
in docs/status-archive.md, canonical steps in docs/plans/2026-07-15-payments-live-smoke.md +
docs/2026-07-15-payments-live-smoke-design.md appendix A):** the hardening is released to dev;
his queue, in order: before/after on the four changed public forms; REAL-browser confirm of the
signup deferred-widget Turnstile fix against the live secret (payClassFee rides on it); the
sandbox dry-smoke (first-ever webhook reconcile); his go; key-swap per appendix A; live smoke
(memo `live-smoke 2026-07-XX`; the refund memo needs a direct executeRefund call, the desk UI
has no memo field); revert to sandbox keys. HELD DECISIONS (spec section 6): smoke product ($1
donation default vs $100 domain-unwind); dev-Access posture (dev is public — re-protect vs
accept). Also queued: the five-stop dev walkthrough; the 07-15 apology-send verification.**
