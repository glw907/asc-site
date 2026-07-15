# ROADMAP

> Strategic initiatives. Managed by `/log-project`. Individual carry-forwards live in
> `docs/STATUS.md` entries (this repo keeps no BACKLOG.md, per CLAUDE.md).

The six `mw-*`-ordered initiatives below form the MembershipWorks replacement program
(approved by Geoff 2026-07-13): one go-live — the apex cutover waits until membership
signup, renewal, and admin are live on this site, and MW cancels right after. Order
matters: the ledger is the foundation every money flow writes into, the signup
lifecycle is the centerpiece, and everything else hangs off those two.

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

### Custom admin roles `admin-roles`
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

### Admin nav reorganization `admin-nav-reorg`
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
first question at the admin-roles brainstorm.

### Payments hardening & live smoke `payments-live-smoke`
The deliberate live-Stripe smoke that has been queued since pass 2.1, plus Turnstile
and rate limiting on the new public money forms (a named cutover blocker).
Fable-window ruling (Geoff, 2026-07-14): spec and plan authored in-window (what the
smoke proves, expected outcomes, abort criteria, the Turnstile/rate-limit design);
execution runs post-window under an Opus conductor — the live smoke needs Geoff's go
regardless.

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

### Design propagation & continuing rounds `design-propagation`
Keep the design rounds moving on the ratified Home/Education system (Geoff,
2026-07-14). The 2026-07-14 inventory confirmed the TEMPLATE MIGRATION IS DONE: all
six primary pages carry promise heroes, every secondary content page renders through
the tier system's catch-all (plain hero + TOC standard), and the routes that bypass it
are deliberate machinery (forms, portal, posts/tags; /events/ mirrors the promise hero
locally — consolidate to a shared component on a third consumer). What remains is a
punch list, not a migration: the `.page-cta` closing-panel ratification and rollout to
its five queued pages (join, members, visiting-the-club, renewing-your-membership,
new-member-guide; education already renders it), the posts/bulletins composition spec
(the phased half of the template-system spec, never written), and the polish backlog
(docs/2026-07-07-polish-backlog.md) triaged into live rounds. Method: the
design-refinement live-round loop with Geoff's optical read as the gate; decisions.md
rules stand, never re-litigated. Outside the mw-* program — runs interleaved with it
on Geoff's review availability.
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

### QuickBooks Online integration `qbo-integration`
Sync the club's money events to QuickBooks Online: `qbo_ref` population, entity
mapping (SalesReceipt/Refund/Deposit onto ledger rows), and the OAuth/API plumbing.
Builds on `money-ledger`, which now carries the ledger table itself; this initiative
is the sync. Ruled by Geoff 2026-07-13; phase-2, after the MW replacement program.
