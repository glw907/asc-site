# Pass 2.1: the asc-club substrate + events/classes admin

> **For agentic workers:** execute task-by-task via `cairn-implementer`/`site-implementer`
> dispatches with main-loop review between tasks (same-session orchestrate-and-verify).
> Steps use checkbox syntax for tracking.

**Goal:** Events and classes move from ops into cairn's admin as custom screens over the new
`asc-club` D1, with the club-role authorization layer, the class-waitlist offer machine, and the
public class forms — the extension seam's first production test.

**Architecture:** The two-database strategy: `asc-club` is created fresh from the ratified DDL
(`cairn-cms/docs/superpowers/specs/assets/phase-2-reference/asc-club-schema.sql`); `asc-ops` is
never altered. Old data arrives through verified import scripts. The site's reads repoint at
cutover; rollback is repointing back. The admin screens are the club-admin scaffold (merged,
`5549d19`) swapped onto the engine's Part C seams (merged at cairn `69a2908`) and onto live D1.

**Tech stack:** SvelteKit 2 + Svelte 5, `@glw907/cairn-cms` ^0.82.0 (the Part C surface),
Cloudflare D1/Workers, DaisyUI v5 in the cairn admin idiom, Vitest + Playwright.

## Global constraints

- **The audit convention is sacred:** every write path emits through `adminAction`'s required
  audit emit (engine seam) or the public form's attributed insert; no unaudited mutation.
- **asc-ops is NEVER altered** (read-only import evidence). The ops 410 retirement is PREPARED
  but HELD for Geoff's go (his 2026-07-07 ruling).
- **Migration discipline:** every asc-club migration and import script ships four files —
  forward, verify (expected counts), rollback, reader-note — per
  `specs/assets/phase-2-reference/events-migration-pattern.md`.
- **Lean data (Geoff, 2026-07-07):** one email + one phone per member (E.164, +1 default
  region); no fields the club doesn't use.
- **Instructor is a ROLE** (member-level) plus per-class assignment; the member-facing roster
  view is 2.2's (needs member auth) — 2.1 lands the data + admin side only.
- **Class-vs-asset waitlists are STRUCTURALLY distinct; never generalize them.**
- **Defaults ruled 2026-07-07:** offer window 72h (a `settings` row); club roles seeded with
  Geoff's email as club owner only.
- **Public pages meet the five-viewport bar** (320/390/768/1440/2560, composed at extremes).
- **Comments:** TSDoc / `@component`; em dash banned in comments. **Gate:** `npm run check`
  0/0 and `npm test` exit 0 (site repo), full cairn gate for the engine task; bare exit codes.
- **Repo roles:** Task 0 in `~/Projects/cairn-cms`; all others in `~/Projects/aksailingclub-org`.

---

### Task 0: engine seam — per-request adminNav filtering (cairn-cms)

**Why:** The design suite's open question 6, now answered by inspection: `filterNavByRole`
filters by cairn's own role only, so a site cannot hide its Club section from a content editor
who lacks a club role (the section would tease, then 403). Additive seam, rides 0.82.0.

**Files:** modify `src/lib/sveltekit/content-routes-context.ts` (deps),
`src/lib/sveltekit/content-routes-core.ts` (shell assembly); test
`src/tests/unit/admin-nav.test.ts` (or a new unit file); docs rider
`docs/reference/sveltekit.md`; `CHANGELOG.md` under `## Unreleased`.

**Interfaces (produces):** `ContentRoutesDeps.navFilter?: (items: ResolvedNavItem[], ctx:
{ editor: Editor; event: ContentEvent }) => ResolvedNavItem[] | Promise<ResolvedNavItem[]>`.
Applied AFTER the engine's own role filter, only to the customNav portion, on every shell
payload build. The engine never caches its result across requests.

**Acceptance:**
- [ ] Unit tests: default (no filter) behavior unchanged; a filter that empties a section
      hides it; an async filter resolves; the filter never receives built-in entries.
- [ ] `check:reference` passes with the documented export; CHANGELOG entry states "additive,
      no consumer action".
- [ ] Full cairn gate green; commit on `main`.

### Task 0b: cut and publish 0.82.0 (cairn-cms; the consumer-needs-it trigger, Geoff-authorized)

- [ ] Via the `cairn-release` skill: verify the number free (`npm view @glw907/cairn-cms
      versions --json`), finalize the `## Unreleased` window (ports/chassis + Part C + Task 0),
      `gh release create v0.82.0 --target main`, watch the OIDC publish to done, verify the
      registry serves it.

### Task 1: the asc-club database + migration 0001 (substrate + events/classes domain)

**Files:** create `migrations/asc-club/0001_substrate/` (forward.sql, verify.sql, rollback.sql,
README.md); modify `wrangler.toml` (new binding `CLUB_DB` → database `asc-club`); modify
`docs/STATUS.md`.

