# ROADMAP

> Strategic initiatives. Managed by `/log-project`. Individual carry-forwards live in
> `docs/STATUS.md` entries (this repo keeps no BACKLOG.md, per CLAUDE.md).

The six `mw-*`-ordered initiatives below form the MembershipWorks replacement program
(approved by Geoff 2026-07-13): one go-live — the apex cutover waits until membership
signup, renewal, and admin are live on this site, and MW cancels right after. Order
matters: the ledger is the foundation every money flow writes into, the signup
lifecycle is the centerpiece, and everything else hangs off those two.

## Pre-cutover pass sequence (Geoff, 2026-07-17)

Geoff ruled the remaining pre-cutover build initiatives a queued series, waivers
included. The order below balances member value, the pre-cutover review load each
member-facing pass adds, and the fact that admin work never touches the apex gate. Each
pass is its own fresh session, brainstorm-first where the entry says so; Fable conducts
the design.

1. **`member-directory`** — the #1 member request, and it rides the just-shipped portal
   design language while it is fresh. Highest member value, so first among the builds.
2. **`member-waivers`** — the legal foundation (liability, plus the mooring and storage
   variants, annual re-sign cadence, not a one-time checkbox). It must land before the
   apex cutover, since live signups need current waivers, but there is no live exposure
   before cutover (dev is behind Access), so it follows the directory rather than
   preceding it. Hooks into the built signup/renewal flows and into `season-rollover`.
3. **`admin-sidebar-2`** — moved ahead of events by Geoff 2026-07-18: the second
   sidebar round (fewer groups, collapsed-by-default with one open, unique icons),
   brainstorm-first. Apex-independent, so also the natural break from member-facing
   review cycles.
4. **`events-redesign`** — self-contained, its own template, the special-focus page.
   Independent of the first two.
5. **`admin-nav-reorg` + `admin-roles`** — DONE 2026-07-15 (executed early as one
   initiative once cairn 0.86.0 landed; see the initiative entries below).

Then converge: once directory, waivers, and events have shipped to dev with Geoff's
before/afters, the pre-cutover member surface is complete. Clear the accumulated review
queue (portal, payments, and these), run the `mw-cutover` apex cutover, and phase-2
absorption follows, with directory and waivers already down-payments on the MW
retirement.

Batching (Geoff confirmed, 2026-07-17): the directory and waivers brainstorms run in
ONE sitting — they share the membership/portal surface and the member-record data seam.
Keep them delineated within it (directory fully, then waivers) and keep their design and
build passes separate and in order; the win is Geoff's attended time, not a merged
feature. Events and nav/roles brainstorm on their own. Three of Geoff's sittings for
five passes.

## Active

### The money ledger `money-ledger` — DONE 2026-07-13
The QBO-shaped `transactions` table: one row per money event (charge, refund, void,
comp, donation) with date, amounts, processor ref, fee, line items, and a future
`qbo_ref`. Reworks the existing dues/class-fee/asset-fee reconcilers and the donate
flow to write ledger rows, backfills the archived 401-transaction MW ledger via the
verified-import pattern keyed on `mw_account_id`, and re-hangs existing payment facts
off it. First in the program because every later initiative writes money events.
(Split out of `qbo-integration` per Geoff's 2026-07-13 ruling that the ledger is
designed at the payments pass, not bolted on mid-flow.)

### Unified signup & membership lifecycle `unified-signup` — DONE 2026-07-14
One flow and language across both doors: public join (household + members + tier
pricing from settings + waiver + Stripe dues checkout), join-plus-class in one pass,
a live Renew path from the portal and reminder emails, lapse/standing semantics, and
wiring the already-built class-fee and asset-fee checkouts into their flows. The
program's centerpiece; Geoff authorized Fable time for its brainstorm. Builds on
`money-ledger`.

## Planned

