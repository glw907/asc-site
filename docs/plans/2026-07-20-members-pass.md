# Members pass implementation plan

> Executes `docs/2026-07-20-members-pass-design.md` (the first `admin-screen-passes`
> pass). Kit-first: the toolkit components come before the screen, each with its own
> contract, tests, and probe page; the screen then assembles them. Per workstation
> doctrine, tasks specify outcomes, constraints, and acceptance criteria — never
> implementation code. Orchestrate-and-verify: each task dispatches to the
> site-implementer (Sonnet), the conductor reviews the diff and confirms the gate
> before the next dispatch.

**Goal:** the redesigned Members screen on the new standing vocabulary, assembled
from the first six general-contract toolkit components.

**Architecture:** a cairn safelist change unblocks the daisy vocabulary; a real
asc-club migration records the Former transition; the toolkit components are born
general in `src/admin-club/toolkit/`; the screen rebuild is the components' first
consumer and their test.

## Global constraints

- Survey verdicts bind: `docs/2026-07-20-admin-toolkit-research-survey.md` (density
  doctrine, action discipline, copy register, formatters, the daisy assemblies).
- Component contracts are general-purpose, never ASC-shaped (spec's toolkit
  section); daisyUI-first, no new CSS systems.
- Stay upgrade-friendly to daisyUI (Geoff, 2026-07-20): components compose daisy
  class names and semantics as-is — never fork or copy daisy CSS, never restyle
  daisy internals (the @layer lesson stands); each toolkit component's README
  entry lists the exact daisy classes it leans on, so a daisy upgrade's blast
  radius is grep-auditable. The safelist (Task 1) is the one compile-side seam.
- Overdue retains full member benefits everywhere; only Former loses them.
- No `roles:`-style regressions: access derives from the existing map; any new
  admin action is audited through the existing audit sink.
- Gate per task: `npm run check` 0/0, `npm test`, `npm run build`. Visual baselines
  regenerate ONLY via the ci.yml `update_snapshots` dispatch.
- Member-facing copy honors the copy register; admin copy follows the Microsoft
  register (editor.md).

---

### Task 1: cairn daisy blessed-set safelist (cairn-cms repo)

**Files:** cairn-cms's admin CSS build inputs (locate the Tailwind source scan for
`cairn-admin.css`); a new safelist source enumerating the blessed classes;
CHANGELOG. Then this repo: `package.json` dependency bump after release.

**Outcome:** the compiled `cairn-admin.css` contains `table-zebra`, `table-xs`,
the `stats`/`stat-*` family, `toast`, and `indicator` (the survey's toolkit
vocabulary currently tree-shaken out), so site-authored admin markup can use them.

