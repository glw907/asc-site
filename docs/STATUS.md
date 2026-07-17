# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**NEXT INITIATIVE: THE FRAGMENTS MIGRATION & DX/CONTRACT HARVEST (Geoff, 2026-07-16; ROADMAP
`fragments-migration`). FRESH SESSION, FABLE-CONDUCTED PLANNING (Geoff's own call).** Migrate
repeated content onto cairn's Fragments (shipped in 0.87.0) and use the pass to harvest cairn DX and
site-contract FAILURES, not just consume the feature. Pre-baked so the planning session starts
grounded, all verified 2026-07-17 rather than assumed:
- **The bump is deliberate**: the site pins `^0.86.0` and a 0.x caret EXCLUDES higher minors, so
  nothing arrives until someone bumps to `^0.87.0`. Latest published is 0.87.0.
- **Fragments**: reserved `fragments` concept key (requires `routing: 'embedded'`),
  `::include{fragment="<id>"}` block splice, editor picker, rename rewrites inbound includes, an
  "Included in" consumer list, no public URL (its permalink 404s).
- **0.87.0's other change and its consumer action**: `routing: 'embedded'` is now GENUINELY
  non-routable. CHECKED: ASC's only embedded concept is `notifications` (home-banner data, no URL),
  so the bump looks SAFE on that axis. The stale memory that made it look breaking is corrected --
  payment confirmation and class-registration-complete live in the PAGES concept
  (`/confirmation`, `/class-registration-complete`) and their old public URLs resolve via
  `$theme/redirects.ts`, verified on dev (307 -> 301 -> 200, `?session_id=` survives).
- **THE SURVEY ALREADY EXISTS -- do not re-survey**: `docs/fragment-candidates.md` (Geoff started
  it 2026-07-15; the 2026-07-15 pass has fed it since under a standing "duplicate freely, log the
  duplicate" policy). NINE ready cases, each with its location, likely fragment shape, and the
  CANONICAL WORDING that pass already converged the duplicates onto to make extraction mechanical.
  Its header names this pass as its consumer ("a future content-consolidation pass converts this
  list and deletes it"). cairn-cms's STATUS tracks the same work from the other side. First task is
  VERIFY AND EXTEND that list, not a fresh grep. A candidate with one real consumer gets dropped,
  not converted.
- **navLayout rides along** (cairn-cms's STATUS: "navLayout addition + content migration there"),
  which touches the `admin-roles` / `admin-nav-reorg` initiatives -- check their sequencing at the
  brainstorm rather than assuming this pass owns it.
- **The harvest is SCOPED TO FRAGMENTS** (Geoff, 2026-07-17): log the DX and site-contract
  deficiencies and improvement opportunities ASSOCIATED WITH THE FRAGMENTS CAPABILITY, not a general
  audit. This is fragments' first real consumer test outside cairn's own showcase, from both seats:
  DEVELOPER (the reserved concept, the `routing: 'embedded'` requirement, the bump, what the
  contract does not enforce) and EDITOR (the "Include a fragment" picker, the block splice in
  preview, the "Included in" list, what rename rewrites, a published consumer whose fragment is
  not). Findings go to `~/Projects/cairn-cms/docs/internal/docs-friction-log.md` with a perspective
  tag (`developer`|`editor`|`maintainer`|`operator`); that log was CLEARED at the 0.87.0 cut, so
  these are its first entries. Discharges the standing DX-harvest mandate for this surface.
- **The question to hunt**, earned from the portal pass: not "does the API work" but "WHERE CAN A
  CONSUMER BE GREEN AND WRONG". That pass's ratified probe depicted impossible data four ways, its
  fixtures reproduced the fiction so the baseline hid the defect, and ci.yml's dispatch reported
  success while doing nothing. All green on check/test/build. The fragments analogue: a docs promise
  nothing enforces, a way to hold the concept wrong silently, an include resolving to nothing.

**PORTAL REDESIGN PASS: SHIPPED TO DEV 2026-07-17 (merge 510b266, PR #1). AWAITING GEOFF'S
BEFORE/AFTER against mock D — that gate is the apex's, not dev's; dev is live now.** Spec
docs/2026-07-16-portal-redesign-design.md + plan docs/plans/2026-07-16-portal-redesign.md,
visual reference docs/design-benchmark/portal-mock-d/. The landing rebuilt to mock D across all
four states (needs-you / all-clear / off-season / renewal), mobile composed as its own screen
(the action row's stacked anatomy fixes the mid-phrase wrap Geoff named on the probe), plus TWO
NEW DOORS the ratified mock left no home for and RECEIPTS REPOINTED AT THE LEDGER. Four Geoff
rulings taken live mid-pass, all logged with their grounding in docs/design-benchmark/decisions.md
(read those, never this summary): the gear door, the renewal door, Release's two-step confirm, and
the full-bleed rule reframed from "HOME-ONLY, no exception" to "considered and justified" (with
worked examples both ways, since a bright line carries information a bare standard loses).

ELEVEN DEFECTS FIXED ON THE WAY PAST, every one green on check/test/build. The adversarial review
gate (16 findings survived refutation) caught three BLOCKERS: the Pay button silently dead (the
landing never destructured `form`), portal body ink at 1.07:1 in dark mode, and the all-clear
moment rendering under the renewal CTA. The conductor's own render read caught three more: the
masthead band ignoring the dark theme (it reached for fixed --color-sage where the site bands with
--color-base-200 — identical in light, broken in dark), Sign out stranded at left=283 against
everything else's left=80, and money dropping a trailing zero ("$247.5"). One member-facing money
formatter now serves the whole portal.

THE PATTERN WORTH CARRYING FORWARD (four instances, one root): THE RATIFIED MOCK DEPICTED DATA THE
SYSTEM CANNOT PRODUCE, because a probe agent built the reference without querying the database or
the dark theme. Mock D showed a class-fee receipt the schema could not express, slot identifiers
("B-Dock slip 12") that do not exist (all 40 live assignments carry free text about the member's
BOAT: "Sailboat", "BUCC", 'Purple Buccaneer 18 "Dionysus"'), a "Gear locker" asset type the club
does not have, and a light-only palette. THE FIXTURES THEN REPRODUCED THE FICTION, so the baseline
looked right while production would have rendered gibberish — verification concealing the defect it
exists to catch. BINDING ON THE EVENTS-REDESIGN AND MEMBER-DIRECTORY PROBE ARCS: ground a probe
against real rows and both themes BEFORE ratifying it, or the ratification bakes in fiction.

ALSO FIXED, INFRASTRUCTURE: ci.yml's update_snapshots dispatch hardcoded e2e/site-visual.spec.ts
and its snapshot dir, so it SILENTLY DID NOTHING for the portal's new spec and reported success
(1912cf8 + the commit before it; both steps are now spec-agnostic, and the staging glob must be
shell-expanded — git's own pathspec globbing does not match UNTRACKED dirs, which is exactly what a
new spec's baselines are). Note for any future visual spec: PLAYWRIGHT WRITES MISSING SNAPSHOTS ON
FIRST RUN BY DEFAULT, no --update-snapshots needed — a local run mints workstation baselines that
break CI if committed. The repo rule ("never a local --update-snapshots run") is true but
incomplete. Baselines for the portal are CI-minted (a2f3198); site-visual's came back UNCHANGED,
proving the rebuild shifted no other page.

LIVE DEFECT THIS FIXES FOR REAL MEMBERS: receipts read the money ledger (migration 0021) instead of
a stale two-table union whose premise went out of date the day 0021 landed. 143 class-fee payments
and 5 donations were invisible to the members who made them. NOT a schema change; the canonical
store already existed and every write path already fed it.

OPEN / CARRY-FORWARD: Geoff's before/after against mock D (four states rendered light+dark at
390/1440 available on request). Backlog-worthy, none blocking: the portal's 44px touch-target floor
is unmet sitewide (row actions ship at .btn-sm/32px, "Manage gear & moorings" at 17px) — a
PRE-EXISTING gap this pass did not introduce and deliberately did not widen; the desktop landing
shows a tall whitespace void when the main column is short and the rail is not; the landing renders
two h1s (one display:none, benign for AT) as the cost of the not-a-collapse dual composition.

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