### Members & Memberships admin on live data `membership-admin` — DONE 2026-07-14
Shipped (merge 22c10b0; spec docs/2026-07-14-membership-admin-design.md). The one piece
deliberately still open: the staff-roles collapse onto cairn's editor-roles seam, which
waits for the cairn release and lands as its own follow-up pass (the consumer brief is
the contract). Original scope, for the record: swap the admin members screens' demo
fixtures for the real 285-member D1 and settle
the screen-shape question (two screens vs. one household-grouped screen plus a
money/renewals view) in its design. Adds the missing CRUD: manual payments
(check/cash/comp), tier changes, archive, directory-visibility management,
current/lapsed segments, and refunds against the ledger. Staff-role management: cairn's
committed shape (2026-07-13, filed in that repo's Next tier) is one identity with a
site-declared role vocabulary — the engine keeps the allowlist, editor table, and
ManageEditors screen; ASC declares owner/club-admin/instructor in config, each mapped to
an engine capability level. ASC is the named first consumer: at this initiative the site
COLLAPSES `club_roles` onto that seam (retiring the table, the Settings grant/revoke UI,
and the site-side last-owner guard) once the cairn release ships. Member-scale auth
stays this site's own system, per Geoff's separation ruling. The consumer requirements,
vocabulary mapping, and fork answers: `docs/2026-07-13-cairn-editor-roles-consumer-brief.md`.

### Segment email `segment-email` — DONE 2026-07-14
Shipped (merge 98257fe; spec docs/2026-07-14-segment-email-design.md). The Compose
screen at /admin/club/email/compose: segment targeting (current incl. grace, lapsed,
class roster, instructors), compose-without-a-post with the count-confirm + test-send
gate, and the email_blasts audit history (migration 0025, live). Original scope, for
the record: announce stays; add segment targeting and a compose-without-a-post path,
on the existing email-templates/log substrate. Scope ruled by Geoff 2026-07-13:
segments, not a campaign product.

### Custom admin roles `admin-roles` — DONE 2026-07-15
The staff-roles collapse onto cairn's editor-roles seam, ruled the NEXT initiative by
Geoff 2026-07-14 now that cairn 0.85.0 ships the seam (one identity, site-declared
role vocabulary; ASC is the named first consumer). SEQUENCING (Geoff, 2026-07-14, at
the session-5 open): the initiative waits for cairn's admin nav-layout pass (0.86.0),
so ASC bumps ONCE for roles + navLayout together — the navLayout seam replaces this
site's `filterClubNav` with declarative role visibility, inside this initiative's
surface. The work, once 0.86.0 is on the registry: bump the dependency ^0.84.4 →
^0.86.0 (a 0.x caret excludes higher minors), declare owner/club-admin/instructor in
site config mapped to engine capability levels, adopt `navLayout` for the sidebar,
collapse `club_roles` onto the seam (retiring the table, the Settings grant/revoke UI,
and the site-side last-owner guard), and keep member-scale auth separate per Geoff's
ruling. The contract: `docs/2026-07-13-cairn-editor-roles-consumer-brief.md`.

### Admin nav reorganization `admin-nav-reorg` — DONE 2026-07-15
Arrange this site's whole admin sidebar for its real people — board owner, club-admin
volunteers, instructors — on cairn 0.86.0's `navLayout` seam (engine and club screens
mixed, relabeled, role-gated sections, fallback semantics), replacing the provenance
shape (engine core + an 11-item Club section appended). Research-grounded by mandate
(Geoff, 2026-07-14): the brainstorm starts from cairn's nav-organization research and
the shipped "Organize your admin nav" guide (whose principles and worked example are
already ASC-shaped — Club first, role-gated; Content second; a trailing Site group with
Settings relabeled to resolve the duplicate-Settings collision), then grounds the
arrangement in an inventory of what each ASC role actually does across the admin
screens, with Geoff's walkthrough as the acceptance gate. Rides the same ^0.86.0 bump
as `admin-roles` and needs its declared vocabulary for the role-gated sections; whether
it executes as a phase of that initiative or as its own pass immediately after is the
first question at the admin-roles brainstorm. Executed with `admin-roles` as one
initiative (workflow wf_77a5e053; the split-desk tree, live on dev; full record in
docs/status-archive.md).

