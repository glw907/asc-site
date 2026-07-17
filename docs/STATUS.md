# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**IMMEDIATE NEXT ACTION (Geoff, 2026-07-17): OPEN A COMBINED `member-directory` + `member-waivers`
FUNCTIONAL-BRAINSTORM SITTING, FABLE-CONDUCTED, IN A FRESH SESSION.** Geoff ruled the remaining
pre-cutover initiatives a queued series (order in ROADMAP's "Pre-cutover pass sequence"):
directory → waivers → events-redesign → admin-nav+roles, then converge on the apex cutover. He
confirmed the directory and waivers BRAINSTORMS batch into one sitting (shared membership/portal
surface, shared member-record data seam), while their design and build passes stay separate and
in order. Run them as two delineated topics: DIRECTORY FIRST (the #1 member ask, higher value,
sets the membership-surface context), then WAIVERS. Do not blur a browse/privacy problem into a
legal-signing problem. Directory brainstorm: what members want (find people, boats, moorings;
contact; opt-in privacy model), designed against the portal redesign's rulings (occasional-user
recognition, mobile co-primary, the portal component license); the existing /my-account/directory
screen and MW's directory function are evidence of requirements, not a blueprint. Waivers
brainstorm: the liability release plus the mooring and storage variants, the annual re-sign
cadence (not a one-time checkbox), the e-signature capture, and the hooks into the built
signup/renewal flows and season-rollover. Resume prompt: "Open the combined member-directory +
member-waivers brainstorm sitting: read the ROADMAP `member-directory` and `member-waivers`
entries and the pre-cutover pass sequence, then start the directory functional brainstorm with
Geoff, waivers second." Launch from ~/Projects/aksailingclub-org, `/model fable` first.

**FRAGMENTS MIGRATION & DX/CONTRACT HARVEST: SHIPPED TO DEV 2026-07-17 (PR #2, Opus-conducted).
The site runs cairn ^0.87.0 with the fragments concept live. TWO THINGS ARE OPEN AND NEITHER IS
BLOCKING: Geoff's before/after on the one class-b page (/members), and the harvest is DRAFTED BUT
UNFILED.** Spec docs/2026-07-17-fragments-migration-design.md (its "Resolved verdicts" section is
canonical; the provisional table above it is kept only to show what verification overturned) +
plan docs/plans/2026-07-17-fragments-migration.md + the stage-runner workflow script beside it.

THE HUNT PAID, AND ITS FINDINGS ARE NOW PINNED IN CODE. Three of seven developer probes found a
green-and-wrong state, two of them blockers, all invisible to check/test/build: (P2) omit the
one-line `resolveFragment` forward and every `::include` renders its own raw source text to the
public page, because the unresolved directive falls through to the same code path that restores
an accidental prose colon ("4:00") to literal text; (P4) the changelog's promised build failure
on a dangling include DOES NOT HOLD HERE — svelte.config.js's `prerender.handleHttpError: 'warn'`
(set to tolerate pre-existing dead links) downgrades the 500 to a warning, so a typo'd fragment
id would 500 for real members with CI green; (P3) drop the manifest glob and the admin picker and
rename/delete guards go blind to a fragment the public build serves happily. All three are now
guarded by src/tests/fragment-integrity.test.ts, each assertion proven to FAIL when its defect is
reintroduced. P6 confirmed the permalink 404s and stays out of sitemap/feeds as promised.

THE BLOCKS-ONLY BAR REJECTED ALMOST EVERYTHING, WHICH IS THE BAR WORKING: 1 convert of 9, 8
drops, their facts pinned by src/tests/content-agreement.test.ts (7 assertions, proven meaningful
by breaking one and watching it fail). `who-to-ask` extracted with two class-a consumers
(visiting-the-club, club-boat-use-and-qualification) PROVEN BYTE-IDENTICAL in prerendered HTML,
plus one class-b (members.md, which also fixes a live "Something broken" drift). Club address
FLIPPED convert→drop: the two blocks differ in label, body, and shape, and Visiting's body says
"See Contact for a map link", nonsense rendered on Contact. NOTE FOR ANY FUTURE PASS: THE
SURVEY'S CONSUMER LIST WAS WRONG IN BOTH DIRECTIONS — two of the three pages the spec named for
who-to-ask do not carry the block, and two it never named do. Trust the files, never the survey.

CARRY-FORWARDS. **The editor seat (E1-E8) is UNPROBED, NOT CLEAN** — read its silence as "not yet
looked". cairn's unreleased invisible-craft branch rebuilds exactly those surfaces (include chip,
fold pill, preview boundary, blast radius), so probing 0.87.0 would harvest friction 0.88.0
already fixed; it runs when ASC moves to ^0.88.0, gated behind `{stage:'probes', editor:true}`.
**The harvest is staged in docs/2026-07-17-fragments-harvest-findings.md, NOT filed**: cairn-cms
sat on a live session's branch at close. Paste it into that repo's friction log once that branch
merges, then delete the staging file. Also: 0.87.0 silently re-derives every excerpt (it strips
directive markers), so the bump makes any 0.86.x manifest stale and fails the build unannounced —
on the way past it fixed a live defect, since /contact and /directory carry no explicit
description and had been shipping raw `:::contact-form` markup as their meta descriptions.
FOUND WHILE SURVEYING, NOT FIXED (member-facing, Geoff's call, detail in the spec):
seasonal-storage.md drops a qualifying clause from the Active Participating Member definition;
education.md hardcodes membership prices that join.md sources live from a directive; the racing
boilerplate across regatta posts is the one genuinely new fragment candidate.

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