**Scope:** create the D1 database `asc-club` (Cloudflare MCP or wrangler; record the id in
wrangler.toml). Migration 0001 lands the 2.1-needed subset of the ratified DDL verbatim in
structure: `events`, `classes`, `class_instructors`, `class_enrollments`, `class_waitlist`,
`class_offers`, `club_roles`, `settings`, `audit_log`. (Member-domain tables are 2.2's
migration; do not land them here.) Seed rows: `settings(current_season)` from ops's live
season; `settings(offer_window_hours)=72`; `club_roles` row for `geoff-login@907.life` as
`owner`.

**Acceptance:**
- [ ] verify.sql returns the expected table list + seed counts; rollback.sql drops cleanly
      (proven on a scratch database first, per the migration pattern).
- [ ] `wrangler d1 execute asc-club --remote --file migrations/asc-club/0001_substrate/verify.sql`
      output pasted into the task report; gate green; commit.

### Task 2: the ops import scripts (12 events, 5 classes)

**Files:** create `scripts/import/ops-events.mjs`, `scripts/import/ops-classes.mjs`, plus each
one's verify + rollback + README per the four-file discipline (a script's verify = count and
spot-check queries against asc-club; rollback = scoped DELETEs by import batch id).

**Scope:** read from `asc-ops` (read-only; the existing EVENTS_DB credentials path), transform
to the asc-club shapes (the category model from day one; type-vs-registration-status per the
events manifest), write to `asc-club`. Idempotent: a re-run upserts, never duplicates (import
batch id column or natural-key upsert).

**Acceptance:**
- [ ] Verify counts: 12 events, 5 classes, exact-match spot checks (titles, dates, categories)
      pasted in the report; re-run proves idempotence (counts unchanged); gate green; commit.

### Task 3: swap the club-admin stand-ins onto 0.82.0's engine seams

**Files:** modify `package.json` (dependency `^0.82.0`), the five screens under
`src/routes/admin/club/`, `src/admin-club/lib/` (delete `adminAction.ts`, `OfficeList.svelte`,
`fields/` + `fields.ts` stand-ins; keep `ui.ts`, `member-format.ts`, `demo-members.ts`);
`svelte.config.js` untouched.

**Scope:** imports move to `@glw907/cairn-cms/sveltekit` (`adminAction` — NOTE the engine shape
is a HANDLER WRAPPER: `adminAction(async ({ event, form, ctx }) => …)`, it reads formData
itself and hands it in; the stand-in's `const {editor,audit} = adminAction(event)` shape must
be rewritten per action), `@glw907/cairn-cms/components` (`OfficeList`), and
`@glw907/cairn-cms/admin-fields` (`SelectField`, `TextField`, `FieldLabel`). The Club nav
entries become one `AdminNavSection` (`{ label: 'Club', children: […] }`) in the adapter's
`adminNav`.

**Acceptance:**
- [ ] Zero imports remain from the deleted stand-in files (grep proves it); the signups queue's
      audit emits still carry action/entity/entityId; all existing club tests pass rewritten
      against the engine shapes; gate green; commit.

### Task 4: the club-role authorization layer

**Files:** create `src/routes/admin/club/+layout.server.ts` (the club-role guard); create
`src/admin-club/lib/club-roles.ts` (D1 read: `getClubRole(db, email)`); modify the adapter's
cairn config (the new `navFilter` dep hides the Club section for editors without a club role);
create `src/routes/admin/club/settings/+page.server.ts` + `+page.svelte` (the Club settings
screen: role management + the offer-window setting, writes through `adminAction`); tests.

**Interfaces (produces):** `getClubRole(db: D1Database, email: string): Promise<'owner' |
'admin' | null>`; the layout guard throws a clean 403 (`error(403, …)`) for a signed-in editor
without a club role; content-role semantics unchanged elsewhere.

