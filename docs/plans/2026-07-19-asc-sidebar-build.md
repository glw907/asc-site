# ASC admin sidebar rebuild — plan (2026-07-19, pass B)

Executes the sidebar half of `docs/2026-07-18-admin-sidebar-2-design.md` (read it first; its **The
tree**, **Roles matrix**, **Security model**, and decisions 1–9 govern every task here) against
cairn `0.88.0`'s shipped sidebar seams. This is **pass B of two** (Geoff's ruling 2026-07-19:
roles/security first, sidebar second).

## Dependency: pass A must land first

Pass A (`docs/plans/2026-07-19-asc-roles-adoption.md`) lands before any task here starts, and this
plan reads three of its artifacts as fixtures, not as things to build:

1. **The dependency bump to `@glw907/cairn-cms` `^0.88.0`** (pass A T1). Every seam this plan leans
   on ships in `0.88.0`; the repo pins `^0.87.0` until pass A moves it.
2. **The five-role vocabulary** (`Administrator`, `Club manager`, `Webmaster`, `Publisher`,
   `Instructor`, plus the reserved `owner`; pass A T2). This plan writes no `defineRoles` and no
   grant-row migration.
3. **The `defineAccess` permission map** (pass A T3–T4), the single authority `resolveNavLayout`
   and `requireAccess` both read. **This plan's nav visibility derives entirely from that map.**
   The tree carries no `roles:` declarations of its own (they are deleted here, per the security
   model); a screen is visible iff the session's roles reach it in the map.

