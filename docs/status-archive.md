# asc-site status archive

> Superseded STATUS entries, newest first, moved here by the rolling-status trim (see
> STATUS.md's preamble). History only: nothing here is a live instruction, and entries
> reflect what was true when written. The live rolling status is docs/STATUS.md.

**[Superseded 2026-07-18: the pass executed to completion — see STATUS.] ROLES & COMMITTEES
BRAINSTORM: DONE 2026-07-17 (Fable-conducted).** Spec docs/2026-07-17-roles-committees-design.md
committed and Geoff-approved; SUPERSEDES the directory spec's decision 6 (flat member_roles —
never built); directory plan reshaped IN PLACE. The model: `committees` (kind
standing|established, archive-not-delete), `committee_members` (chair|co-chair|member +
pending|active; UNIQUE pair), `member_positions` (kind officer|director|appointed —
authorization hangs off kind, never title strings). Ratified: request-then-approve joining
(chair notified via job-runner; decline/leave delete the row); chairs manage their roster;
board (kind officer/director) appoints chairs and manages the committee list; site admin
everything; rosters show every active member's NAME regardless of directory_visibility;
chair titles DERIVE at render. Sitting score: 4 interaction points.

**[Superseded 2026-07-18 by the directory pass finish — the /members before/after and the
unfiled harvest staging remain open, tracked in STATUS pointers.] FRAGMENTS MIGRATION &
DX/CONTRACT HARVEST: SHIPPED TO DEV 2026-07-17 (PR #2, Opus-conducted).** The site runs cairn
^0.87.0 with the fragments concept live. Open at archive time: Geoff's before/after on the one
class-b page (/members); the harvest DRAFTED BUT UNFILED (staged in
docs/2026-07-17-fragments-harvest-findings.md; paste into cairn-cms's friction log once its
live branch merges, then delete the staging file). The editor seat (E1-E8) is UNPROBED — runs
when ASC moves to ^0.88.0. Full entry with probe findings and pinned-test inventory further
down this archive.

**[Superseded 2026-07-17 by the roles & committees sitting; the brainstorm ran and the pass
resumed — see STATUS.] IMMEDIATE NEXT ACTION (Geoff, 2026-07-17): OPEN THE ROLES & COMMITTEES
BRAINSTORM, FABLE-CONDUCTED, IN A FRESH SESSION.** The member-directory pass T0 surfaced that
"roles" is really a structured roles-and-committees model (per-committee chairs, notable
committee membership, member self-service + admin management, and a member-facing committees
surface). Geoff called for a Fable brainstorm. Run `superpowers:brainstorming` from the seed
docs/2026-07-17-roles-committees-brainstorm-seed.md.

**[Superseded 2026-07-17: the model landed as docs/2026-07-17-roles-committees-design.md and
the plan was reshaped in place.] THE `member-directory` PASS IS PAUSED MID-T0 (2026-07-17,
Opus).** The T0 composition probe is BUILT and delivered from real asc-club rows — a
hairline-separated de-carded list, person-first entries, contained reading width
(masthead/rail unborrowed), one smart search across name + boat + role, three chips, mobile as
its own composition with 44px tappable contact. Probe lives in the session scratchpad (real
member names never land in git); arc log
docs/design-benchmark/member-directory-round-1-arc.md. AWAITING Geoff's visual verdict on the
non-roles parts (entry anatomy, header, mobile). The build (T1+) waits on the brainstorm,
since plan T1/T5/T6 all depend on the roles/committees model. Real-data note: NO role or
committee data exists anywhere (empty class_instructors, only Geoff in the auth editor table)
— the first seed is Geoff-supplied.

**DIRECTORY + WAIVERS BRAINSTORM SITTING: DONE 2026-07-17 (Fable-conducted). Both specs and
both plans are committed and Geoff-approved; the queue's next two passes are fully
specified.** Directory: docs/2026-07-17-member-directory-design.md + its plan (8 ratified
decisions: person-first entries, one smart search + chips, household-owned boats with a
kept_on trailer/mooring field replacing any holdings display since moorings are unlabeled,
admin-maintained many-per-member roles with specific titles, the one privacy dial extended
so partial shows everything but contact, current+grace listing; fleet view and photos
deliberately deferred). Waivers: docs/2026-07-17-member-waivers-design.md + its plan (9
ratified decisions; governing principle verbatim: "as light as it can be while still being
legally sound and protecting the club"). THREE research reports are distilled into that
spec's appendices — e-signature validity (typed-name + magic-link + snapshot/hash EXCEEDS
Alaska UETA floors; the risk lives in document TEXT, hence the Donahue six-factor pre-publish
gate, cold-water immersion named explicitly), stored-property liability (a dedicated BILATERAL
STORAGE AGREEMENT is warranted — Alaska is the last state with no self-storage lien law, so
lien/abandonment authority must be contractual; no-bailment posture keeps the burden of proof
on the claimant), and the peer-club document inventory (Appendix C, 14 documents mapped to
signing moments — the board-packet artifact the attorney verifies for completeness).
EXECUTION SHAPE (Geoff's three-unit ruling): Opus directory pass → Fable waivers sitting
(drafts + signing UX) → Opus waivers build. LOAD-BEARING FACTS RATIFIED IN-SITTING: the club
owns mooring tackle UP TO THE BALL, member owns beyond it, and the documents ASSUME club gear
can fail (no inspection language in any release — that is a Donahue safety representation);
the Mat-Su Borough 72-hour RV relocation covenant + annual contact-info confirm flow down
from MSB006789 (published on the site) and the already-signed Trailer Row Use Guidelines
absorb into the system; class participation rides the general release (decision 9), so class
signup gets LIGHTER than today; race entries stay separate BY RULE (RRS 82). Attorney remains
the gate before any document publishes for real signing.

**FRAGMENTS MIGRATION & DX/CONTRACT HARVEST: SHIPPED TO DEV 2026-07-17 (PR #2, Opus-conducted;
full findings entry).** Spec docs/2026-07-17-fragments-migration-design.md (its "Resolved
verdicts" section is canonical; the provisional table above it is kept only to show what
verification overturned) + plan docs/plans/2026-07-17-fragments-migration.md + the stage-runner
workflow script beside it. THE HUNT PAID, AND ITS FINDINGS ARE NOW PINNED IN CODE. Three of
seven developer probes found a green-and-wrong state, two of them blockers, all invisible to
check/test/build: (P2) omit the one-line `resolveFragment` forward and every `::include`
renders its own raw source text to the public page, because the unresolved directive falls
through to the same code path that restores an accidental prose colon ("4:00") to literal
text; (P4) the changelog's promised build failure on a dangling include DOES NOT HOLD HERE —
svelte.config.js's `prerender.handleHttpError: 'warn'` (set to tolerate pre-existing dead
links) downgrades the 500 to a warning, so a typo'd fragment id would 500 for real members
with CI green; (P3) drop the manifest glob and the admin picker and rename/delete guards go
blind to a fragment the public build serves happily. All three are now guarded by
src/tests/fragment-integrity.test.ts, each assertion proven to FAIL when its defect is
reintroduced. P6 confirmed the permalink 404s and stays out of sitemap/feeds as promised.
THE BLOCKS-ONLY BAR REJECTED ALMOST EVERYTHING, WHICH IS THE BAR WORKING: 1 convert of 9, 8
drops, their facts pinned by src/tests/content-agreement.test.ts (7 assertions, proven
meaningful by breaking one and watching it fail). `who-to-ask` extracted with two class-a
consumers (visiting-the-club, club-boat-use-and-qualification) PROVEN BYTE-IDENTICAL in
prerendered HTML, plus one class-b (members.md, which also fixes a live "Something broken"
drift). Club address FLIPPED convert→drop: the two blocks differ in label, body, and shape,
and Visiting's body says "See Contact for a map link", nonsense rendered on Contact. NOTE FOR
ANY FUTURE PASS: THE SURVEY'S CONSUMER LIST WAS WRONG IN BOTH DIRECTIONS — two of the three
pages the spec named for who-to-ask do not carry the block, and two it never named do. Trust
the files, never the survey. CARRY-FORWARDS: the editor seat (E1-E8) is UNPROBED, NOT CLEAN —
cairn's unreleased invisible-craft branch rebuilds exactly those surfaces, so probing 0.87.0
would harvest friction 0.88.0 already fixed; it runs when ASC moves to ^0.88.0, gated behind
`{stage:'probes', editor:true}`. The harvest is staged in
docs/2026-07-17-fragments-harvest-findings.md, NOT filed: cairn-cms sat on a live session's
branch at close; paste it into that repo's friction log once that branch merges, then delete
the staging file. Also: 0.87.0 silently re-derives every excerpt (it strips directive
markers), so the bump makes any 0.86.x manifest stale and fails the build unannounced — on
the way past it fixed a live defect, since /contact and /directory carry no explicit
description and had been shipping raw `:::contact-form` markup as their meta descriptions.
FOUND WHILE SURVEYING, NOT FIXED (member-facing, Geoff's call, detail in the spec):
seasonal-storage.md drops a qualifying clause from the Active Participating Member
definition; education.md hardcodes membership prices that join.md sources live from a
directive; the racing boilerplate across regatta posts is the one genuinely new fragment
candidate.

**PAYMENTS SMOKE — STILL WAITING ON GEOFF (unchanged since 2026-07-15; canonical steps in
docs/plans/2026-07-15-payments-live-smoke.md + docs/2026-07-15-payments-live-smoke-design.md
appendix A):** the hardening is released to dev; his queue, in order: before/after on the four
changed public forms; REAL-browser confirm of the signup deferred-widget Turnstile fix against
the live secret (payClassFee rides on it); the sandbox dry-smoke (first-ever webhook
reconcile); his go; key-swap per appendix A; live smoke (memo `live-smoke 2026-07-XX`; the
refund memo needs a direct executeRefund call, the desk UI has no memo field); revert to
sandbox keys. HELD DECISIONS (spec section 6): smoke product ($1 donation default vs $100
domain-unwind); dev-Access posture (dev is public — re-protect vs accept). Also queued: the
five-stop dev walkthrough; the 07-15 apology-send verification.

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
asked (6 unprompted steers executed). The overnight arc entry is below.**

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

**SHARED-COMPONENTS PASS BUILT AND PUSHED (2026-07-15 day, Fable-conducted design review +
same-session execution on Geoff's "proceed on all fronts"). The review read the dev site
(15 full-page captures, 4 read by the conductor, 11 by an Opus observation agent) against a
component inventory and found one dominant defect: structured facts wearing bold-label prose,
plus ad hoc cross-references and bespoke page closers on every page. THE SHIPPED VOCABULARY
(all in src/theme/markdown/components.ts + asc-components.css, registry-native, tokens only):
`:::facts` (semantic dl label/value rows, no card chrome), `:::related` (rule + eyebrow
cross-reference lines) and `:::page-cta` (the one sitewide closer; a primary action spends the
fireweed budget through .asc-cta-btn — conductor fix 28d5b7c after the chassis .cta-primary
rendered navy), `:::steps` (CSS-counter number rail, role=list/listitem for WebKit),
`::::table{variant="results|fees|gear"}` (figure + caption/legend slots, aria-labelledby/
describedby wiring, tabular numerals; legends finally attach to the recap posts' scoring keys),
unified category/availability chips (home's C7 dot/star vocabulary on Events + ClassSchedule +
event detail; availability is a separate neutral outline chip), and a `requirement` callout
tone. BUGS KILLED: join's literal ::membership-pricing text (ROOT CAUSE IS CAIRN'S OWN:
the engine's insertTemplate for zero-slot inline use is invalid single-line directive syntax,
and hydrate:true islands can never sit mid-sentence — div wrapper; DX harvest), post deck
duplication (every post description is a Hugo auto-summary prefix; descriptions are now
meta-only for posts), the "News — 0 posts" dead card (grid AND stat now count browsable
topics), events mid-word truncation. SIX EXEMPLAR PAGES retrofitted (moorings, visiting,
join, NMG closing sections, education closer, northern-lights recap); the full site-wide
consolidation is deliberately a later content pass. FRAGMENTS POLICY (Geoff, 2026-07-15):
the next cairn release adds a "fragments" concept; until it lands we duplicate freely,
converge duplicated wording gently toward fragment-ready canonical forms, and log everything
in docs/fragment-candidates.md (9 entries seeded with canonical wordings). GATE AT CLOSE:
check 0/0 (854 files), 1259 unit tests, build green, e2e 33/33 twice (baselines regenerated
once for chips/closer/truncation: events x5 viewports, class detail, event detail, education).
Conductor render reads: all six retrofit pages + events + posts at 390/1440, dark-mode spot
checks, zoomed crops for the step rail and education's restored fireweed closer. REVIEW GATE:
svelte-reviewer and daisyui-a11y both no-blockers; the fix round (558b72f) landed the two a11y
warnings (WebKit list-role strip, table caption/legend association), the arrow-in-accessible-
name and chip-edge suggestions, the dead topics payload, and blessed multi-table grouping in
the table doc. Plan: docs/plans/2026-07-15-shared-components.md (T0 also fixed the e2e
warm-replica FK gap and moved Playwright to dedicated port 4179 — both infra follow-ups from
the payments entry, now DONE). FOR GEOFF: before/after review of the six retrofit pages +
events on dev when convenient (the smoke's own gate list below is untouched and still first);
the "before" captures are archived in this session's scratchpad. BUDGET: ~1.75M subagent
tokens across 13 dispatches (7 implementers, 1 simplifier, 2 reviewers, 1 fix round, 2
review-phase observers); ZERO questions asked of Geoff mid-pass (4 unprompted steers received:
skill routing, Fable economy, fragments x2). NEXT CANDIDATES: the content-consolidation pass
once cairn fragments ship; the event-detail page's remaining older styling; NMG full
de-carding; education pacing (existing backlog). POST-RELEASE FIX (a7c5cae, Geoff-caught on
dev): the pass's :not(.cta-link) specificity bump made the unlayered prose-link rule beat
every TOC variant's matched-weight override — doubled underline on the rail. Root-cause fix,
not a weight bump: TOC furniture stamps `not-prose-links` and the site.css rule excludes that
subtree (contract over arms race; the loose `not-prose` marker was NOT reused — it wraps real
prose links). Side effect, deliberate: the mobile boxed .toc's links drop their underline,
joining every other TOC variant's quiet idiom. e2e re-ran 33/33, no baseline churn (the rail
sits outside the education test's frame — noting the pixel suite has NO viewport that shows
the TOC rail, which is how the regression escaped it; candidate rider for a future pass).**

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

**INITIATIVE 5 (admin-roles + admin-nav-reorg) EXECUTED, CLOSED, AND LIVE ON DEV
(2026-07-15 early, the session that watched 0.86.0 land and ran the whole pass on
Geoff's "full implementation and publish with a workflow" ruling). Bump ^0.84.4 →
^0.86.0 (6af3110, mechanical fallout only); spec
docs/2026-07-14-admin-roles-navlayout-design.md (9e88752, brainstormed live: one
initiative two phases, the split-desk tree ratified from three candidates); plan
docs/plans/2026-07-14-admin-roles-navlayout.md (e45a4e2). Executed by workflow
wf_77a5e053 (5 sequential Sonnet implementer tasks + 3 prose review lenses, ~735k
subagent tokens, 0 agent errors) + a 5-item fix round (~101k) + simplifier (~200k).
Commits 0e3c5fc..0a329b3. WHAT LANDED: defineRoles vocabulary
(owner/club-admin/instructor; instructor declares NO home until class-management) +
the CairnRolesRegister augmentation; the club gate collapsed onto the typed session
(layout guard + clubAdminAction read editor.role/capability, zero D1 role reads; the
shared CLUB_ROLES pair lives in club-db.ts beside resolveClubDb); Settings grant/revoke
retired for ManageEditors; the split-desk navLayout tree (Club/Outreach/Boats &
Gear/Content/Site — including the nav screen the spec wrongly said didn't exist);
club-roles.ts deleted (engine's atomic last-owner guard is now the only one);
migration 0026. THE REVIEW HIGH THAT MATTERED (auth lens): createAuthGuard() was
constructed WITHOUT the vocabulary, so a real club-admin would have resolved to none
capability at first grant — fixed in fc0865c with a module-mock regression test.
Deployed manually (version bffd4249), smoke green. LIVE MIGRATIONS APPLIED AND
VERIFIED in the safe order: cairn's 0001_roles.sql on cairn-asc-auth (CHECK lifted,
club-admin insert/delete round-trip proven, both owner rows intact), then — only after
the new deploy verified serving — 0026 on asc-club (club_roles GONE, sqlite_master
proof). Render read via minted session: the live sidebar renders the ratified tree
exactly, owner lands on Posts. SESSION-MINT RECIPE CORRECTIONS (supersedes the
initiative-4 note): on https the cookie is __Host-cairn_session (bare cairn_session is
local-http only) and session.expires_at is MILLISECONDS. cairn-doctor: 12 pass
including both role checks; the 2 zone-read FAILs (Always-Use-HTTPS/HSTS reads 403d)
deferred to the mw-cutover runbook's zone-posture step. DX HARVEST for cairn (per the
standing mandate, now in project memory): (1) the npm package ships NO migrations/
directory (files=[dist,CHANGELOG]) — a consumer cannot apply 0001_roles.sql without a
repo checkout; (2) the vocabulary must be wired TWICE (adapter roles + createAuthGuard
opts) and missing the guard fails silently while all rows are owner — wants a doctor
check or single-source wiring; (3) the session-mint gotchas above; (4) positive:
defineRoles/CairnRolesRegister/navLayout/resolveNavLayout all typed clean first-try
per their guides. Spec-authoring lesson (mine): the "no navMenu" claim was wrong —
verify adapter-config claims, don't reason from memory. SETTLE-IN-ADVANCE RULINGS all
recorded on ROADMAP entries (797c163 + follow-ups): payments smoke = real charge
refunded through the ledger path, Turnstile on every public unauth POST; cutover = two
weeks quiet; season-rollover = board-run guarded admin op (INTERACTIVE brainstorm, not
overnight); class-management frame settled (all four capabilities v1, instructor
check-in writes, club-admin audited refunds PER THE ASC REFUND POLICY — the spec reads
the club's real policy, never invents; 2027 readiness) with the design brainstorm
INTERACTIVE per Geoff ("especially the class stuff"). QUEUED at the time: Geoff's dev
walkthrough, now FIVE stops (Members, household desk, Money & Renewals, Compose with the
announce grace widening, and the NEW SIDEBAR + ManageEditors as the one role screen); the
07-15 apology-send verification (check the JSONL beside
~/.local/asc-data/send-apology-2026-07-15.mjs if that session died).**

**SESSION 5 CLOSED PRE-BRAINSTORM (2026-07-14 night, deliberate clear on Geoff's call —
the session ran long and noisy: the cairn double-execution below, the calendar fix, the
docs archival). NEXT SESSION = INITIATIVE 5 EXECUTION, fresh context, launch in THIS
repo. Resume prompt: "Start initiative 5 (admin-roles + admin-nav-reorg): verify cairn
0.86.0 is on the registry (npm view @glw907/cairn-cms version — Geoff's other session
was cutting it at close), bump ^0.84.4 → ^0.86.0, then brainstorm the club_roles
collapse + sidebar arrangement. Read docs/STATUS.md, ROADMAP's admin-roles +
admin-nav-reorg entries, docs/2026-07-13-cairn-editor-roles-consumer-brief.md, and
cairn's docs/guides/organize-your-admin-nav.md + docs/reference/core.md#roles first."
The collapse surface and seam facts are in the entry below; the ledgered rulings from
this session (Fable-window spec queue, design-session series + page-confirmation ledger,
opportunistic template migration, mw-cutover in-window-if-budget) are on ROADMAP entries.
Session riders landed: the calendar season-filter fix (live on dev, verified), STATUS
archived to docs/status-archive.md with the trim rule in the preamble, the global
CLAUDE.md compressed ~25%, the one-executor-per-worktree rule globalized. Geoff's dev
walkthrough (four screens) and the 07-15 apology-send verification remain queued.**

**PRIOR: INITIATIVE 5 (admin-roles) OPENS ON CAIRN SEQUENCING (2026-07-14, Geoff's calls at
the session-5 open). The conflict found at open: cairn's STATUS (committed 16:33) ratified
an admin NAV-LAYOUT pass shipping as 0.86.0 with explicit sequencing — "the ASC session
waits for this cut so it bumps ONCE for roles + navLayout together" — while this file's
prior entry (16:47, written without that ruling) said bump ^0.85.0 now. Geoff ruled: the
cairn nav-layout pass runs first, and then directed THIS session to execute it by
workflow and proceed to the 0.86.0 release (superseding the fresh-cairn-session note;
the plan is committed in cairn at 7eac1007). The
navLayout seam is squarely inside initiative 5's surface — ASC's `filterClubNav` (wired as
the engine `navFilter` in src/chassis/cairn.server.ts) collapses to a declarative
`roles: ['owner', 'club-admin']` on the Club section — so the bump-once ruling stands.
AFTER 0.86.0 SHIPS: resume initiative 5 in a fresh ASC session — bump ^0.84.4 → ^0.86.0,
then brainstorm the collapse against BOTH shipped seams (roles + navLayout). Contract:
docs/2026-07-13-cairn-editor-roles-consumer-brief.md (0.85.0 answered its seam question —
a `none` session stays authenticated, carries typed `locals.editor`, and passes through
CairnAdminShell untouched; plus bootstrapOwner, per-role `home`, migration 0001_roles.sql,
cairn-doctor role checks). The collapse surface, verified this session: club_roles
(migration 0001_substrate), src/admin-club/lib/club-roles.ts (incl. the atomic last-owner
guard), club-action.ts's role gate, the /admin/club layout guard, the Settings
grant/revoke actions, and filterClubNav. ROADMAP's admin-roles entry updated to match.
BUG FIXED AND ON DEV (same session; commits bb1a98f + 491769f simplifier consolidation,
deployed version b187f391, verified live: zero Teen-Intro/Intro-to-Sailing/Intermediate
leaks on /events and home, 2026 classes render, home 200). Original log follows: the
calendar shows duplicate and wrong-dated class entries since the MW import. One root
cause, two symptoms: `src/theme/season-data.ts` (~line 114, home Season band) and
`src/theme/events-data.ts` (~line 93, the /events listing) both query
`FROM classes WHERE visible = 1` with NO season filter — latent while every class row
was season 2026, exposed when the import minted the 10 historical 2024/2025 instances
(all visible=1; verified live: 5 rows per season 2024/2025/2026). The historical
instances leak into the current calendar's month buckets, reading as doubles and as
wrong-dated entries (Geoff's "1st intro wasn't July 11" = the 2024 instance's real
2024-07-11 date beside the real 2026-06-18 class). The education class-schedule island
is NOT affected (class-schedule.remote.ts already filters `season = ?1` off settings
current_season — the pattern the fix should reuse). Fix shape: season-filter the class
arm of both modules keyed on current_season, + a regression test with multi-season
fixture rows. Small, well-specified; should land before Geoff's dev walkthrough.
THE FABLE-WINDOW SPEC QUEUE (Geoff, 2026-07-14, same session): while the Fable window
holds (~07-19, verify before relying), bank the judgment layer of the remaining
program as SPEC-ONLY initiatives — Fable authors the brainstorm/spec/plan in-window,
Opus conducts execution post-window. Queued in order after initiative 5 (+ the new
admin-nav-reorg entry, which rides it): payments-live-smoke spec, the mw-cutover
runbook, the season-rollover one-operation design, the class-management spec (after
admin-roles lands its instructor role). Each ruling is recorded on its ROADMAP entry;
admin-roles + admin-nav-reorg execute fully in-window (auth- and taste-critical).**

**THE CAIRN NAV-LAYOUT DOUBLE-EXECUTION (2026-07-14 evening, recorded for the post-mortem):
when Geoff directed this session to run the cairn nav-layout pass by workflow, a SECOND
live session (the fresh cairn session that cairn's own STATUS had pre-baked, running in
another terminal) was ALREADY executing the same plan via its own workflow
(wf_ea16ef00-fdb) in the same nav-layout worktree. This session's workflow
(wf_3ae128ab-ffe, ~1.23M subagent tokens) raced it; the implementer agents detected the
contention mid-pass and switched to verify-not-duplicate (their recipe is now in cairn's
agent memory), so all seven tasks landed exactly once and the worktree closed clean —
but a large fraction of this session's workflow spend was waste. THE DEFECT WAS MINE:
cairn's STATUS said "fresh session executes it" and my own Task-1 implementer found warm
uncommitted code in the worktree, and I checked for a live runner only after the fact.
Lesson for the record: before dispatching into a shared worktree, check for a live
concurrent executor (pgrep the worktree path, stat the workflow journals, ask Geoff if a
session is already on it). RESOLUTION: this session STOOD DOWN on the cairn side; the
other session was observed running the Task-8 close-ritual gate and owns close, merge,
and the 0.86.0 cut. This session watches the registry and resumes initiative 5 (the
^0.86.0 bump + brainstorm) when the cut lands.**

**PRIOR: INITIATIVE 4 (segment-email) IS COMPLETE, MERGED TO MAIN (98257fe), MIGRATION LIVE,
AND ON DEV (2026-07-14, the program's fourth session). Spec
`docs/2026-07-14-segment-email-design.md` + plan `docs/plans/2026-07-14-segment-email.md`,
both implemented. What landed: `/admin/club/email/compose` (landing = `email_blasts`
history; compose = segment picker + subject + markdown body + the 3-variable palette +
sample preview through the real render path; review = server-resolved count + roster
sample + rendered email + send-test-to-me + the count-acknowledging confirm dialog),
`segments.ts` (current INCL. GRACE / lapsed excl. never-paid / class:<id> guardian-aware
/ instructors current-season; announce's currentMemberEmails is now a thin
resolveSegment('current') caller — FLAG FOR GEOFF'S WALKTHROUGH: announce's audience
deliberately WIDENED to include grace households, the current-includes-grace ruling
applied consistently), `bulk-email.ts` (shared 50-chunk loop; blast row PRE-INSERTED
then counts updated, so the audit row survives a late D1 failure; `blast:<id>`
email_log tagging; test sends log `blast-test`, no row), and migration 0025
(email_blasts; scratch-proven, applied LIVE, verified). Build: 3-task Sonnet workflow +
3 Opus lenses — NOTE: structured-output schemas MISFIRED for review agents (the
security lens died on the retry cap, the svelte lens returned degenerate placeholder
junk); both re-ran as plain-text direct dispatches and worked. Lesson recorded: review
lenses return prose, not schemas. One conductor-triaged fix round (9 items; the two
that mattered: the update()-reset draft wipe BLOCKER that made the screen unable to
send at all, and the D1 100-bound-param cap in the household IN() that would have
broken current-segment AND announce at the live 148-household scale) + simplifier (one
consolidation). Conductor render read on the synthetic seed: PASS across 8 captures at
1440+390 including a REAL local end-to-end send (blast row 6/6/0, tagged log rows);
the review-390 "mid-page header" was the Playwright fullPage sticky artifact, verified
clean at real scroll. Rider: the e2e signup fixture now clears the FULL member FK
closure (the render read's enrollment rows exposed the latent bootstrap break). Gate
at close: check 0/0 (840 files), 1178 tests, build green, e2e 27/27. Deployed to dev
manually (version b49a515b), smoked (home 200, compose 303-to-login). Budgets: ~1.41M
subagent tokens + the Fable main loop; 3 question rounds to Geoff pre-execution, 0
corrections. Known debt: the admin e2e login helper is still owed — this session's
minted-session recipe is the seed (apply migrations/0000_auth.sql locally, INSERT an
AUTH_DB editor + session row, cookie `cairn_session=<session id>`; raw id, no hash);
Turnstile/rate-limit ride payments-live-smoke; deploys stay manual (Actions billing).
NEXT SESSION (fresh context, per the ruling): INITIATIVE 5, CUSTOM ADMIN ROLES —
Geoff's 2026-07-14 ruling made it the next move now that cairn 0.85.0 is on the
registry with the editor-roles seam. Read
docs/2026-07-13-cairn-editor-roles-consumer-brief.md + ROADMAP's admin-roles entry,
then brainstorm; the first mechanical act is the dependency bump ^0.84.4 → ^0.85.0 (a
0.x caret EXCLUDES 0.85.0, it will not drift in). Also queued: Geoff's dev walkthrough
is now FOUR screens (Members, household desk, Money & Renewals, Compose — flag the
announce grace widening), and tomorrow's apology-send verification (07-15 09:21
in-session verifier; if that session died, check the JSONL log beside
~/.local/asc-data/send-apology-2026-07-15.mjs and re-run --send if needed).**

**PRIOR: INITIATIVE 3 (membership-admin) IS COMPLETE, MERGED TO MAIN (22c10b0), AND ON DEV
(2026-07-14, the program's third session). Spec `docs/2026-07-14-membership-admin-design.md`
+ plan `docs/plans/2026-07-14-membership-admin.md`, both implemented. What landed: the
household-grouped Members screen (member-first search with matched-chip highlight,
standing badges incl. grace, comp/discount rendered honestly, stale-asset warning), the
household desk (roster CRUD with normalization, membership history with tier
change/refund, money timeline, assets; add-household walk-up door; move member with
primary reassignment; merge with season-conflict refusal), Money & Renewals
(/admin/club/money: KPI grid, read-only renewal candidates, attention list,
season-flat table, manual check/cash/comp payments), the refund engine (Stripe API
refunds with deterministic Idempotency-Key + per-line CUMULATIVE caps off
refunded-so-far; record-only path for MW/PayPal/check; unwinds: refunded_at mark /
enrollment drop / asset-fee unflip; Stripe-failure-writes-nothing), standing unified in
member-auth/lib/standing.ts (household-keyed, refund-aware; doors + admin share it;
renewal reclaims refunded seasons), the live signup-review queue
(signup_review_resolutions; announcements repointed to real segments), demo-members.ts
DELETED, and the REMINDER-BLAST GUARD (10-day staleness cutoff in both due-selectors;
50-send per-tick shared budget with a send_cap_hit audit row; renewal markers now
cycle-keyed on expires_on). Migrations 0023+0024 scratch-proven, applied LIVE, verified
(240 markers backfilled, zero empty). Build: 8-task Sonnet workflow + 3 Opus lenses
(~1.84M tokens) + one conductor-spec'd fix round + the guard rider + simplifier (one
dead-code removal); conductor render-read on a synthetic seed caught 3 display defects,
fixed (formatCivilDate datetime tolerance, date-shaped paid_at writes, KPI grid — NOTE:
DaisyUI's stats component CSS is NOT in this project's compiled set). Gate at close:
check 0/0 (831 files), 1138 tests, build green, e2e 27/27 (e2e needs `npm run
media:seed` after any .wrangler/state wipe or the visual specs fail on missing photos).
Budgets: ~2.9M subagent tokens + the Fable main loop; 3 question rounds to Geoff
pre-execution, 1 mid-flight correction (I claimed Tidy fixed before verifying the key
itself — the claim-without-live-proof lesson). Known debt: admin e2e still wants an
editor-auth login helper (the render-read session-mint recipe in this entry's session
is the seed of one); Turnstile/rate-limit rides payments-live-smoke; deploys stay
manual (Actions billing).
THE DAY'S OPERATIONAL ARC (same session, alongside the build): (1) the post-import
REMINDER BLAST (first cron tick after the MW import fired 655 catch-up sends; 471
quota-failed, 184 delivered to 59 members) — root-caused, cron trigger REMOVED from the
worker via API and commented out of wrangler.toml (re-enable = explicit mw-cutover step,
now gated on the blast guard above); (2) the APOLOGY SEND queued for 07-15 09:03 via
self-deleting crontab (~/.local/asc-data/send-apology-2026-07-15.mjs, idempotent,
throttle-retrying, FROM Geoff Wright <geoff@907.life>, 59 recipients) + a 09:21
in-session verifier (if that session died: check the JSONL log beside the script,
re-run --send if needed, record rows into email_log template_id 'migration_apology');
(3) the legacy live site's EMAIL MIGRATION DEPLOYED (Resend→CF; the committed-but-
blocked change shipped manually with the full pipeline replicated; uptime worker too;
RESEND fully retired: worker secrets, stores, sync routing, health checks, and the six
Resend DNS records + apex SPF include swept); (4) CLOUDFLARE TOKEN CONSOLIDATED to one
("Cloudflare Admin 2026-07"): the old token had NO DNS scope anywhere (docs claimed
otherwise — corrected; past "DNS" changes were product-API side effects), dashboard
edits to it silently failed, so a fresh full-scope token was minted and rotated through
the age store + 4 GH repos; CF_ZT_TOKEN retired; scope truth now lives ONLY in
~/.claude/docs/cloudflare-estate-inventory.md (all project docs repointed; the broken
`source ~/.bashrc` token recipe fixed in 3 repos); (5) the ANTHROPIC_API_KEY was found
REVOKED (via cairn Tidy failing on asc-site — which also never had the key routed);
new key minted, validated live, rotated to asc-site + ecxc workers; Tidy healthy.
NEXT SESSION (fresh context, per the ruling): INITIATIVE 4, segment-email — read this
entry + ROADMAP.md's segment-email entry, then brainstorm. Scope ruled 2026-07-13:
announce stays; add segment targeting (current, lapsed, class roster, instructors) and
compose-without-a-post, on the email-templates/log substrate; the segments now exist
live (standing.ts + the announcements repoint). The staff-roles collapse onto cairn's
editor-roles seam STILL WAITS for the cairn release (consumer brief:
docs/2026-07-13-cairn-editor-roles-consumer-brief.md) and lands as its own follow-up
pass. Also queued: Geoff's dev walkthrough of the three new screens (his before/after
gate), and tomorrow's apology-send verification.**

**PRIOR (INITIATIVE 2, unified-signup) IS BUILT, REVIEWED, AND ON DEV AWAITING GEOFF'S
BEFORE/AFTER (2026-07-13→14, the program's second session; spec
`docs/2026-07-13-unified-signup-design.md` + plan `docs/plans/2026-07-13-unified-signup.md`,
both implemented). What landed: the `src/member-signup/lib/` pure engine (validate /
price / build; MAX_CLASS_PICKS=8), the fifth payment kind `join` (multi-line
createCheckout; `reconcileJoin` ATOMIC on the donation pattern — claim inside one
db.batch with the flip, credit grant/redemptions, fee_paid flips, and the ledger lines;
webhook answers 500-for-retry on join+donation; ledger cents SNAPSHOTTED into session
metadata so lines sum to Stripe's total by construction), migration 0022 (join_welcome +
board_join_notice templates AND the processed_stripe_sessions.kind CHECK widened —
fixing a LATENT LIVE DEFECT where 'donation' was never CHECK-valid on real D1;
scratch-proven, applied LIVE + local), the public `/join/apply` door (tier prices from
settings, family roster, per-member class picks, running total, waiver, Turnstile,
fireweed submit), the class-door standing gate (current/grace proceed; no-match pivots
into join with the class carried; lapsed gets the renewal magic link), portal renew LIVE
(tier picker, next-unclaimed-season mint, dues checkout; the reminder deep-link works)
plus the asset-fee pay door (incl. a real pre-existing season-source bug fix), the
`membership-pricing` inline directive replacing every hand-typed tier dollar, the
content pass (join/renewing/class-registration on the live doors; fresh-context content
review, original club copy ruled standing), and the membershipworks directive retired.
SECURITY AMENDMENT (spec 2026-07-14): the unauthenticated welcome-back form was
REPLACED by a requestMemberLink magic-link handoff after the Opus auth lens showed
pre-payment writes into a victim household + roster/minor-name disclosure; a known-paid
email at either public door now gets "check your email" into the portal. Build: the
6-task Sonnet workflow + 3 Opus lenses (~1.7M tokens), two conductor-spec'd fix rounds,
simplifier (one finding — the arc judged clean), e2e (join happy path, class-door
pivot; portal-renew e2e skipped: no member-auth login helper exists) + `/join/apply` in
the five-viewport visual suite + ALL 15 stale round-4/5 baselines regenerated against
the ratified rendering (conductor render-read; events h1 assertion updated for the
promise hero). Gate at close: check 0/0 (813 files), 1050 tests, build green, e2e
27/27. Budgets: ~3.1M subagent tokens + the Fable main loop; 2 question rounds to
Geoff, 1 Geoff-initiated correction (the invented board-approval copy, e16054f +
memory). Roadmap: `class-management` and `season-rollover` logged (Geoff's rulings;
rollover is sitewide, ops startNewSeason is the precedent). MERGED TO MAIN cd09deb on
Geoff's go (2026-07-14): the whole education-round-4 arc landed; the conflict resolved
to main's cairn-cms ^0.84.4 pin (his cairn-side bumps), full gate green post-merge (815
files, 1050 tests, e2e suite previously 27/27), dev redeployed from main and smoked.
The two flagged calls (the welcome-back magic-link amendment, the fireweed submit)
stand unless Geoff reopens them at his dev walkthrough.
NEXT SESSION (fresh context, per the ruling): INITIATIVE 3, membership-admin — read
this entry + ROADMAP.md's membership-admin entry + the consumer brief
docs/2026-07-13-cairn-editor-roles-consumer-brief.md, then brainstorm. The opening fork
is Geoff's screen-shape question (two Members/Memberships screens vs one
household-grouped screen + a money/renewals view) — drive mockups from the REAL
285-member data (the messy shapes: Wright stale-membership-with-assets, comped
memberships with no dues line, Joseph Oliver's two-charge 2024). The staff-roles
collapse onto cairn's editor-roles seam WAITS for the cairn release (Geoff building it;
sequence the screens/CRUD/refunds work first). Refunds write the ledger through the
0021 invariants. Known debt: GitHub Actions billing still blocked (deploys stay
manual); Turnstile enforcement + rate limiting ride payments-live-smoke; portal-renew
e2e wants a member-auth login helper.**

**PRIOR (INITIATIVE 1, money-ledger) IS COMPLETE AND LIVE (2026-07-13, the program's first
session): the MW REPLACEMENT PROGRAM is on ROADMAP.md (Geoff-approved; one go-live —
apex cutover waits for membership signup/renewal/admin, MW cancels right after):
money-ledger → unified-signup → membership-admin → segment-email → payments-live-smoke →
mw-cutover; qbo-integration narrowed to the sync. Rulings this session: email = announce
+ segments (not a campaign tool); staff roles: cairn's committed shape is ONE identity
with a site-declared role vocabulary (Geoff building it in cairn-cms; ASC first
consumer — membership-admin collapses club_roles onto the seam; member auth stays
separate; consumer brief at docs/2026-07-13-cairn-editor-roles-consumer-brief.md);
SESSIONS CLEAR CONTEXT BETWEEN INITIATIVES. What landed (spec docs/2026-07-13-money-ledger-design.md, plan
docs/plans/2026-07-13-money-ledger.md, both marked by this entry as implemented):
migration 0021 (transactions + transaction_lines, scratch-proven on a real disposable D1
then APPLIED LIVE), ledger.ts (the invariant-enforcing write seam), the three reconcilers
now write ledger rows after their guarded flips, DONATIONS PERSIST as a fourth payment
kind (atomic claim+ledger batch; the webhook answers 500-for-retry on donations only —
they have no domain row to reconcile by hand), and mw-ledger.mjs BACKFILLED ALL 401 MW
accounting rows to the live asc-club (401 transactions / 461 lines; zero sum-invariant
violations; idempotent — post-apply dry-run plans exactly zero). Built by a workflow (4
serial Sonnet implementers + cf-d1 and money-security Opus lenses) + three conductor fix
rounds off the real dry-runs (cents parsing for fractional fees; blank-account rows
import with null household — two were real wedding donations; all-comped list-price
fallback to classes.fee; partial-refund matching across a Reference typo; repair
detection keys on the sum invariant, not line absence). Live-data facts for the record:
19 comped memberships legitimately carry no dues line (no money moved); the Joseph
Oliver two-tier 2024 ruling now shows honestly as TWO $250 charges linked to one
membership (verify.sql reports, correctly); memberships' real column is price_paid
(snake_case — an earlier explorer summary said pricePaid; verified against live schema).
Pre-backfill backup at ~/.local/asc-data/backups/asc-club-2026-07-13-pre-ledger.sql.
Gate at close: check 0/0 (792 files), 973/973 tests, build green. Budgets: ~1.44M
subagent tokens + the Fable main loop; 2 questions to Geoff (finish line, email scope),
0 corrections. NEXT SESSION (fresh context, per the ruling): INITIATIVE 2, the
unified-signup brainstorm (Fable-authorized; the education arc log holds the framing;
ROADMAP.md's unified-signup entry is the scope) — the dues checkout call sites land
there against the now-ledger-complete seams. The round-5 settle and admin review round
remain queued from the prior entries.**

**PRIOR (THE MEMBERSHIPWORKS DATA IMPORT IS LIVE, 2026-07-13 night session, Geoff live throughout):
the real asc-club now holds the club's COMPLETE MW record — 148 households, 285 members (all
with `mw_account_id` provenance, migration 0020; the one pet row refused), 235 membership rows
spanning seasons 2024-2026 with REAL payment facts (dates, Stripe/PayPal refs, true amounts
incl. discounts and comps; the July-7 paid_at-from-renewal-date approximation fully retired,
incl. one delete of a fully-refunded membership), 15 classes (10 historical instances minted),
172 enrollments with >95% exact attendee identity from MW's per-event rosters (signup answers +
check-ins in audit provenance), and 89 asset assignments (the 3 formerly-unmatched holders
resolved: one by sub-member email, two by the new ops-person→MW-account override map).
Machinery: `scripts/import/mw-members.mjs` v2 (six phases + accounting pre-processing + roster
identification, idempotent — post-apply re-run plans ZERO changes; 915 tests), built by a
workflow (4 implementers + 2 Opus review lenses) plus five conductor-driven fix rounds off real
dry-runs. Sources committed age-encrypted at `data/membershipworks/` (members, canon accounting
export, 14 attendee rosters; plaintext machine-local only); pre-import backup at
`~/.local/asc-data/backups/`. Rulings recorded in CLAUDE.md: asc-club schema fully evolvable
(never write around it), encrypted exports in-repo, normalization on every write path (emails
lower, phones E.164, conservative name recasing — live paths done: ensureMember, portal
profile/household; portal profile still validates unparseable phones). ROADMAP.md born:
`qbo-integration` logged as the phase-2 accounting project (ledger-shaped transactions table;
Geoff's ruling). FOR GEOFF/COMMITTEE: (1) the Wright household + Elayne C Hunter hold active
asset assignments but memberships stale >400 days — 6 assignment rows correctly skipped until
renewal or a hand-recorded payment; (2) Jerry Edward Amundsen's fully-refunded May-2026
membership row was deleted per accounting-is-canon; (3) Joseph Oliver's two-tier 2024
transaction ruled family (override in-script). NEXT: the unified-signup brainstorm (Geoff
authorized Fable time), the .page-cta rollout behind ratification, the round-5 settle (owed
list at the education arc log's foot), and the admin review round (+ Geoff's new ask: a spot
for both Members and Memberships, or one household-grouped screen + a money/renewals view).**

**PRIOR (ROUND 5 EXTENDED, 2026-07-13 evening, this repo's first live session; Geoff live-reviewed
throughout, then called for a state save ahead of a context clear): the education page grew
its LIVE CLASS SCHEDULE (Geoff's ask, mirroring the old site's table) — a `class-schedule`
island in the registration band, quiet grid rows reading asc-club through a remote query,
with the FULL lifecycle status engine (Completed / In session / Drop-in "Just show up!" /
Opens <date> via the new class_registration_opens settings gate / Full→Join waitlist /
Open→Register to our own /classes/[id]/signup / Dates TBD / season-wrapped line /
schedule-pending line for the post-rollover empty season). Everything relevant is on
`design/education-round-4`, gates green at close (check 0/0 over 786 files, 754 tests,
build green, cairn bumped to 0.84.2). Data facts settled with Geoff live: Fleet Tune-Up
RENAMED "Skills & Drills Weekend" (his pick from a slate; old name read as boat repair; D1
name+slug remote+local, education + racing prose, anchor #skills--drills-weekend), the
event now takes PRE-REGISTRATION (drop_in=0; free; members-only), and signup asks
"Anything specific you'd like to learn?" (migration 0019; answers ride waitlist→enrollment
through both offer-claim paths — a conductor-caught data-loss fix). Migrations 0018
(drop_in + registration gate) and 0019 (enrollment interests) are scratch-proven and
APPLIED TO THE REAL asc-club; the 2nd Adult Intro end_date typo (2016→2026) repaired;
local D1 rebuilt from all 19 migrations and seeded with real events/classes/settings (no
member PII). Admin: Drop-in checkbox + classes-list badge + owner-only "Class registration
opens" Settings field (two reviewed Sonnet dispatches, c23fb6a + 9fffa1f). FLAGGED FOR
GEOFF'S VERDICT: the band's fireweed registration-door button is RETIRED (schedule rows
carry their own doors; page fireweed budget back to ONE — the closing email CTA).
NEXT SESSION: the MEMBERSHIPWORKS DATA IMPORT (Geoff has data; start from
docs/mw-export-findings.md, the partial export at ~/.local/asc-data/mw-export-2026-07-07.csv,
and the two-database import doctrine in the cairn-aksailingclub-effort memory). QUEUED
BEHIND IT: the unified-signup brainstorm (one flow + language across the join and class
doors, join+class in one pass — Geoff authorized Fable time; the arc log holds the framing),
the .page-cta rollout to the five Questions-style pages (behind ratification), and the
ROUND SETTLE (unchanged owed list at the arc log's foot). The dev server machinery:
`npm run dev` + `npm run media:seed` (cairn-media-seed; the old sync-media-local.mjs is
retired since 0.84.1).**

**PRIOR (LIVE ROUND 5, 2026-07-13 afternoon, run from the cairn-cms session; work moves HERE now —
Geoff's ruling at handoff): seven education-page probes on `design/education-round-4`, all
PROVISIONAL-KEEP (Geoff iterated forward on each; no per-item ratification yet), logged
one-per-line in `docs/design-benchmark/education-round-5-arc.md` (READ IT FIRST on resume):
the 2x2 "What You'll Learn" reorganization (four two-item clusters, Rules & Racing new), the
course-weekend TIMELINE (grid + duplicate narrative merged; gold class-day stops on one
measured axis; rail through Sunday), the Fleet Tune-Up de-bulleting, the SITEWIDE `.page-cta`
closing panel (supersedes the round-3 education closing card; rollout to the five other
Questions-style pages QUEUED behind ratification, home exempt), the two FIREWEED action
buttons (`.asc-cta-btn`, the color story's full budget: the registration door + the closing
email action), and the TOC bottom clamp (bug fix, verified three ways). NO gates run this
round (arc economics); the settle owes everything listed at the arc log's foot: probe script
+ lens fan-out + render read, simplifier, full gate, decisions.md distillation, merge,
manual wrangler deploy (Actions still billing-blocked), Geoff's before/after. NEXT SESSION
(in THIS repo): continue the live round or run the settle, Geoff's call.**

**EVENING CLOSE (2026-07-12 late, Geoff's live review round, ALL RATIFIED): after the
template pass verified below, Geoff reviewed live (localhost tab) and the round landed, all
on design/education-round-4, gates green throughout (check 0/0, 725 tests): (1) education
CONTENT REORGANIZED — "Dates & Registration" dissolved into the registration band (Class
Dates & Openings first, Class Waitlist folded in as h3, old h2 removed), Recommended
Reading moved to the prep group, lede widened past family-first ("Everyone's welcome, solo
sailors, couples, and whole families alike"); (2) membership benefits OWNERSHIP moved —
Join owns the content (it already had the card grid; education's checkmark section deleted
+ one-line pointer; the two unique lines folded into Join's What It Costs; dead
.membership-benefits CSS removed); (3) the HERO CROP SYSTEM — 2:1 (owner-picked from
side-by-side crops) with per-photo `imageFocus` frontmatter (join "50% 30%", racing
"50% 65%", others centered; a global up-bias failed racing and was replaced); (4) INLINE
FIGURES on primary pages = 85% FLUSH-LEFT inset above 48rem (centered read right-shifted
to the owner's eye despite measured symmetry — the ragged-right anchor-edge optics; ruling
in decisions.md); (5) the TOC RAIL moved clear of the hero photo's breakout (gap keyed to
the widest element; breakpoint 82rem); (6) TWO REAL BUGS fixed — the lede CTA styled by
a:last-child shattered racing's mid-sentence link (now stamped lede-cta structurally), and
the events dedicated route never received tier treatment (light hero mirrored locally).
THE IMAGE STANDARD is codified per-template in docs/image-standard.md (consult it, never
re-derive). Rulings: geometry probes are necessary but the owner's optical read outranks
them; content work is main-loop (Fable-level), never dispatched.
NEXT SESSION: the settle — merge design/education-round-4 to main, push, deploy to dev,
final production before/after on Geoff's go (the branch is pushed for durability; GitHub
Actions still billing-blocked, so CI/deploy workflows will not fire — deploy manually via
wrangler if unblock hasn't happened). Then: regenerate the education-light e2e baseline on
CI once billing clears (DOUBLY stale now: round-4 + this round), and the posts/bulletins
composition follow-up spec (the phased half of the template-system spec).**

**PRIOR (2026-07-12): the page template system pass, Tasks 1-6 LANDED on
design/education-round-4 (spec: `docs/2026-07-12-page-template-system.md`, now marked
implemented; plan: `docs/plans/2026-07-12-page-template-system.md`). Recovered from the
2026-07-11 crashed brainstorm. Shipped: the shared type spine (`--text-step-1` repinned to
`clamp(1.19rem, 1.17rem + 0.1vw, 1.25rem)`, strictly between body and h3; `.prose h2`
weight 600 → 700), the nav-rank tier selector (`src/theme/page-tiers.ts`, `isPrimaryPage`,
primary = top-level `menus.primary` destinations), hero data moved off a code map into
pages frontmatter (`promise`/`facts`), the adaptive primary hero (full promise hero, light
variant, or plain title hero per page) plus the gold waypoint rule on every primary page's
h2s, and promise lines for all six primary pages (Education, Racing, Events, Join, Members,
Contact). `docs/design-benchmark/education-round-4-arc.md` is distilled into
`decisions.md` and removed. Gate at Task 6: check 0/0 (782 files), 725 tests exit 0, build
green. **TASK 7 RAN (same session): four fresh-context visual verifiers + an Opus svelte
review over pre/post captures (scratchpad reference-pre banked before T1). Verdicts:
education PASS (all three expected deltas, zero hero drift from the frontmatter migration);
home COSMETIC (news-card headings share step-1 and shrank; full titles now fit where they
ellipsized — judged an improvement, in Geoff's package); hierarchy PASS (one cosmetic carry:
education's standfirst reads near body size — left for Geoff's live education review, a
taste call); tier variants PASS after the conductor's fix (686060c): /events/ is a DEDICATED
route the [...path] tier gate never reaches, so it now mirrors the light promise hero
locally (a dedicated-route primary page mirrors the light hero; consolidate to a shared
component on a third consumer). Svelte review: no blockers; both hardening fixes applied
(trimmed promise, Array.isArray facts). NEXT ACTION = Geoff's before/after at the deploy
gate — nothing from this pass deploys or merges without his look; then merge to main + the
follow-up posts/bulletins composition spec.**

**PRIOR HANDOFF (2026-07-09, education round 3 closes; NEXT SESSION = the design-loop brainstorm):
education round 3 is MERGED TO MAIN and LIVE ON DEV (0827c06 + machinery at ed8c317). The
round: fixed the round-2 hydration DUPLICATION bug (split-before-wrap invariant + regression
test), band now holds only How to Register & Pricing, third divider group "Preparing for
class", the PROMISE HERO (owner-delegated pick from 3 static-mock candidates), valley-first
lede, right-of-way under Seamanship, checkmark membership grid, full-width Questions card,
badge/rhythm/divider fixes. Full detail + all owner process rulings:
docs/design-benchmark/decisions.md (round-3 entry + PROCESS entry — READ IT FIRST).
**THE NEXT SESSION'S JOB: brainstorm the machine-local cheap-fast design-iteration loop**
(Geoff: "this review process is very broken"; 10-15 iterations/arc, minutes per turn, fully
local, NO GitHub/Cloudflare deploys until finalize, no per-tweak ceremony). Already settled:
Geoff reviews in a LIVE LOCALHOST TAB (vite dev HMR, port free-choice; he picked this over
screenshots), machinery already working = `npm run dev` + `scripts/sync-media-local.mjs`
(seeds .dev-media; 53/53 photos serve locally) + the vite `devMediaFallback` middleware
(works around the cairn media-route onlyIf-Headers bug, filed in cairn ROADMAP). Open forks
for the brainstorm: iteration edit ownership (main-loop tweaks vs builder dispatches),
per-iteration self-check cadence (my crops per tweak vs settle-only), the settle ritual's
exact contents (gate + simplifier + baseline regen + deploy), whether to package the loop as
a skill/npm script, and whether it generalizes to the other cairn-family sites. KNOWN DEBT:
the education-light visual BASELINE is stale on CI (regenerate via ci.yml workflow_dispatch
before the next PR); the design-refinement skill needs an exploratory-iteration mode (its
dispatch-builders shape failed Geoff's iteration economics — his words banked in
decisions.md); home hero headroom (minor, unflagged by Geoff) left alone.
Elsewhere: cairn 0.83.0 published; Geoff's queue: webhook mints x3, GitHub Actions billing,
ops-410.**

**PRIOR HANDOFF (2026-07-08 afternoon, session f6adeb65 closes): education round 2 is MERGED and
ON DEV (9f6bd4a, all gates green) awaiting Geoff's detailed review. THE NEXT DESIGN ROUND
RUNS IN A FRESH SESSION via the new user-scoped `design-refinement` skill (its cold trial):
artifacts are banked in docs/design-benchmark/ (benchmark PNGs + ledger.md + decisions.md
with dose words and the education handoff state). Geoff's education notes are the round's
input. Do NOT re-run a heavy lens panel for the round (a re-read pair was killed as
overweight; per the skill, the conductor's own render read carries per-round quality and
audits run once per arc). Iterate cheap (dev server/HTML), verify real once at readiness.
Home is PINNED as the design benchmark (Geoff: "that's our new design benchmark").
Elsewhere: cairn 0.83.0 published (publish-actions seam; ASC announce deep-link live);
Geoff's queue: webhook mints x3, GitHub Actions billing (blocks the legacy email deploy),
ops-410, and now the education review.**

**HOME FINALIZED (2026-07-08, later): rounds 6-8 + the felt-refinement audit closed the home
page — the triptych group-framed (radius on the band, square seams) with subgrid caption rows
(title/desc/link y-identical at 1280-2560, measured) carrying the club's ORIGINAL copy (Geoff-
supplied, two typos fixed, untrimmed), the plain quiet fleet list, the full-measure notification
card, and the felt pass (38 knobs audited, 29 already right, 5 applied: ::selection navy wash,
text-wrap balance/pretty, branded focus on the three unbranded link families, cursor affordance
on icon buttons — all token-level, inherited by every page). PROCESS NOW BINDING: passes over
patches with reference anchors (gate memory 11a), builders stop for the conductor's render read
before committing, dev updates only at readiness points, and Geoff's design QUESTIONS get
answers before execution. NEXT: move on to other pages — the education/interior propagation
inherits the finished token system; the admin review round is queued.**

**NIGHT CLOSE (2026-07-08, session f6adeb65 continued): the home page converged through five
owner-review rounds and is on dev for Geoff's look — the triptych (owner-picked candidate A,
content-width portrait panels per the new full-bleed ruling), the two-column dotted Season
(four-category pixel-verified palette, racing marked, quiet legend, calm titles), the unified
fleet/facilities list register (leader-dot spec sheet), the north-star notification card with
the pennant and "Read more". THE PUBLISH->ANNOUNCE LOOP IS LIVE END TO END: cairn 0.83.0's
publishActions seam + this site's adapter declaration + /admin/club/announce/[id] (the feature:
email all current members + Discord channel pick, #general default, summary prefilled
description-else-sentence-aware-excerpt, per-medium rendering, announcements table 0017 on the
real D1). Cairn 0.82.1 fixed the admin sidebar pair Geoff found. DESIGN METHOD CHANGED AND
BANKED (site-page-review-gate memory 11a): passes over patches, reference renders over
adjectives, conductor reads per iteration; plus the full-bleed-never-for-content ruling in the
design doc. GEOFF'S QUEUE: the round-5 home look; webhook mints (LEADERSHIP/EDUCATION/
BUCCANEER_18); the GitHub Actions billing fix (blocks the live-site Resend->CF email deploy at
f202870+1e0e0c4; ops worker already live on CF email); ops-410. QUEUED NEXT: the admin review
round (the filed feedback + Memberships screen), the rate limit on public forms, the education
TOC-standard propagation to the interior pages, the payments live smoke (deliberate plan),
member import.**

**THE RECOVERY + POLISH DAY (2026-07-07 evening, session f6adeb65): home and education
REBUILT and on dev awaiting Geoff's read (one-shot gate passed: panels + conductor's
dev-surface tiled read). Landed on main: the tool-wave consolidation (error-states merge,
fixture fix, discord wiring 502cd8f), the migration renumber (0011/0015, 0012/0016), the
member directory (/my-account/directory, review-gated), the craft sweep (~28 pages,
DE-BANDED at merge per the reaffirmed home-only band ruling), home rounds 1+2 (Geoff's
twelve notes), the education plain-article rebuild (hero fix site-wide, gutter-rail TOC
standard, no bands), CI GREEN at d7e7cf3 (ics-feed fixture fix + self-committing baseline
regen). ADMIN AUTH FIXED end-to-end: editor rows seeded (both Geoff addresses), Email
Sending enabled for the zone, the legacy CMS-Admin Access app deleted, worker rebound —
Geoff signed in. EMAIL MIGRATION (Resend->CF): ops worker LIVE on the new transport;
main-site deploy BLOCKED on GitHub Actions billing (Geoff's action); reply-to arrays
collapse to submitter (Geoff veto window); RESEND keys held for the soak. Engine: the
pass-2.1 harvest landed at cairn c7b472f; admin sidebar fixes (scroll bleed +
auto-collapse) in flight -> cairn patch release when green. QUEUED: the admin review
round (Geoff's filed feedback: payment-due badge, count mismatch, header stack,
Memberships screen), the rate limit on public forms (dev is NOT behind Access — Turnstile
armed), asc-ops-staging's unknown deploy path, the live payments smoke (deliberate plan),
member import. Topo + handbook rewrite PARKED (token economy). Test notification live on
dev home for Geoff's banner review.**


**PASS 2.1 COMPLETE ON pass-2-1 (2026-07-07, the extended-Fable overnight): all ten plan
tasks plus five riders. asc-club carries 15 tables (migrations 0001-0006, every one
scratch-proven then verified live), ops's 12 events + 5 classes imported and photo-parity
restored, the admin runs events/classes/waitlists/offers/settings on live D1 through
0.82.0's engine seams, the public class signup/waitlist/offer-claim routes are live with
waiver-version acceptance, the dev events read repoints to asc-club (rollback = repoint
back; the ops 410 patch PREPARED at docs/plans/assets/ops-events-410.md, HELD for Geoff).
The close ran the three-reviewer Opus fan-out; all confirmed findings fixed (the signups
role gate, the atomic offer consume + capacity re-check, the atomic last-owner guard,
awaited audits, the Anchorage timezone pin, security headers, migration 0004's integrity
indexes). The 2.2 member-domain substrate landed early (0005) because remote D1 enforces
REFERENCES existence: the harvest (docs/plans/2026-07-07-pass-2-1-harvest.md) carries
that lesson and eleven others. PUBLIC-CUTOVER BLOCKERS, named: TURNSTILE_SECRET_KEY set +
rate limit on the public forms (dev is safe behind Access). Gate at close: check 0/0 (651
files), 260 tests exit 0, build green, the real-D1 write-path proof green.**


**PASS 2.1 EXECUTING OVERNIGHT (2026-07-07, the extended Fable session; Geoff sleeping ~9h):
the plan is `docs/plans/2026-07-07-pass-2-1-events-classes.md` (committed). Ruled tonight:
0.82.0 cut authorized (consumer-needs-it); ops 410 PREPARED but HELD for Geoff; 2.2 substrate
authorized (fixtures + the partial export at ~/.local/asc-data/mw-export-2026-07-07.csv; full
accounting export needs Geoff's MW contact); beta WAITS for phase 2; offer window 72h; club
roles seed = Geoff only; Stripe = reuse the ops account, KEY IS GEOFF'S MORNING PASTE (lives
only in the ops worker + 1Password); lean member data (ONE email + ONE phone, E.164);
birthdates for tier/class age gates; the household PRIMARY controls household members'
directory listings (per-member visibility writable by self, primary, or admin); renewal
reminders = few, well-chosen touches (3-4 band), shipped as Club settings. The member PORTAL
is a first-class deliverable: episodic-use design (signup + renewal, zero learned navigation),
design suite + mockups due for Geoff's morning ratification. asc-club D1 CREATED:
643edae4-bdc1-42ab-976e-fa014ef2eac1. The engine Part C seams merged at cairn 69a2908; the
club-admin scaffold merged here at 5549d19 (simplifier folded, 0623682).**

**Task 1 landed (2026-07-07): the asc-club migration 0001_substrate.** Ten tables (events,
classes, class_instructors, class_enrollments, class_waitlist, class_offers, club_roles,
settings, audit_log, plus the waiver_acceptances rider folded in early from Task 8's gap
analysis) are live on the real `asc-club` D1, proven first on a scratch database
(forward, verify, rollback, verify-empty, delete) per the migration pattern. Seeds: settings
current_season=2026 (read off asc-ops's own live 2026 events/classes rows), offer_window_hours=72,
waiver_text_version=2026-01; club_roles one row, geoff-login@907.life as owner (the ratified
DDL's club_roles enum was extended with 'owner' to match Task 4's typed contract). The
CLUB_DB binding is in `wrangler.toml`. Task 2 (the ops import scripts) is next.

**THE FULL-SITE WALKTHROUGH LANDED (2026-07-06, three verifier chunks, every page):
docs/ORIGINAL-MANIFEST.md is the completion pass's checklist — 7 go-live blockers
(events stub, dead forms, notifications unwired, the WRONG LOGO, home news images,
bulletins missing, news wayfinding), 5 must-fixes, 4 sanction questions for Geoff. **All
7 go-live blockers, the 3 sanctioned photo restores, and all 5 must-fixes (items 8-12:
search/Donate/Members dropdown, the 390 table overflow, TOCs plus governance
breadcrumbs/subtitles, the legacy RSS redirect, and the facilities/Season/footer copy
fixes) are now done** (2026-07-06). NOTHING ships to Geoff's eyes until every manifest
line is checked.**


Rolling status for the Alaska Sailing Club's cairn rebuild. Canonical plan:
`~/Projects/cairn-cms/docs/superpowers/plans/2026-07-06-asc-phase-1-build.md`. The design contract
this build executes has a durable local copy in this repo: `docs/2026-07-06-asc-phase-1-design.md`
and the blessed home-page example, `docs/2026-07-06-asc-home-northstar.html`. Read this file first
for where the work stands before picking up the next task.

## Where things stand (2026-07-06)

**Phase 1 (build Tasks 1-5) is code-complete and deployed to dev.** All five plan tasks have
landed:

1. Scaffold on `@glw907/cairn-cms` ^0.81.0 (posts/pages/notifications concepts, D1 auth, EMAIL,
   MEDIA_BUCKET, the GitHub App backend).
2. Content migration from the Hugo site (`~/Projects/aksailingclub-org`): every public page and
   phase-1 guide, the news archive, the component-grammar findings for the shortcode gaps.
   `docs/content-migration-findings.md`.
3. The club-grounds theme built onto the north star (A1 quieting, B1 editorial pacing, C7-gold
   season taxonomy), real photography in the media library.
4. Events wired to the club's live `asc-ops` D1 (read-only), schema and taxonomy verified against
   production. `docs/events-integration-findings.md`.
5. Verification, the pixel-diff CI rider, the permalink crawl, and the dev takeover.
   `docs/verification-findings.md`.

**dev.aksailingclub.org now serves this build**, behind the same Access application volunteers
already used for the prior migration shell. The Workers Custom Domain was repointed from
`asc-staging` to the `asc-site` worker (deployed for the first time in Task 5); `asc-staging`
itself is untouched, still bound at `staging.aksailingclub.org`. **Production
(`aksailingclub.org`, the live Hugo site) is untouched**; the apex DNS cutover is a deliberate,
separate act gated on Geoff's before/after review, per the design spec.

## The completion pass (2026-07-06 full-site walkthrough against the live original)

`docs/ORIGINAL-MANIFEST.md` is the completion pass's checklist against `aksailingclub.org`
itself, worked item by item. **Item 1 / the events deep-look is done:** the events page's
D1 stub is now the full detailed listing (month sections, Off-Season, Meetings &
Governance, type and registration-status badges, descriptions, register links, per-event
photography, a real `/events/calendar.ics` feed), built against `docs/events-manifest.md`'s
exhaustive re-enumeration of the live page. `$theme/events-data.ts`, `$theme/ics.ts`,
`EventsListing.svelte`, `EventCard.svelte`; unit-tested; the site-visual e2e baseline
regenerated.

**Items 2 through 7, 13, 14, and 15 are also done.** The contact and donate forms are live,
hydrated islands over a mailto fallback, routing by category and creating a Stripe
Checkout Session respectively; the home notification banner reads a pure, unit-tested
`activeNotification`; the club's real logo replaces the invented badge in the site header;
the News & Updates cards resolve each post's real hero photo and a reading time; the
`bulletins` concept restores the two missing live URLs; the news index carries its stats
bar, Browse-by-Topic grid, and per-topic `/tags/[tag]/` pages; and the What-do-we-do band,
the home hero, and the guide/hub heroes all restore their live photography (the crop rule
verified image by image). See `docs/ORIGINAL-MANIFEST.md` for each item's own resolution
note.

**Items 8 through 12 (the must-fixes) are also done (2026-07-06).** The header carries the
Pagefind search modal (Cmd/Ctrl+K or its trigger), the Donate heart, and a Members popover
dropdown with its seven live sub-links; the 390 packing-checklist overflow traced to
`.site-main` missing the flex-item `width: 100%; min-width: 0` fix the chassis's own
`.cairn-site-main` documents, now applied; the catch-all template grows a collapsible
table of contents on any long entry (eight-plus headings) and governance subpages regain
their "back to Governance" link and a frontmatter-driven subtitle; `/index.xml` redirects
to `/feed.xml`; and the home page's facilities list, Season legend copy, and footer
Discord/Contact links are restored. See `docs/ORIGINAL-MANIFEST.md` for each item's own
resolution note.

## What is NOT done yet

- **Every manifest line is now resolved.** `docs/ORIGINAL-MANIFEST.md` carries no open
  must-fix or go-live blocker as of 2026-07-06.
- **The apex cutover.** `aksailingclub.org` still serves the old Hugo/GCE site. This is Geoff's
  call, not an engineering task: the design spec gates it on his explicit go after a live review
  of dev, and the GCE origin retires only after a soak period following that cutover.
- **A real fresh-context verification pass.** Task 5's own verification loop ran self-graded, in
  the same session as the fixes it made (dispatch was not available); every PASS in
  `docs/verification-findings.md` is flagged as such and wants an independent re-check before the
  apex cutover.
- **Phase 2: incremental ops absorption.** The events admin, the members directory, `my-account`,
  and auth beyond magic-link editors all stay on the existing ops stack (`ops.aksailingclub.org`)
  for now, migrating one small pass at a time per the design spec's coexistence strategy. Each
  such pass reconciles with the prior migration's D1 work (`~/Projects/aksailingclub-sveltekit`,
  evidence only, not a foundation) in its own scope.
- **Phase 3: the member handbook** on Topo, once Topo exists.
- **The ASC harvest review.** Queued in cairn-cms's `docs/internal/pre-beta-harvest.md`; runs once
  this build's lessons (the NOTIFICATIONS concept, the D1-beside-cairn read pattern, the A1/B1/C7
  recipes, the fixture-media gap the pixel-diff rider surfaced) are ready to triage into the
  chassis and engine.
- **GitHub Actions cannot run yet.** Both `ci.yml` and `deploy.yml` fail immediately on push
  ("recent account payments have failed or your spending limit needs to be increased"), a
  pre-existing account-billing block, not something this repo's workflows caused (Tasks 1 and 2's
  earlier pushes hit the identical failure). The CI rider is proven locally against a clean
  `.wrangler/` state (`docs/verification-findings.md`); it needs Geoff to clear GitHub's billing
  block before it runs for real.

## Next action

**A fresh-context verification pass** over the full manifest (every line now marked
resolved but Task 5's own loop ran self-graded), then **the production apex cutover, on
Geoff's explicit go**, per the design spec's before/after-approval gate — never bundled
with a routine push to `main`. Clearing the GitHub Actions billing block is a standing
prerequisite for either CI or the deploy workflow to run automatically again, independent
of the above.