**Constraints:** one-executor rule — verify no live cairn session/executor
(`pgrep -f cairn-cms`, warm `git status`, cairn's STATUS) before touching that
repo; stand down and flag if found. The safelist is a documented source file (the
harvest's "class-inventory gap" finding), not a build flag nobody can audit. Ship
via the cairn-release skill (patch or minor per its rules).

**Acceptance:** grep of the freshly built `cairn-admin.css` shows every blessed
class; ASC's dep range picks up the release; `npm run build` here compiles green;
a scratch admin page using `table-zebra` renders striped locally.

### Task 2: the standing data tier — Former recorded, grace retired

**Files:** Create `migrations/asc-club/0033_member_standing/` (migration +
rollback + verify.sql). Modify `src/member-auth/lib/standing.ts`,
`src/jobs/renewal-reminders.ts`, `src/admin-club/lib/club-settings.ts`. Tests:
`src/tests/member-standing.test.ts` plus a new job-sweep test.

**Interfaces produced:** `MemberStandingStatus = 'current' | 'overdue' | 'former'`
(household standing keeps `'none'` for never-paid households; its display copy
settles at the probe round); a single exported classifier all consumers call; the
household columns recording the transition (`former_at` timestamp plus a
source/override marker distinguishing sequence-driven from manual).

**Outcome:** Former is a recorded state: the daily renewal-reminders job gains a
sweep that marks any household whose renewal boundary plus 30 days has passed
unpaid (covering both the sent `30_after` touch and the staleness-window-expired
case, so imported/dormant households transition too); payment clears it; the
backfill classifies the existing live households once. `renewal_grace_days` and
the `'grace'` status are removed at the source.

**Constraints:** the boundary is the household's own rolling `paid_at` + 1 year
(`renewalExpiryFrom`) — never a season line. The sweep is idempotent (a re-run
changes nothing). Migration is scratch-proven, then applied to live asc-club with
verify.sql counts reported.

**Acceptance:** unit tests cover current→overdue at the boundary, overdue→former
at boundary+30 via both paths, payment clearing Former, manual set/clear, and
re-run idempotency; the live backfill's former/overdue/current/none counts are
reported and spot-checked against known households (e.g. "Lapsed — last 2024"
rows from the walkthrough become Former).

### Task 3: the consumer sweep and the desk override

**Files:** Modify `src/admin-club/lib/segments.ts`, `member-format.ts`,
`households-store.ts`, `money-store.ts`, `src/member-portal/lib/portal-state.ts`,
`src/member-portal/lib/directory.ts`, the class-door gates
(`src/theme/class-signup-form.ts`, `src/routes/(site)/classes/[id]/signup/`),
`src/routes/(site)/my-account/renew/`, the household desk
(`src/routes/admin/club/members/[id]/`). Tests: every touched module's existing
test file.

**Outcome:** every "current including grace" site maps to Current + Overdue;
chips, segments, portal prompts, and the class door speak the three-state
vocabulary; the household desk gains the manual Former set/clear (both
directions, audited, with a one-line reason field).

**Constraints:** benefits rule verbatim — Overdue passes every member gate that
Current passes; only Former is excluded. Email segment names change copy only
where the vocabulary leaks to screen text. No screen redesign in this task; the
desk action uses existing desk idioms (restyle comes with the toolkit later).

**Acceptance:** grep proves `'grace'` and `renewal_grace_days` are gone from
`src/`; the class door and portal tests assert an Overdue household passes and a
Former one is redirected to renew; the audit sink records the manual override
with actor and reason.

### Task 4: toolkit — formatters, StatusChip, Pagination

**Files:** Create `src/admin-club/toolkit/format.ts`, `StatusChip.svelte`,
`Pagination.svelte`, plus `src/admin-club/toolkit/README.md` (the toolkit's
contract doc: what each component owes, its daisy assembly, its survey citation).
Tests: `src/tests/toolkit-format.test.ts`, `src/tests/toolkit-components.test.ts`.
Probe: a probe page rendering all three with live-shaped data, per the
design-refinement probe idiom (async Geoff verdict; build continues).

**Interfaces produced:** `formatMoney` (cents in, separators out), the civil-date
and Anchorage-timestamp formatters, `ageFromBirthdate`; StatusChip's props (full
tone vocabulary neutral/info/success/warning/danger, size, optional legend hook)
with the standing mapping defined by the consumer, not the chip; Pagination's
props (page, pageCount, item-count line).

**Outcome:** the three smallest toolkit citizens exist with general contracts:
StatusChip owns padding, truncation, and min-width (the chip-overflow kill);
Pagination is the `join`+`btn` assembly; the formatters end the `$30044` and
"4:00 PM" artifacts wherever the pass touches.

**Constraints:** general contracts per the spec — the standing vocabulary is
StatusChip's first client, not its ceiling. TSDoc per ts-conventions; Svelte
`@component` blocks per svelte-conventions.

**Acceptance:** unit tests cover the formatter edge cases (zero, negative/refund,
DST-boundary dates, birthdate-today ages) and chip truncation; the probe page
renders both themes; check/test/build green.

### Task 5: toolkit — AdminTable and ExpandableRow

**Files:** Create `src/admin-club/toolkit/AdminTable.svelte`,
`ExpandableRow.svelte`; extend the toolkit README. Tests:
`src/tests/toolkit-table.test.ts`. Probe: table probe with realistic multi-member
household rows at both densities, zebra on/off, expanded and empty states.

**Interfaces produced:** AdminTable's slots/props — named density tiers
(`xs`/`sm`), zebra option, header cells, an empty-state slot, headroom for a
future selection column (a reserved leading-cell convention, not a built
feature); ExpandableRow's contract — one expanded row at a time, expand region
receives the row's datum, keyboard and ARIA per the daisy/a11y reviewer's bar.

**Outcome:** the table family exists: compact single-line rows by construction
(the density doctrine's machine form), the empty-state slot per the
table-owns-it convention, expand-in-place that Classes later inherits for
rosters.

**Constraints:** assemble from daisy `table` classes shipped in Task 1; no
bespoke row CSS beyond spacing tokens; single-line enforcement is a contract
(cells truncate, never wrap) stated in the README.

**Acceptance:** component tests cover expand/collapse (mouse + keyboard), the
empty slot, and density switching; the probe page shows a 10-row live-shaped
roster in under the current screen's half height at `sm`; check/test/build green.

### Task 6: toolkit — ListToolbar

**Files:** Create `src/admin-club/toolkit/ListToolbar.svelte`; extend the README.
Tests: `src/tests/toolkit-toolbar.test.ts`. Probe: toolbar probe with the Members
filter set and a synthetic overflow case.

**Interfaces produced:** slots/props for search (with autofocus contract),
promoted filters, an overflow disclosure (present in the contract even though
Members promotes only four), the primary action, applied-filter pills with
remove, and the scope-stating count line.

**Outcome:** the designed toolbar band that kills the "cluttered / thrown
together" cluster; applied filters are visible, removable state; the count line
always states its scope.

**Constraints:** one primary action, right-aligned; filter pills follow the
action-discipline standard (neutral, not alarm colors); the count-line copy
pattern ("N households · filter · filter") is part of the contract doc.

**Acceptance:** tests cover pill add/remove round-trips and the count-line
scope string; probe renders at 390 and 1440 without wrap chaos; check/test/build
green.

### Task 7: the Members screen rebuild

**Files:** Modify `src/routes/admin/club/members/+page.server.ts`,
`+page.svelte`, `src/admin-club/lib/households-store.ts` (row query: search
across member names, standing, phone, plus the panel aggregation — contacts,
members with `birthdate`-derived ages and primary flag, holdings with paid
state, enrollments with paid status). Tests: `src/tests/households-store.test.ts`
plus the route's test. E2e: the members visual spec updates.

**Interfaces consumed:** every Task 4–6 component; Task 2's classifier.

**Outcome:** the spec's screen: search-first household rows (cursor in search on
open, matches any member's name and highlights it), default scope Current +
Overdue with Former behind the standing filter and archived behind the toggle,
promoted filters (standing, holdings, role/instructor, class — current-season
classes only), compact zebra rows (household, members primary-first, standing
chip, phone — no city, no star, no "Tier & Amount"), expand-in-place household
panel with the full mid-call picture and exactly three actions (Open household,
Email household, Add member).

**Constraints:** panel money facts are read-only (desk owns money actions); the
panel's Email action deep-links compose scoped to the household; Add member
lands on the desk's add flow with household preselected; pagination bounds the
list. The screen renders entirely from toolkit components plus layout — any
styling need that leaks outside them is a toolkit gap to fix in the toolkit,
not patch in the route.

**Acceptance:** the spec's acceptance criteria for the screen, verified against
the live-data local replica (walkthrough harness); single-line rows hold at 1440
with the real multi-member households; search "Sara"-class scenarios reach the
panel with zero navigations; e2e green.

### Task 8: pass close — gates, reviews, records

**Files:** `docs/STATUS.md`, `ROADMAP.md`, `docs/design-benchmark/decisions.md`
(the brainstorm's rulings distilled), `docs/design-benchmark/ledger.md` (coherence
verdict), a harvest-findings note for the cairn-bound components.

**Outcome:** the pass lands whole: reviewer fan-out (svelte-reviewer +
daisyui-a11y-reviewer on the components and screen; web-auth-security-reviewer on
the standing/gate changes), `scripts/design-probe.mjs` green, CI-canonical
baseline regen via the ci.yml dispatch (log read, not just conclusion), a
fresh-context whole-page coherence read at 390/1440, Geoff's before/after queued
for dev, both-budget scoring recorded.

**Constraints:** code-simplifier runs over the pass's code before the close
commit; probe verdicts still open at close are recorded as open in decisions.md,
never silently resolved.

**Acceptance:** all reviewers clean or findings dispositioned; STATUS's top entry
carries the pass accounting and the next action (Classes or Assets brainstorm);
the harvest note names which contracts are ready for cairn and which need a
second consumer first. The harvest note also files the **daisy absorption
process** as a cairn engine item (Geoff's ruling): cairn owns the daisyUI
dependency for admin surfaces, so cairn gets a scheduled update ritual —
automated bump PRs (Dependabot/Renovate on `daisyui`), and a documented cadence
per release: read the daisy changelog, rebuild, verify the blessed-set classes
still compile, run the visual suite, and note new daisy components worth
adopting into the toolkit. The toolkit READMEs' per-component class inventories
are the audit surface that makes each upgrade's blast radius mechanical to
check.

---

## Self-review notes

Spec coverage: vocabulary/migration (T2–T3), screen composition and panel
(T7), kit-first general contracts (T4–T6), safelist-first (T1), acceptance
criteria (T7–T8). The spec's open items are settled here: the transition write is
the job-side daily sweep (T2, covering the unsent-touch case); the class filter
is current-season only (T7); StatusChip color mapping stays a probe-round item
(T4's probe). Type consistency: the classifier and status union are defined once
in T2 and only consumed afterward.