**The security-model rule this plan carries** (design's "Security model" section, Geoff's ruling
2026-07-18): moving an item between groups, relabeling it, or reordering it **changes no gate** —
the sidebar tree holds no access semantics. The only security-touching act in pass B is that
**every new screen is deny-by-default in the map**: the two new routes (Class waitlist, Email
class members) get their map entries added to pass A's `access` module in the same task that
creates them, or they are reachable by no one (cairn's `requireAccess` on the `/admin/club` layout
403s an unmatched-but-mapped-parent path per pass A's adoption). No task here widens a role; a task
that appears to need a new role has hit a spec gap and stops for Geoff.

## The 0.88.0 seams this pass consumes (each cited to the shipped package)

All four are from `@glw907/cairn-cms` `0.88.0`, `CHANGELOG.md`, the `0.88.0` "Added" entry —
verified present, not assumed. No task may name an API absent from that entry.

- **Default-collapsed groups.** "`NavLayoutSection` gains `collapsed?: boolean`, the group's
  declared starting state for a visitor with no persisted nav-collapse cookie (default `false`,
  today's behavior); the existing cookie still wins entirely once any header is touched." — T6.
- **Icon overrides + widened allowlist.** "`NavLayoutEngineRef` gains `icon?: AdminNavIcon`,
  overriding the engine-owned glyph for that door, and the bundled `AdminNavIcon`/
  `ADMIN_NAV_ICON_NAMES` allowlist widens from nine names to twenty-seven (the full working set
  surfaced by ASC's own declared sidebar)." — T6 (the Posts-vs-Bulletins newspaper collision is
  the exact case this override cures).
- **The `attention` dependency.** "A new `attention` dependency (`ContentRoutesDeps.attention`,
  `CairnAdminDeps.attention`), awaited once per request and never cached: a site returns
  `AttentionItem[]` (`href`, `count`, an optional `label`) and the shell renders a quiet
  pending-work pill on the matching visible nav entry, summed on a collapsed section's header,
  dropped at zero, and dropped entirely for an item whose `href` the current session cannot see (a
  count never leaks to a role that can't act on it)." — T7.
- **Nav visibility from the access map** (the `resolveNavLayout`/`canReach` derivation, shipped as
  the first `0.88.0` bullet's "the sidebar resolver all read"): pass A already wires it; this pass
  relies on it when it deletes the tree's own `roles:` gates.

Nothing here uses a seam beyond these four plus the pre-existing `NavLayout` types. `defineRoles`,
`defineAccess`, `requireAccess`, and `canReach` are pass A's surface, not re-declared here.

## Reviewer gates

- `svelte-reviewer` runs over the tree rewrite and the two new screens (T4, T5, T6).
- `web-auth-security-reviewer` runs over the map additions for the two new routes and the deleted
  `roles:` gates (T4, T5, T6), confirming deny-by-default holds and no role silently widened. It is
  the named security gate; its findings are triaged and applied (or explicitly declined with
  reasoning) before the pass closes.
- The standard mechanical gate (`npm run check` 0/0, `npm test`, `npm run build`) runs per task.
- `code-simplifier` runs over the changed code before each commit, per the workstation git
  convention.
- **Visual/e2e:** any task that alters admin-nav rendering regenerates the affected baselines via
  the `ci.yml` `update_snapshots` dispatch (`gh workflow run ci.yml -f update_snapshots=true`),
  never a local `--update-snapshots` run (CLAUDE.md's CI-canonical rule). T8 owns the whole-nav
  visual regen and the coherence read.

Each task commits its own diff (imperative conventional-commit subject, `Co-Authored-By: Claude
<noreply@anthropic.com>` footer, specific files). TSDoc/svelte comment standards apply
(ts-conventions, svelte-conventions); no em dashes in comments.

---

## T1 — The probe round (static HTML, verdicts owed)

Outcome: a static HTML probe of the full four-group sidebar at desktop (1440) and mobile (390)
widths in **both themes**, real Lucide glyphs (the 25-icon assignment from the design's "The tree"
tables), rendered per the standing probe-iteration process (`feedback_probe_iteration_process`
memory: HTML probe pages Geoff verdicts, full ceremony once per settle). Badge rendering and
collapsed-group header sums are shown with **placeholder counts** so the pill/sum treatment is
visible. The probe carries the design's proposal as the starting position and asks Geoff for the
three still-owed verdicts:

1. **Open/closed defaults** — Club only, or Club + Events & Classes (decision 2).
2. **The 25-icon assignment** — the per-item Lucide glyphs (decision 6 / "The tree" tables), each
   distinct, all within the widened `ADMIN_NAV_ICON_NAMES` set (verify each proposed name against
   the `0.88.0` allowlist of twenty-seven; a name outside it is a probe finding, not a silent
   substitution).
3. **Within-group order** — the item order inside each of the four groups.

Constraints: the probe is pure static HTML (no dev server, no cairn build); it does not wait on any
other task. It renders the **post-retirement** tree (no Signups, one Bulletins, the two new class
surfaces present) so the verdict is on the tree that ships, not the round-1 tree. The group
structure, membership, and labels are **already ratified** (design, "The tree" preamble) — the
probe does not reopen them; only defaults/icons/order are live questions.

Acceptance: the probe deck lives in the scratchpad; a one-line-per-probe arc log
(`docs/design-benchmark/sidebar-round-<N>-arc.md`, the education/directory/waivers arc-log pattern)
records each candidate and Geoff's verdict as they land. The three verdicts are recorded there and
distilled into `docs/design-benchmark/decisions.md` at settle (arc log then removed). **T6 consumes
the ratified icons, order, and defaults; T6 does not start until this settles.** No mechanical gate
(no repo code changes); the deliverable is the ratified verdicts.

## T2 — Retire the Signups screen fully

Outcome: the post-hoc signup review queue retires completely (decision 3: joins are automatic and
self-serve, the board is notified of every paid join by the existing `board_join_notice` email, so
the queue reviews nothing). Delete:

- the route `src/routes/admin/club/signups/` (`+page.server.ts`, `+page.svelte`),
- the store `src/admin-club/lib/signup-reviews-store.ts` and its `pendingSignupReviews`/resolution
  helpers,
- the tests `src/tests/signup-reviews-store.test.ts` and `src/tests/signups-actions.test.ts`,
- the Overview strip's pending-signup-reviews entry: `src/routes/admin/club/+page.server.ts` drops
  its `pendingSignupReviews` call and the `pendingSignups` field, and `+page.svelte` drops the
  matching card (the strip keeps asset requests and offers; T7 reshapes it to the three ruled
  attention sources).

Constraints: **the database table keeps its historical rows — no destructive migration** (decision
3). `signup_review_resolutions` (migration 0023) and any signup-review columns stay in `asc-club`
untouched; only the code that reads them retires. The `board_join_notice` email path is **not**
touched (it already covers the notification the retired queue duplicated) — confirm it still fires
on paid join and leave it. The round-1 `navLayout` still names a `Signups` entry
(`/admin/club/signups`); T6 removes it, but this task must leave the tree building green, so if
deleting the route breaks the round-1 nav's href-existence validation, either T2 also drops that
one nav entry or T2 lands immediately before T6 in one uninterrupted sequence — the implementer
reports which, and the mechanical gate is the proof.

Acceptance: no file references `signup-reviews-store`, `pendingSignupReviews`, or the signups route;
the Overview load and page render without the signup card; `board_join_notice` still fires on a paid
join (asserted by its existing test, unchanged); `npm run check` 0/0, `npm test`, `npm run build`
green.

## T3 — Re-unify bulletins; retire the notifications concept

Outcome: restore production's single-concept model (decision 4): `bulletins` is the one concept
carrying title, date, **body**, a **detail line**, and an **expiry**; the home banner reads the
**latest unexpired bulletin**; the invented `notifications` concept, its content entries, and its
read path fold away.

- **`bulletins` gains fields** in `src/theme/cairn.config.ts`: a detail-line field and an expiry
  date field, added to the existing `title`/`date` fieldset (match production's shape — a dated
  notice with a detail line and an expiry). The existing two migrated bulletin entries carry
  forward; new fields are optional where production treats them as optional so no existing entry
  breaks validation.
- **The home banner reads bulletins.** `src/theme/active-notification.ts`'s selection logic moves
  to read the latest unexpired **bulletin** (by date, expiry not passed), replacing the
  `notifications`-concept read. The pure, tested selector shape is preserved (injected `today`
  string, expiry-passed reads as inactive); its callers `src/routes/(site)/+page.server.ts` and
  `+page.svelte` rewire to the bulletins source. `parseBoldSegments` and the `NotificationStrip`
  banner component are reused as-is (they render a projected title/body, source-agnostic).
- **The `notifications` concept retires:** remove it from `cairn.config.ts`'s `content` block,
  delete `src/content/notifications/` and its two entries (their content folds into a bulletin
  where a live banner is still wanted — the test-banner entry is a fixture and simply goes),
  delete `src/theme/active-notification.ts`'s notifications-specific reader if the selector moves to
  a bulletins module, and delete `src/tests/active-notification.test.ts`'s notifications fixtures
  (re-pointed at bulletins). **Remove `notifications` from pass A's `access` map** in the same edit
  (pass A mapped it transiently for the pass-A window; it is now a dangling screen-id key that
  `defineAccess` will throw on at composition once the concept is gone).
- **No public URL retires:** `notifications` is `routing: 'embedded'` (verified — no public route
  under `src/routes` references it), so no redirect is owed. Confirm this in the task; if a public
  URL is found, add the redirect via `$theme/redirects.ts` (the notification-pages memory's
  pattern).
- **Regenerate the manifest and update the guards:** run `npm run cairn:manifest` after the content
  change; update the freeze-guard (`src/tests/document-freeze-guard.test.ts` is documents, not
  bulletins — the relevant guard is the fragment-integrity/manifest suite) and the
  `fragment-integrity.test.ts` expectations for the changed concept set.

Constraints: production is the reference for the bulletins shape (decision 4 names title/date/body/
detail-line/expiry) — do not invent fields beyond it. The banner's selection rule stays a pure
function of its inputs (the existing `activeNotification` contract), so it keeps its own unit test
proving the expiry boundary against a concrete date. Deny-by-default in the map is preserved: after
this task the map names `bulletins` (Communication roles, already pass A's), not `notifications`.

Acceptance: the home banner renders the latest unexpired bulletin (unit test against a concrete
`today`); `notifications` appears in no config, content dir, access map, or test; the manifest
regenerates clean; the freeze/integrity suites pass with the new concept set; `npm run check` 0/0,
`npm test`, `npm run build` green.

## T4 — The cross-class Class waitlist screen

Outcome: a new admin screen at `/admin/club/classes/waitlist` (a cross-class overview; waitlists
today live only inside each class's detail page, decision 9) listing every class's outstanding
waitlist state in one place — per class, its queued members, active offers with their expiry, and
freed seats with a waitlist behind them. It reuses the existing offer machinery
(`src/admin-club/lib/offers.ts`: `listOffersForClass`, `expireStaleOffers`, the `OfferRow` shape)
across all current-season classes; where a single cross-class query reads better than iterating
per class, add it to `offers.ts` beside `listOffersForClass` (a `listOutstandingOffers`-shaped
read), tested. The screen's load sweeps stale offers first (the per-class detail page's own
ordering) so counts are honest.

Constraints:
- **Deny-by-default in the map.** Add `/admin/club/classes/waitlist` (or rely on the
  `/admin/club` section key covering it) to pass A's `access` module: admitted roles
  `[Administrator, Club manager]` (the Events & Classes group's current roles; Instructor is future
  and stays out until class-management). Confirm `requireAccess` on the `/admin/club` layout guard
  covers the new child; a deeper key is only needed if this screen's roles differ from the section
  default (they do not).
- **The screen carries no new offer/write actions** — it is a read overview that links into each
  class's own detail page for the offer/cancel actions that already exist there. This keeps it a
  single-Sonnet task and adds no new authorization surface beyond the map entry.
- Data comes from the live tables (`class_offers`, waitlist rows), rendered both themes; ground any
  fixture in the real shape (the `ground_probes_in_real_data` memory).

Acceptance: the screen lists outstanding waitlist/offer state across current-season classes; the
new cross-class read (if added) is unit-tested; the map admits `[Administrator, Club manager]` and
denies the others at the route (a `web-auth-security-reviewer`-visible assertion or a `canReach`
unit spot-check); `npm run check` 0/0, `npm test`, `npm run build` green. Its e2e baseline is minted
with the rest of the nav visual regen in T8.

## T5 — The Email-class-members compose deep link

Outcome: a nav entry "Email class members" (Events & Classes group) that deep-links the existing
compose screen (`/admin/club/email/compose`) with the class segment **preselected** via a query
param (the segment vocabulary already carries `class:<id>` keys — `src/admin-club/lib/segments.ts`).
Compose reads the param on load and preselects the matching segment option; the operator lands on
compose with the class segment chosen, subject/body empty. Compose stays listed under Communication
as **Email** (decision 9) — this is a second door into the same screen, not a new screen.

Constraints:
- **The distinct URL satisfies the nav href-collision check** (decision 9): the nav entry's href
  is the compose path with the preselect param (e.g. `/admin/club/email/compose?segment=class`), a
  distinct string from the plain `Email` entry's href, so `resolveNavLayout`'s href-uniqueness
  validation passes while both resolve to the compose route. Verify the exact collision rule
  against `resolveNavLayout` (whether it compares full href strings including query, or paths); if
  it compares paths only, the entry needs a distinct path segment instead — the implementer reports
  which and adjusts.
- **The param preselects a segment, it does not bypass the two-step resolve.** Compose resolves the
  segment server-side on `review` and again on `send` from scratch (the existing security property,
  `compose/+page.server.ts` header) — the deep-link param only sets the initial picker value; it
  never short-circuits the server-side re-resolution. A param naming a non-existent segment falls
  back to no preselection (compose's existing empty-picker state), never an error.
- **No new map entry beyond compose's existing one.** The deep link resolves to
  `/admin/club/email/compose`, already mapped by pass A (Publisher-admitted). If the nav entry uses
  a distinct path, that path is added to the map matching compose's admitted set; if it uses a
  query param on the compose path, it inherits compose's mapping and no map change is owed. The
  implementer states which and, if a path, adds the deny-by-default entry.

Acceptance: the nav entry deep-links compose with the class segment preselected; a param naming a
missing segment renders the empty picker without error; the server-side re-resolve on review/send
is unchanged (its existing tests stay green); the nav builds without an href-collision throw;
`npm run check` 0/0, `npm test`, `npm run build` green.

## T6 — The navLayout rewrite: the ratified four-group tree

Outcome: `src/theme/cairn.config.ts`'s `navLayout` is rewritten to the design's ratified
four-group tree — **Club, Events & Classes, Communication, Website** — with the ratified labels,
the T1-verdicted icon assignment and within-group order, and the T1-verdicted collapsed defaults,
consuming the seams T6 owns:

- **The four groups and their members** are the design's "The tree" tables, as adjusted by the
  retirements and additions of T2–T5: Club (Overview, Members, Money, Committees, Assets, Asset
  requests, Waivers, Club settings, Admin access); Events & Classes (Events, Classes, Class
  waitlist, Email class members); Communication (Posts, Bulletins, Email, Announce); Website
  (Pages, Media, Fragments, Tags, Nav, Waiver text, Website settings, Help). No `Signups`, one
  `Bulletins`, no `notifications`.
- **The relabels** (decision 5): "Requests" → **Asset requests**; "Vocabulary"/`vocabulary` →
  **Tags**; "Site settings" → **Website settings**; the engine Editors screen → **Admin access**;
  the waivers rollup → **Waivers**; the documents concept editor → **Waiver text**; the "Site"
  group heading → **Website**. "Money" stays.
- **Collapsed defaults** via `NavLayoutSection.collapsed` (`0.88.0`): Club open (`collapsed:
  false`, or omitted since `false` is the default), the other groups per the T1 verdict (Events &
  Classes possibly also open). The declaration only seeds the starting state; the existing cookie
  wins once a header is touched — do not touch the shell's cookie logic.
- **Icon overrides for engine refs** via `NavLayoutEngineRef.icon` (`0.88.0`): the two dated
  concepts (Posts, Bulletins) otherwise share the engine's newspaper glyph
  (`ENGINE_CONCEPT_DATED_ICON`); Bulletins takes `bell` as an `icon:` override on its `{ screen:
  'bulletins' }` ref so Posts and Bulletins render distinct. Any other engine-owned glyph collision
  the T1 assignment surfaces is resolved the same way. Every icon name used validates against the
  widened `ADMIN_NAV_ICON_NAMES` allowlist (`0.88.0`).
- **Drop all group-level roles gating** (security model point 3): remove every `roles:` declaration
  from nav groups and entries (round 1's `CLUB_ROLES` on sections and the Club-settings entry).
  Visibility now derives from pass A's access map through `resolveNavLayout`/`canReach` — an entry
  renders iff the session reaches its function, a group renders iff it has a visible child. Do not
  add a single `roles:` back; a case that seems to need one is a map gap (pass A's map), reported,
  not patched in the tree.

Constraints:
- **Depends on T1's ratified verdicts** (icons, order, defaults) and on T2–T5 having landed (the
  tree references their final screen set). It is the integration point, sequenced after them.
- **No gate changes** (security model): this is a pure regrouping/relabel/reorder plus the two
  additive seams; it declares no access semantics. `web-auth-security-reviewer` confirms the
  deleted `roles:` gates leave enforcement intact (the map, not the tree, is the boundary) and that
  no visibility widened.
- **`CLUB_ROLES`'s last nav readers go away** here (pass A left it exported for these hints); if
  nothing else reads it after this task, note it for retirement (a DX-harvest/cleanup follow-up,
  not a T6 deletion unless trivially safe).
- The design states "25 items, 25 distinct icons" — assert the final tree has no repeated glyph
  (a small test over the resolved layout, or the `resolveNavLayout` validation if it enforces
  uniqueness).

Acceptance: `nav-layout.test.ts` proves the four-group tree through `resolveNavLayout` — the groups,
labels, order, and collapsed defaults match the T1 verdict; every icon is distinct and in the
allowlist; no `roles:` remains on any group or entry; visibility derives from the map (a
Webmaster-shaped session resolves Website + no Communication, a Publisher resolves Communication +
no Website, driven off pass A's `access`, not a hand table). `npm run check` 0/0, `npm test`, `npm
run build` green.

## T7 — Wire the attention badges to the three ruled sources

Outcome: the site supplies the `attention` dependency (`0.88.0`: `CairnAdminDeps.attention` /
`ContentRoutesDeps.attention`, returning `AttentionItem[]` of `{ href, count, label? }`) from its
admin layout load, so the shell paints a quiet pending-work pill on the matching visible nav entry
and a summed count on a collapsed group's header. The three ruled sources (decision 7):

1. **Asset requests** — pending asset requests (`listPendingAssetRequests`, the Overview strip's
   existing query), `href: /admin/club/asset-requests`.
2. **Committees** — pending committee join requests (`src/admin-club/lib/committees-store.ts`'s
   pending-request read from the directory pass), `href: /admin/club/committees`.
3. **Class waitlist** — offers nearing expiry and freed seats with a waitlist behind them (the
   Overview strip's `offersNearExpiry` query plus T4's cross-class read), `href:
   /admin/club/classes/waitlist`.

**These share the Overview strip's queries** (decision 7: "Counts share the Overview
needs-attention strip's sources so the two never disagree"). Reshape
`src/routes/admin/club/+page.server.ts` so the strip and the `attention` provider read the same
three query results — one source of truth, consumed twice. The Overview strip's cards become these
three (its signup card already retired in T2).

Constraints:
- **Role-scoped by construction** (`0.88.0`: the shell drops any item whose `href` the session
  cannot see; consumer brief seam 3: "a count never leaks to a role that can't act on it"). The
  provider returns items per session; the shell's own visibility filter handles the coarse role
  drop, but the counts themselves must be computed per session, never once-and-shared. Committee
  join requests carry the finer scope the directory pass already enforces server-side: a committee
  chair sees only their own committee's pending requests (the T6b predicates), so the committee
  count is resolved against the session's chair scope, not a club-wide total, for a chair session.
  The minimum bar is role-scoped; the committee finer-scope matches the existing predicate.
- **Zero renders nothing** (`0.88.0`): an item at count 0 is omitted; the provider returns only
  nonzero items, or the shell drops zeros — verify which the shell expects and match it.
- **Items with status but no admin action get no badge** (decision 7): Money, Email, content
  screens, and the Waivers rollup carry no `attention` item. Only the three actionable queues do.
- **Announced accessibly** (`0.88.0`): the shell owns the screen-reader text; the site's job is
  correct per-href counts. Do not hand-roll a pill — the shell renders it from the dependency.

Acceptance: the three actionable nav entries show pills at nonzero count; a collapsed group's header
sums its children's pending counts; a session that cannot reach a queue sees no count for it (a
chair sees only their committee's pending, a non-chair club role sees the full committee count, per
the T6b scope); the Overview strip and the badges read the same query results (a test that the two
never disagree); `npm run check` 0/0, `npm test`, `npm run build` green.

## T8 — Closing gates: coherence read, visual regen, walkthrough

Outcome: the pass's closing quality gates, per the resolved-craft bar and the family one-check/
visual-fidelity doctrine:

- **Fresh-context whole-sidebar coherence read** at 390 and 1440 in both themes (the standing
  `designed_not_assembled` gate: "would an expert see assembly tells?"), run by a context that did
  not build the tree. It reads the four groups, the collapsed defaults, the icon set, the badges at
  real counts, and the register of the labels. Findings triaged and applied; the verdict recorded
  in `docs/design-benchmark/ledger.md` (a verdict stands unless the graded code changes or Geoff
  reopens it).
- **Visual baseline regen** for the admin-nav change: regenerate the affected e2e baselines via the
  `ci.yml` `update_snapshots` dispatch (`gh workflow run ci.yml -f update_snapshots=true`), read the
  run log (not its conclusion), and confirm the committed PNGs are the CI-rendered ones — never a
  local `--update-snapshots` run (CLAUDE.md's CI-canonical rule; the `reference_visual_baselines`
  memory). New screens (Class waitlist) and the reshaped Overview strip get their baselines minted
  in the same dispatch.
- **`web-auth-security-reviewer`** over the whole pass diff (the map additions for the two new
  routes, the deleted `roles:` gates, the deny-by-default assertions), findings resolved.
- **The mechanical gate green** across the pass (`check` 0/0, `test`, `build`), and the pass ships
  to dev on push to `main` (a dev deploy, not the apex — the deploy story's rule).
- **Geoff's walkthrough is the acceptance gate** (design: "The acceptance gate is Geoff's
  walkthrough"): the before/after on dev of the admin sidebar per role — the four groups, the
  collapsed defaults, the badges, the two new class surfaces, the retired Signups and unified
  Bulletins. The apex is untouched; nothing cuts over on this pass.

Constraints: the coherence read is a fresh context, never the session that built the tree (the
`designed_not_assembled` and `visual-fidelity` rule: the context that built the UI never grades
it). The visual regen is CI-canonical only. Geoff's walkthrough gates before any thought of apex
cutover, which is a separate deliberate act outside this plan.

Acceptance: the coherence verdict recorded in the ledger with findings applied; the e2e baselines
regenerated via the CI dispatch and green on the next CI run; `web-auth-security-reviewer` findings
resolved; the full mechanical gate green; STATUS updated to point at Geoff's walkthrough as the open
gate. Geoff's walkthrough is his to run; the pass is build-complete when the gates above are green
and the walkthrough is queued.

## Sequencing

1. **T1 (probe round)** — first, static HTML, waits on nothing; produces the ratified icons, order,
   and defaults T6 needs.
2. **T2 (Signups retirement)**, **T3 (bulletins re-unification)** — independent of each other and of
   T1; each removes a surface the final tree must not reference.
3. **T4 (Class waitlist screen)**, **T5 (Email class members deep link)** — the two new surfaces the
   final tree references; each adds its deny-by-default map entry.
4. **T6 (navLayout rewrite)** — the integration point, after T1's verdicts and T2–T5's screen set.
5. **T7 (attention badges)** — after T6 (the entries the badges attach to must exist) and after T2
   (the Overview strip reshape).
6. **T8 (closing gates)** — last: coherence read, CI visual regen, security review, walkthrough
   queued.

One executor in the worktree at a time (the workstation one-executor rule); each task's diff
reviewed and the full gate confirmed before the next dispatch, per the plan-execution doctrine.
