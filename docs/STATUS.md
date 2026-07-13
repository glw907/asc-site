# asc-site status

**ROUND 5 EXTENDED (2026-07-13 evening, this repo's first live session; Geoff live-reviewed
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
