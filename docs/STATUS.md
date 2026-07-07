# asc-site status

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