**Acceptance:**
- [ ] Tests: no club role → 403 on /admin/club/* loads AND hidden Club nav; club admin sees
      Club but the rollover-class destructive settings require owner; every settings write
      audited. Gate green; commit.

### Task 5: events admin on live asc-club

**Files:** modify `src/routes/admin/club/events/**` (list + detail/edit on `CLUB_DB` instead of
`demo` data); create `src/admin-club/lib/events-store.ts` (typed D1 reads/writes); tests
(happy-path CRUD + audit emission per write, D1 via miniflare/betterthan-mock per the repo's
existing pattern).

**Scope:** the office-list triage table (date, title, type chip, visibility, edited-by) per the
ratified mockups; create/edit in the admin field idiom; every write through `adminAction` with
`entity: 'event'`. R2 image fields defer to the media-library picker seam ONLY if the scaffold
already stubbed it; otherwise keep the image reference read-only this pass (note in report).

**Acceptance:**
- [ ] CRUD round-trip against local D1 in tests; the 12 imported events render; audit rows
      appear per mutation; gate green; commit.

### Task 6: classes admin: caps, derived fullness, instructor assignment

**Files:** modify `src/routes/admin/club/classes/**`; create `src/admin-club/lib/classes-store.ts`;
tests.

**Scope:** capacity is a column; fullness DERIVES from `count(class_enrollments) >= capacity`
(no hand-flipped flag anywhere); the detail screen assigns instructors (members holding the
instructor role; `class_instructors` rows) and shows the roster + waitlist counts. Writes
audited (`entity: 'class'`, `'assignment'`).

**Acceptance:**
- [ ] Tests: fullness flips exactly at cap; unassigning an instructor removes only the
      assignment row; audits per write. Gate green; commit.

### Task 7: the class-waitlist offer state machine

**Files:** create `src/admin-club/lib/offers.ts` (the machine + token mint/verify against D1);
modify the classes/waitlist admin screens (the one-click "offer next" action + offer status
chips); tests (the machine's full transition table).

**Interfaces (produces):** offer states `offered → claimed | expired | declined`; a single-use,
expiring, person-and-class-bound token row (the magic-link discipline: hashed token, expiry =
`settings.offer_window_hours`, single-use consume). `claimOffer(db, token)` returns the
enrollment context for the signup flow; expiry/decline frees the spot (the next offer is again
admin-triggered, never automatic).

**Acceptance:**
- [ ] Transition-table tests including: expired token refuses claim; a second claim of a
      consumed token refuses; decline frees exactly one spot; every transition audited. Gate
      green; commit.

### Task 8: the public class signup/waitlist forms

**Files:** create the public routes/islands for class signup + waitlist joining (Turnstile-gated
like the donate form, graceful no-secret degradation); create `src/admin-club/lib/enrollments.ts`
(insert paths shared with Task 7's claim flow); tests + the five-viewport check on the new
public surfaces.

**Scope:** an open class accepts a signup (into `class_enrollments`, status per the schema); a
full class offers the waitlist join; both write attributed rows (name/email, the public-form
actor convention in `audit_log`). NO payment in this pass (class fees ride 2.2's payment
consolidation; the form records intent + the education page's existing pay-later reality).
Credit redemption is 2.2's (needs member auth); the form copy says what happens next honestly.

**Acceptance:**
- [ ] E2E: submit → row lands → admin queue shows it; full class routes to waitlist; Turnstile
      degraded mode still submits in dev. Five-viewport composure on the new pages. Gate green;
      commit.

### Task 9: the dev cutover (repoint reads; PREPARE the ops 410, HELD)

**Files:** modify the site's events/season read path (`$theme/events-data.ts` sources from
`CLUB_DB`); keep `EVENTS_DB` binding present-but-unused pending Geoff's go (the reader-note
documents the rollback = repoint back); create (UNDEPLOYED) the ops 410 patch as
`docs/plans/assets/ops-events-410.patch` in aksailingclub-legacy form; regenerate affected e2e
baselines.

**Acceptance:**
- [ ] dev.aksailingclub.org/events renders the same listing from asc-club (my full-page read,
      the one-check rule); the events e2e suite green against the new source; `.ics` feed still
      serves; commit + push fires the dev deploy; post-deploy crawl + render read.

### Task 10: pass close

- [ ] Docs riders: `docs/club-admin-scaffold.md` updated to the engine-seam reality;
      `docs/STATUS.md` rolls; the harvest note (engine frictions found this pass → cairn's
      pre-beta-harvest or ROADMAP; the add-a-custom-admin-screen guide's pending-example note
      flips once the swap lands as the worked example).
- [ ] `code-simplifier` over the pass's changed site code; reviewer fan-out
      (svelte-reviewer, cloudflare-workers-reviewer, web-auth-security-reviewer on Tasks 4/7/8);
      findings triaged and folded.
- [ ] Full gate + push at the boundary.

## Self-review notes

- Spec coverage: suite 2.1 scope = events/classes admin (T5/T6), substrate (T1), imports (T2),
  waitlists both halves (T7 admin + T8 public), caps/offers (T6/T7), instructor data side (T6;
  roster VIEW deferred to 2.2 per member-auth dependency, named in constraints), access tiers
  (T4), cutover + 410-held (T9), seam swap (T0/T3). Acceptance line "volunteers manage
  events/classes in cairn's admin; the season/events pages read the same D1; audit carried" =
  T5/T6/T9; the 410 acceptance item is deliberately deferred by Geoff's hold.
- The credit-redemption and payment halves of class signup are 2.2 scope by ruling (no MW
  port; member auth first); T8's copy handles the interim honestly.
- Type consistency: `CLUB_DB` binding name used in T1/T5/T6/T9; `adminAction` engine shape
  stated once in T3 and consumed by T5-T8.