### Admin sidebar round 2 `admin-sidebar-2` — NEXT PASS after the waivers build
Second round on the admin sidebar, queued by Geoff 2026-07-18 as the next pass
(supersedes the 2026-07-17 ordering that had events-redesign next). BRAINSTORMED AND
SPEC'D same day, live with Geoff beside the waivers build: the ratified contract is
docs/2026-07-18-admin-sidebar-2-design.md (purpose-first 4-group tree, Signups
retired, bulletins/notifications re-unified, full relabel sweep, five plain-function
roles incl. Webmaster and Publisher, action-count badges with collapsed-header sums,
25 unique icons). THE CAIRN ENGINE PASS IS DONE (v0.88.0, 2026-07-19, Geoff's own cairn session): all
four seams shipped — defineAccess(roles, map) + canReach as the single authority for
requireAccess route gates AND sidebar visibility; NavLayoutSection.collapsed;
NavLayoutEngineRef.icon + the allowlist widened 9→27; the attention dependency
(role-scoped pills, collapsed-header sums, zero-drop, no count leakage). ASC-side
work now splits into TWO PASSES (Geoff, 2026-07-19): (A) `asc-roles-adoption` — the
^0.88.0 bump, the five plain-function roles with the grant-row rename migration, the
defineAccess permission map per the spec's matrix, requireAccess on club routes,
Publisher send-action widening, the Waiver text carve-out, denial tests, and the
matrix tested from the map (plan: docs/plans/2026-07-19-asc-roles-adoption.md); then
(B) `asc-sidebar-build` — the ratified tree/labels/collapse/icons/attention wiring,
Signups retirement, bulletins re-unification, the class-waitlist screen and compose
deep link, opening with the probe round for the still-owed verdicts (defaults, icons,
order). Geoff's walkthrough remains the acceptance gate for B.

### Payments hardening & live smoke `payments-live-smoke`
The deliberate live-Stripe smoke that has been queued since pass 2.1, plus Turnstile
and rate limiting on the new public money forms (a named cutover blocker).
Fable-window ruling (Geoff, 2026-07-14): spec and plan authored in-window (what the
smoke proves, expected outcomes, abort criteria, the Turnstile/rate-limit design);
execution runs post-window under an Opus conductor — the live smoke needs Geoff's go
regardless.
Pre-spec rulings (Geoff, 2026-07-14, the settle-in-advance round): the smoke charges a
REAL card on the cheapest real product and refunds it through the ledger's own refund
path, making refund machinery part of the proof; the real ledger row and confirmation
email stay, marked as the smoke in the audit trail. Turnstile goes on EVERY public
unauthenticated POST endpoint (money forms and all); authenticated member/admin forms
rely on session plus rate limits instead. Rate-limit mechanism is the spec author's
technical call. Spec authorship is cleared to run unattended (overnight-eligible).
AUTHORED 2026-07-15 (the overnight run): docs/2026-07-15-payments-live-smoke-design.md
(spec, incl. the sandbox dry-smoke stage and abort criteria) +
docs/plans/2026-07-15-payments-live-smoke.md (plan). Decision points for Geoff:
smoke product ($1 donation default vs $100 domain-row alternative), dev-Access posture
(dev verified PUBLIC today, contra CLAUDE.md), and smoke marking — SETTLED 2026-07-15 as
MEMO (no marker column; the shipped memo path is final, migration 0027 dropped). Two remain.
HARDENING HALF EXECUTED 2026-07-15 overnight (Opus-conducted, plan Tasks 1-6 + conductor
steps 1-2): Turnstile on all five remaining public POSTs, the [[ratelimits]] layer, the
optional smoke memo, and the key-swap appendix — 7 commits (56500fb..fd61fcf) gate-green
(check 0/0, test 1216, e2e 33/33) and DELIBERATELY UNPUSHED (push=dev deploy). Review gate
caught a live-prod Turnstile-render blocker on the signup money form (fixed) plus an a11y
and a fixture-determinism defect. RELEASED TO DEV 2026-07-15 (Geoff's "make the accounting
updates, then release"): the stack pushed to main → deploy.yml → the asc-site dev worker (not
the apex). STILL OPEN on Geoff's go: his before/after on dev, a real-browser confirm of the
deferred-widget render against the live secret, the sandbox dry-smoke (first-ever webhook
reconcile), then the live charge + refund + revert; the three decision points above remain his.
Full accounting: docs/STATUS.md top entry.

### Go-live: apex cutover & MW retirement `mw-cutover`
The program's final act: a fresh MW delta re-import (members keep joining/renewing on
MW between the 2026-07-13 snapshot and cutover; the idempotent import script makes
this cheap but it must be an explicit step), content updates pointing join/renewal at
the real flows, re-enabling this worker's reminder cron (`wrangler.toml` [triggers],
disabled 2026-07-14 because a pre-production worker must not email members; requires the
reminder-blast guard, landed at `membership-admin`), the fresh-context verification
pass, Geoff's before/after, the apex DNS cutover, the soak, then the MW subscription
cancel and GCE retirement.
Fable-window ruling (Geoff, 2026-07-14): the runbook (delta-import verification, the
verification pass's scope, the DNS sequence, rollback posture, the cron re-enable gate)
is authored in-window. Geoff WANTS the cutover itself in-window too, token budget
permitting — the cutover is token-light next to a build pass (the verification pass is
its main spend), so if the chain ahead of it (admin-roles + nav-reorg,
payments-live-smoke, Geoff's walkthrough) clears with budget left, it runs
Fable-conducted; otherwise it falls to the post-window default, Opus-conducted against
the runbook. The soak needs no Fable either way.
Pre-spec rulings (Geoff, 2026-07-14, the settle-in-advance round): TWO WEEKS, QUIET —
the apex flips with a low DNS TTL, the legacy origin stays warm for instant rollback,
and no member announcement is made (the site simply works). MW cancels and GCE retires
only after two clean weeks that include one full weekly cron cycle and at least one
real member join or renewal. Runbook authorship is cleared to run unattended
(overnight-eligible). AUTHORED 2026-07-15 (the overnight run):
docs/2026-07-15-mw-cutover-runbook.md. Premise correction from the research: the apex is
served by the legacy aksailingclub-org WORKER via routes (no GCE serving path; the GCE IP in
the apex A record is a proxied placeholder), so the flip is a custom-domain/route
reassignment, edge-instant both ways — the low-TTL ruling's intent (instant rollback) is
satisfied by the mechanism, stated in the doc.

### Fragments migration & the DX/contract harvest `fragments-migration`
Migrate repeated content onto cairn's Fragments, shipped in **0.87.0** (Geoff, 2026-07-16), and use
the pass as the deliberate occasion to harvest cairn DX and site-contract failures rather than
filing them one at a time. Opens with FABLE-CONDUCTED PLANNING (Geoff's own call), a fresh session,
and the standing DX-harvest mandate ([[feedback_dx_harvest_mandate]]) escalated from a background
duty to this initiative's actual point: **look for failures**, do not just consume the feature.

WHAT 0.87.0 SHIPS: a site declares the reserved `fragments` concept key (which requires
`routing: 'embedded'`); an editor includes a published fragment in any post or page with
`::include{fragment="<id>"}`, inserted by the editor's own "Include a fragment" picker. Editing the
fragment updates every consumer. The include is a block splice, so the fragment's markdown lands in
place. A fragment has no public URL and its computed permalink 404s, so it reaches a reader only
through a consuming entry. Renaming rewrites every inbound include, and a fragment's edit screen
carries a standing "Included in" consumer list.

THE BUMP IS DELIBERATE: the site pins `^0.86.0`, and a 0.x caret EXCLUDES higher minors, so nothing
arrives until someone bumps to `^0.87.0`. That bump also carries 0.87.0's other change, and the
changelog names a consumer action: `routing: 'embedded'` is now GENUINELY non-routable (entries stop
resolving through `byPermalink`, prerendering through `entries()`, and appearing in `site.all()`);
previously the shorthand was declarable but unenforced, so embedded entries were served and
sitemapped like routable ones. **Checked 2026-07-17, not assumed: ASC's only embedded concept is
`notifications`, which holds home-banner data with no URL of its own, so the bump looks safe on that
axis.** The stale memory that made it look breaking (it claimed payment confirmation lived in the
embedded concept) is corrected; those system pages are in the PAGES concept and their old URLs
resolve via `$theme/redirects.ts`.

**THE SURVEY ALREADY EXISTS: `docs/fragment-candidates.md`** (Geoff started it 2026-07-15, and the
2026-07-15 pass has been feeding it since under a standing policy: duplicate freely, format
consistently, LOG THE DUPLICATE). Nine ready cases, each carrying what the content is, where it
currently lives, its likely fragment shape, and -- the part that makes this cheap -- the CANONICAL
WORDING that pass already converged the duplicates onto ("gentle realignment that makes the future
extraction mechanical"). Mooring cost/eligibility, the club address, the storage-fee table, and six
more. That file's own header names this pass as its consumer: "a future content-consolidation pass
converts this list and deletes it." So the first task is to VERIFY and extend that list against
today's content, never to re-survey from scratch. cairn-cms's own STATUS tracks this from the other
side ("PARALLEL, in ASC's own session: the ASC consolidation consumes fragments; its
docs/fragment-candidates.md holds nine ready cases; navLayout addition + content migration there"),
so the two repos already agree on the shape. Still true and worth holding: a fragment serving one
consumer is worse than the duplication it replaces, so a candidate that turns out to have one real
home gets dropped, not converted.

THE HARVEST HALF, SCOPED TO FRAGMENTS (Geoff, 2026-07-17): log the DX and site-contract
deficiencies and improvement opportunities **associated with the fragments capability**, not a
general audit. This pass is fragments' FIRST REAL CONSUMER TEST outside cairn's own showcase, from
both seats at once, which is exactly what the feature has not had:
- the **developer** seat (declaring the reserved `fragments` concept, the `routing: 'embedded'`
  requirement, the `^0.87.0` bump, what the contract does and does not enforce), and
- the **editor** seat (the "Include a fragment" picker, the include's block-splice behavior in the
  preview, the "Included in" consumer list, what rename actually rewrites, what happens when a
  consuming entry is published but the fragment is not).

WHERE FINDINGS GO: `~/Projects/cairn-cms/docs/internal/docs-friction-log.md`, which takes a
perspective tag per finding (`developer` | `editor` | `maintainer` | `operator`) and triages into
that repo's ROADMAP/STATUS; that repo keeps no separate backlog file. This also discharges the
standing [[feedback_dx_harvest_mandate]] for this surface. (The log was cleared at the 0.87.0
cut, but it is NOT empty: cairn's invisible-craft pass filed its own entries on 2026-07-17, so
this pass's findings append rather than open it. Verified at execution.)

WHAT TO HUNT, earned from the portal pass (2026-07-16/17): not "does the API work" but **where a
consumer can be GREEN AND WRONG**. That pass's ratified probe depicted data the system could not
produce four separate ways, its fixtures reproduced the fiction so the baseline hid the defect, and
`ci.yml`'s dispatch reported success while doing nothing. Every one was green on
`check`/`test`/`build`. The fragments analogue is the same shape: a promise the docs make that
nothing enforces, a way to hold the concept wrong without being told, an include that silently
resolves to nothing. Fix the site contract's own failures here; file cairn's against cairn.

PLANNED 2026-07-17 (the Fable planning session; Geoff approved the design interactively): spec
`docs/2026-07-17-fragments-migration-design.md` (ratified decisions: probe matrix + diary,
blocks-only conversion bar with the content-agreement test, Claude drives the editor seat) + plan
`docs/plans/2026-07-17-fragments-migration.md` (conductor runbook) + the stage-runner workflow
script beside it. Execution Opus-conducted in a fresh session per Geoff's downshift ruling; the
resume prompt is docs/STATUS.md's top entry.

EXECUTED 2026-07-17, developer seat only. The site runs `^0.87.0` with the fragments concept
live. The hunt paid: three of seven developer probes found a green-and-wrong state, two of them
blockers. Omit the one-line `resolveFragment` forward and every include renders its own raw
source text to the public page with the whole gate green (P2). The changelog's promised build
failure on a dangling include does not survive `prerender.handleHttpError: 'warn'`, which this
repo sets, so a typo'd id would 500 for members while CI passes (P4). Drop the manifest glob and
the admin goes blind to a fragment the public build serves happily (P3). All three are now
pinned by `src/tests/fragment-integrity.test.ts`, each assertion proven to fail when its defect
is introduced: the site-contract arm of the harvest.

The blocks-only bar rejected almost everything, which is the bar working. One candidate of nine
converts (`who-to-ask`, two class-a consumers plus one class-b), eight drop, and their facts are
pinned by `src/tests/content-agreement.test.ts`. The survey's own consumer list was wrong in both
directions: two of the three pages it named do not carry the block, and two it never named do.

TWO CARRY-FORWARDS. **The editor seat (E1-E8) never ran** and is unprobed, not clean: cairn's
unreleased invisible-craft branch rebuilds exactly those surfaces, so probing 0.87.0 would have
harvested friction the next release already fixed. It runs when ASC moves to `^0.88.0`; the
workflow script gates it behind `{ stage: 'probes', editor: true }`. **The harvest is drafted but
NOT FILED**: `docs/2026-07-17-fragments-harvest-findings.md` holds the entries, blocked because
cairn-cms sits on a live session's branch. Paste them into that repo's friction log once it
merges, then delete the staging file.

### Member waivers & digital signing `member-waivers`
**BRAINSTORMED 2026-07-17** (combined sitting with member-directory): spec
`docs/2026-07-17-member-waivers-design.md` (nine ratified decisions, three research
reports in the appendices, the board-facing document inventory in Appendix C), plan
`docs/plans/2026-07-17-member-waivers.md`. Execution is TWO UNITS (Geoff's three-unit
ruling): a FABLE sitting (T7 legal drafts + the T4 signing-UX design, schedulable any
time, must precede the build's T4) and an OPUS build session (T1-T6, T8, after the
directory pass). The entry below stands as background; the spec supersedes it where
they differ.
Every member signs a liability release; a mooring holder signs a separate mooring release; and
anyone storing property on unsecured club grounds (RVs, boats, trailers) should sign a storage
release too. Waivers change year to year, so each season needs fresh signatures and
acknowledgements, not a one-time signup checkbox. Needs its own pass to organize and plan all of
it (Geoff, 2026-07-16): high-quality DRAFT waivers written for a lawyer's review (drafts for
legal review, never legal advice — the club's attorney is the gate), plus the UI/UX for members
to sign digitally.

WHAT ALREADY EXISTS (verified 2026-07-16, narrower than the need on every axis): the
`waiver_acceptances` table (migration 0001) records who accepted what version and when, but its
`context` CHECK admits only `'class-signup'` and `'join'` — there is no mooring or storage
context, and no season column. `settings.waiver_text_version` ('2026-01') plus
`WAIVER_TEXT_VERSION`/`WAIVER_RELEASE_TEXT` in `src/theme/waiver-text.ts` carry ONE hardcoded
class/join liability release, deliberately not editor-managed (that file's header explains the
call, and pairs any text edit with a manual version bump in two places).

THE REAL GAPS, then: only two of the needed contexts exist; there is one waiver document where
several are wanted; nothing re-asks an existing member at season rollover (a member who joined in
2024 has never re-signed); acceptance is a signup checkbox rather than anything resembling a
signature; and nothing GATES on a missing signature (a member can hold a mooring today having
never signed a mooring release). Questions the brainstorm owes: what "digitally sign" must mean
to be worth anything (the ESIGN/UETA-style record is typed name + timestamp + waiver version +
IP, retained and reproducible — is that the bar, or does the club want more?); whether waiver
text becomes real content or stays code-managed once there are several documents versioned per
season; where an unsigned waiver blocks (assignment? renewal? nothing, just a nag?); and what the
board can see about who has signed what.

Natural seams: the portal redesign's "Needs your attention" rows are the obvious member-facing
surface for an outstanding signature, and `season-rollover` already carries "the annual
`waiver_text_version` review" in its own inventory — these two initiatives will want sequencing
against each other. The schema is fully evolvable (CLAUDE.md), so the context CHECK and a season
dimension are real migrations, never worked around in code. Interactive brainstorm with Geoff;
not overnight-eligible (legal exposure plus a product fork on what signing means).

### Events page from-scratch redesign `events-redesign`
A full from-scratch design of the events page, OPENING WITH A FUNCTIONAL BRAINSTORM
(what the page must do for members and visitors before any visual work), interactive
with Geoff. Licensed its own template and one-time design features; deserves special
focus because the page is important (Geoff, 2026-07-16). The probe-iteration process
governs the design work (HTML probes, verdicts, one rebuild per settle); the current
events page's timeline/chips/season machinery is evidence of requirements, not a
design to preserve.

### Member directory brainstorm & pass `member-directory`
**BRAINSTORMED 2026-07-17** (combined sitting with member-waivers): spec
`docs/2026-07-17-member-directory-design.md` (eight ratified decisions: person-first,
one smart search, household boats with kept-on, admin roles, one-dial privacy,
current-plus-grace listing), plan `docs/plans/2026-07-17-member-directory.md`.
OPUS-CONDUCTED per Geoff's ruling (straightforward development; the probe arc composes
inside the portal-derived design language and gates on his verdicts; genuinely novel
design proposes a Fable sitting instead of absorbing). Next in the pre-cutover queue.
The entry below stands as background; the spec supersedes it where they differ.
Full brainstorm and build pass on the member directory, the NUMBER-ONE member-requested
feature (Geoff, 2026-07-16). Opens interactive with Geoff: what members want from it
(find people, boats, moorings? contact? opt-in privacy model?), then designs and builds
against the portal redesign's rulings (occasional-user recognition principle, mobile
co-primary, the portal's own component license). The existing /my-account/directory
screen and MW's directory function (one of the four absorbed MW functions) are the
requirements evidence.

### Design propagation & continuing rounds `design-propagation`
Keep the design rounds moving on the ratified Home/Education system (Geoff,
2026-07-14). The 2026-07-14 inventory confirmed the TEMPLATE MIGRATION IS DONE: all
six primary pages carry promise heroes, every secondary content page renders through
the tier system's catch-all (plain hero + TOC standard), and the routes that bypass it
are deliberate machinery (forms, portal, posts/tags; /events/ mirrors the promise hero
locally — consolidate to a shared component on a third consumer). What remains is a
punch list plus a sweep. THE METHOD (Geoff's ruling, 2026-07-14): move through the
site PAGE-BY-PAGE and confirm good design — every page gets an affirmative
confirmation against the design contract (the density recipes, editorial pacing, the
image standard, the color story, the type spine), not just the pages that drew
complaints. Shape: pages grouped by template kind for review economy — (1) home +
the six primary pages (mostly round-hardened already; fast confirms), (2) the
Members-menu children and membership/renewal how-tos, (3) governance and policy
documents, (4) storage pages, (5) form/confirmation and system pages, (6) the news
surfaces (index, tag pages, post/bulletin rendering). Per group: conductor render
reads at the five-viewport bar, fixes for what misses the contract, then Geoff's live
localhost read confirms the group; a confirmed page is logged and not revisited unless
he reopens it. Rolled into the sweep: the `.page-cta` ratification and rollout to its
five queued pages (join, members, visiting-the-club, renewing-your-membership,
new-member-guide; education already renders it), the posts/bulletins composition spec
(the phased half of the template-system spec, never written), and the polish backlog
(docs/2026-07-07-polish-backlog.md) triaged into the groups. decisions.md rules stand,
never re-litigated. Outside the mw-* program — runs as its own SERIES OF DESIGN
SESSIONS (Geoff, 2026-07-14), roughly one group per session, never folded into a build
session. The ledger: docs/design-benchmark/page-confirmations.md (home + education
already confirmed, Geoff 2026-07-14).
Fable-window ruling (Geoff, 2026-07-14): FABLE-PRIORITY IN-WINDOW. Geoff finds Fable
much stronger in the design realm, and unlike the mechanical initiatives this edge
cannot be banked as a spec — the taste lives in the conducting (probe authorship,
render reads, the arrangement calls), not in a plan a cheaper conductor executes. So
design rounds rank beside admin-roles/admin-nav-reorg for in-window Fable time, ahead
of the spec-only queue when his review availability lines up.
Standing authorization (Geoff, 2026-07-14): pages may be moved onto the ratified
template structure opportunistically, whenever it makes sense in a session, no
per-page ask — the one-check rule and Geoff's before/after at the deploy gate still
apply to what ships. The `.page-cta` device stays behind its own ratification.

### Class management `class-management`
The in-season operations tooling for classes, on top of the pass-2.1 admin (events,
classes, waitlists, offers, and settings already run on live D1): attendance and
check-in against the roster (MW's per-event check-ins set the bar), roster exports for
instructors, class-fee refunds through the ledger's refund machinery, and instructors
reading their own rosters via the declared `instructor` role once `membership-admin`
lands the cairn roles seam. Key tooling for the site (Geoff, 2026-07-13) but not a
cutover blocker — the 2026 season already runs on the existing admin. Outside the
mw-* program; can start any time after `membership-admin`. The class-roster email
segment rides `segment-email`; the annual transition is `season-rollover`'s own scope.
Fable-window ruling (Geoff, 2026-07-14): spec-only in-window (brainstorm after
`admin-roles` lands, since instructor self-serve rosters ride the declared role);
execution post-window, Opus-conducted.
Ruling at the settle-in-advance round (Geoff, 2026-07-14): this one ESPECIALLY needs
interactive brainstorming — NOT overnight-eligible. The brainstorm runs live with
Geoff (check-in UX against the MW bar, screen shapes, the instructor `home`), now
unblocked since admin-roles landed the instructor role. Frame rulings already settled
(Geoff, same round): v1 scope is ALL FOUR capabilities (attendance/check-in, roster
exports, instructor self-serve rosters, class-fee refunds); instructors get CHECK-IN
WRITES on their own rosters (no other writes); refunds are club-admin-issuable, full
or partial, every one an audit row, and MUST FOLLOW THE ASC REFUND POLICY (Geoff,
2026-07-14) — the spec reads the club's actual policy from the site/governance content
and encodes it, never invents refund rules; timing is 2027 READINESS, no season
pressure.

### Season rollover `season-rollover`
The annual transition designed as ONE operation — Geoff's 2026-07-13 ruling that
rollover impacts functions across the whole site, not just classes. The inventory it
touches: the `current_season` setting (read by the class schedule island, whose
schedule-pending empty-season state already exists, the events listings, and the home
Season band), minting the new season's class instances (`classes-store.ts` anticipates
a rollover creating new rows, never mutating), resetting the `class_registration_opens`
gate, renewal season assignment (unified-signup's next-unclaimed-season rule reads
`current_season`), seasonal storage re-upping against standing (the portal design's
retention-by-request semantics; the asset staleness gate), the annual
`waiver_text_version` review, and the season-stamped copy across content pages. The
design goal: an admin-guided sequence with a verified checklist of what flipped, never
a scatter of hand edits across settings, D1 rows, and markdown. The working precedent
is the ops dashboard's one-button `startNewSeason` (Geoff's pointer;
`aksailingclub-legacy/ops/src/services/settings.js`): it flips CURRENT_SEASON, resets
active asset assignments to unpaid, clears class waitlists/applicants, and resets
class registration state — the same inventory, though this site mints new per-season
class rows and keeps history where ops mutates in place. Ordered beside
`class-management` after `membership-admin`; the two can land as one pass if the
design says so. First real exercise: the 2026→2027 transition.
Fable-window ruling (Geoff, 2026-07-14): the one-operation design and its sitewide
inventory are authored in-window (the part where a weak plan compounds); execution
waits for the off-season, Opus-conducted.
Pre-spec ruling (Geoff, 2026-07-14, the settle-in-advance round): the rollover ships as
a GUARDED OWNER-ONLY ADMIN OPERATION (preview → confirm → execute, with a per-season
audit row) — the board runs the annual transition self-serve, no operator seat. That
makes it a product feature, and Geoff flagged the design as needing a fair amount of
interactive brainstorming — NOT overnight-eligible; the brainstorm runs live with him,
like the class-management one.

### QuickBooks Online integration `qbo-integration`
Sync the club's money events to QuickBooks Online: `qbo_ref` population, entity
mapping (SalesReceipt/Refund/Deposit onto ledger rows), and the OAuth/API plumbing.
Builds on `money-ledger`, which now carries the ledger table itself; this initiative
is the sync. Ruled by Geoff 2026-07-13; phase-2, after the MW replacement program.
