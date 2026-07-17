# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**IMMEDIATE NEXT ACTION (Geoff, 2026-07-17): OPEN THE ROLES & COMMITTEES BRAINSTORM,
FABLE-CONDUCTED, IN A FRESH SESSION.** The member-directory pass T0 surfaced that "roles" is
really a structured roles-and-committees model (per-committee chairs, notable committee
membership, member self-service + admin management, and a member-facing committees surface).
Geoff called for a Fable brainstorm. Run `superpowers:brainstorming` from the seed
docs/2026-07-17-roles-committees-brainstorm-seed.md. Resume prompt: "Open the roles & committees
brainstorm: read docs/2026-07-17-roles-committees-brainstorm-seed.md, then brainstorm the model
with me." Launch from ~/Projects/aksailingclub-org, `/model fable`.

**THE `member-directory` PASS IS PAUSED MID-T0 (2026-07-17, Opus).** The T0 composition probe is
BUILT and delivered from real asc-club rows — a hairline-separated de-carded list, person-first
entries, contained reading width (masthead/rail unborrowed), one smart search across name + boat
+ role, three chips, mobile as its own composition with 44px tappable contact. Probe lives in the
session scratchpad (real member names never land in git); arc log
docs/design-benchmark/member-directory-round-1-arc.md. AWAITING Geoff's visual verdict on the
non-roles parts (entry anatomy, header, mobile). The build (T1+) waits on the brainstorm above,
since plan T1/T5/T6 all depend on the roles/committees model. Real-data note for whoever resumes:
NO role or committee data exists anywhere (empty class_instructors, only Geoff in the auth editor
table) — the first seed is Geoff-supplied.

INDEPENDENTLY SCHEDULABLE, any time Geoff's review availability suits: the FABLE waivers sitting
(waivers plan T7 + the T4 signing-UX design — attorney draft packet, board packet, and the
ratified signing-moment probes; it must land before the waivers BUILD session reaches T4, and it
depends only on the spec, not the directory pass or the build).

**DIRECTORY + WAIVERS BRAINSTORM SITTING: DONE 2026-07-17 (this sitting, Fable-conducted).
Both specs and both plans are committed and Geoff-approved; the queue's next two passes are
fully specified.** Directory: docs/2026-07-17-member-directory-design.md + its plan (8 ratified
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

**PORTAL REDESIGN PASS: SHIPPED TO DEV 2026-07-17 (merge 510b266, PR #1); full entry in
docs/status-archive.md. STILL OPEN: Geoff's before/after against mock D (four states,
light+dark, 390/1440 available on request) — that gate is the apex's, not dev's.**

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
