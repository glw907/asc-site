# Classes pass implementation plan

> **For agentic workers:** execute task-by-task with the repo's implementer
> (`cairn-implementer`, Sonnet-pinned); the main loop orchestrates, reviews each diff,
> and verifies the gate between dispatches. Spec:
> `docs/2026-07-21-classes-pass-design.md` (the functional contract; read it first).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the hybrid Classes surface — a season-scoped list with roster expand panels
and a rebuilt detail page carrying roster operations, the offer queue, and the
same-price transfer flow — on cairn 0.89.x with the graduated admin-toolkit subpath
replacing the local copies.

**Architecture:** a small cairn patch graduates the `itemNoun` grammatical-number fix
the local toolkit already carries; ASC then swaps its five graduated toolkit copies for
`@glw907/cairn-cms/admin-toolkit` imports (keeping `ExpandableRow` local) and adopts
the new `PageHeader` and `EmptyState`. The two Classes surfaces rebuild on that
vocabulary; the transfer flow is a store function reusing the existing freed-spot and
offer machinery, never a second copy.

**Tech stack:** SvelteKit 2 / Svelte 5 runes, cairn-cms 0.89.x admin shell + admin-toolkit,
daisyUI 5 via cairn's built `cairn-admin.css`, D1 (`asc-club`), Vitest, Playwright.

## Global constraints

- The spec's rulings govern: soft capacity with a calm over-capacity voice, same-price
  transfers (warn + explicit confirm on mismatch, no Stripe surgery), offer-based
  waitlist conversion on the existing machinery, instructors functionally untouched,
  season-scoped default with history behind a filter, ages on rosters.
- Any daisy/Tailwind class used in admin markup must exist in the built
  `cairn-admin.css` — verify in the built sheet, never assume (the Members-pass
  silent-non-compile lesson; cairn's blessed safelist plus `check:admin-css-classes`
  cover cairn's side, not ASC's hand-written markup).
- Corrective actions (Drop, Cancel offer, Delete) render quiet, never red per-row
  alarm links. Fireweed at most twice per page; one primary action per toolbar.
- `EVENTS_DB` untouched. No `asc-club` migration is expected this pass; if one becomes
  necessary, it follows the full scratch-proven forward/rollback/verify ritual.
- Visibility derives from the access map alone; no new roles, no `roles:` nav gates.
- Timestamps render through the toolkit formatters (America/Anchorage); ages through
  `ageFromBirthdate`.
- Visual baselines regenerate only via the `ci.yml` `update_snapshots` dispatch.
- Every task clears the full gate before the next dispatch: `npm run check` (0/0),
  `npm test`, `npm run build`.
- DX findings accumulate in `docs/2026-07-21-classes-pass-harvest-findings.md` as they
  surface (the harvest mandate). The file already carries five prep-time findings,
  including the graduation-drift process fix Task 1 executes.
- **Improving the component library is a standing objective of the pass (Geoff,
  2026-07-21).** A rough edge found in a toolkit component while consuming it gets
  fixed upstream when small and contract-safe (batch with Task 1's 0.89.1 when
  possible; a later fix waits for the pass-close harvest) or filed in the harvest
  file. Task 6 records the pass's graduation evidence: ExpandableRow's second
  consumer, the destination picker as the move-between-containers candidate, the
  over-capacity voice as a StatusChip extension candidate, EmptyState/PageHeader
  adoption feedback.

---

### Task 1: cairn — graduate the `itemNoun` fix, publish 0.89.1 (cairn-cms repo)

**Files:** Modify `~/Projects/cairn-cms/src/lib/admin-toolkit/format.ts`,
`Pagination.svelte`, `ListToolbar.svelte`, `list-toolbar.ts`, `index.ts`,
`docs/reference/admin-toolkit.md`; cairn's own tests for the three touched units.

**Interfaces produced:** `itemNoun(count, label)` and `type ItemLabel = { one: string;
many: string }` exported from the subpath barrel; `Pagination`'s and `ListToolbar`'s
`itemLabel` prop widened to `string | ItemLabel` (a plain string keeps today's
invariant behavior, so no cairn caller changes).

- [x] **Step 1: one-executor check.** `pgrep -f cairn-cms`, `git -C ~/Projects/cairn-cms
  status` (warm uncommitted changes = stop and investigate), journal mtimes. Geoff's
  own cairn session was mid-flight 2026-07-20 evening; 0.89.0 on the registry says it
  landed, but verify the tree is clean and no executor is live before touching it.
- [x] **Step 2: port the fix.** Port ASC's local `itemNoun`/`ItemLabel`
  (`src/admin-club/toolkit/format.ts`, commit a9a2c8d) into cairn's admin-toolkit as an
  additive union: count lines and range lines pick the grammatical number ("1 class",
  "6 classes"); a string `itemLabel` behaves exactly as before. Tests cover the
  one/many pick, the string passthrough, and the count-line composition. Reference doc
  gains the type and the prop widening.
- [x] **Step 3: cairn gates.** cairn's own full gate green (including
  `check:admin-css-classes`).
- [x] **Step 4: publish.** Invoke the `cairn-release` skill; 0.89.1, patch. CHANGELOG
  entry notes the widened prop and the new exports, "no consumer action required."
- [x] **Step 5: harvest note (ASC repo).** Record the process finding: the graduation
  wave missed a post-harvest consumer fix; wave-by-graduation needs a "diff the local
  copies at graduation time" step.

**Acceptance:** `npm view @glw907/cairn-cms version` → 0.89.1; cairn gate green;
`itemNoun`, `ItemLabel` in the subpath barrel; a string `itemLabel` renders unchanged.

---

### Task 2: the toolkit swap — subpath imports, local copies deleted

**Files:** Modify `package.json` (range `^0.88.0` → `^0.89.1`),
`src/routes/admin/club/members/+page.svelte`, `src/admin-club/lib/member-format.ts`,
`src/admin-club/toolkit/ExpandableRow.svelte`, `src/admin-club/toolkit/README.md`, the
four `src/tests/toolkit-*.test.ts` files. Delete `src/admin-club/toolkit/format.ts`,
`StatusChip.svelte`, `AdminTable.svelte`, `Pagination.svelte`, `ListToolbar.svelte`.

**Interfaces produced:** all admin screens import formatters, `StatusChip`,
`AdminTable`, `Pagination`, `ListToolbar`, `PageHeader`, `EmptyState` from
`@glw907/cairn-cms/admin-toolkit`; `ExpandableRow` remains at
`$admin-club/toolkit/ExpandableRow.svelte` (its second consumer arrives in Task 3; it
graduates in a later cairn wave).

- [x] **Step 1: bump and swap.** Update the range, `npm install`, replace every
  `$admin-club/toolkit/{format,StatusChip,AdminTable,Pagination,ListToolbar}` import
  with the subpath. The graduated contracts drifted from the local copies (cairn
  re-expressed `ListToolbar` substantially — segmented filters, count presentation);
  reconcile each caller to the graduated contract, keeping ASC's rendered behavior:
  the `{ one, many }` `itemLabel` pairs stay (Task 1 made them legal), the Members
  screen's search/filter/count behavior is the fixed point. `ExpandableRow`'s own
  imports repoint to the subpath.
- [x] **Step 2: retire duplicated tests.** Local unit tests that pin graduated-component
  internals retire (cairn's suite owns those contracts); tests of ASC-specific behavior
  (ExpandableRow, member-format, screen-level assembly) stay and pass. README shrinks
  to ExpandableRow plus a pointer to cairn's admin-toolkit reference.
- [x] **Step 3: gate + visual proof.** Full gate green; the Members screen renders
  identically — `npm run test:e2e` against the existing CI-canonical baselines must
  pass locally-rendered comparisons or, if the swap legitimately shifts rendering,
  stop and surface the diff for review before any baseline talk.

**Acceptance:** grep shows no imports of the five deleted files; installed cairn is
0.89.1; gate green; Members visual spec passes against existing baselines (or the
delta is reviewed and ruled).

---

### Task 3: the list screen rebuild

**Files:** Modify `src/routes/admin/club/classes/+page.server.ts`,
`src/routes/admin/club/classes/+page.svelte`,
`src/admin-club/lib/classes-store.ts`, `src/admin-club/lib/offers.ts` (read-only use);
Test: `src/tests/classes-list.test.ts` (new), screen assembly tests.

**Interfaces consumed:** toolkit subpath (Task 2), `ExpandableRow`,
`listClassesWithCounts()`, `listEnrollments()`, `listOutstandingOffers()`,
`offerSpot()`, `getCurrentSeason()`, `ageFromBirthdate`.

**Interfaces produced:** the list loader returns season-scoped classes each carrying
its roster (name, age, `fee_paid`) and waitlist summary (count, next entry, active
offer + expiry) in one load; a named form action `offerNext` on the list route.

- [x] **Step 1: server load.** Season filter defaults to `settings.current_season`;
  a `?season=` param reaches history; per-season row counts are small, so rosters and
  waitlist summaries load eagerly with the list (batched queries, no N+1 loop —
  D1 `batch` or joined queries). Stale offers sweep on load, as detail does today.
- [x] **Step 2: the screen.** `PageHeader` (title, season meta, New class as the one
  action) — the toolbar carries the season filter and the count line with
  `{ one: 'class', many: 'classes' }`. `AdminTable` compact zebra; each row an
  `ExpandableRow`: name, track, dates, enrolled fraction, waitlist count,
  pending-offer marker. No Capacity column, no Visibility column; hidden classes get a
  quiet "Hidden" marker, drop-in classes a "drop-in" mark instead of a fraction.
  Over-capacity renders calm (provisional treatment; Task 6's probes settle the final
  voice). Panel: roster (name, age, paid `StatusChip`), waitlist summary line, actions
  **Open class**, **Email class** (`/admin/club/email/compose?segment=class:ID`), and
  contextual **Offer next seat** (only when seats open AND waitlist nonempty AND no
  active offer) posting `offerNext`, which calls `offerSpot()` for the head of the
  queue. `EmptyState` explains what fills the surface with New class as its action.
- [x] **Step 3: tests + gate.** Loader tests: season scoping, eager roster shape,
  offer-marker derivation, `offerNext` guard conditions (rejects when full, when an
  offer is live, when the waitlist is empty). Screen tests: column kill, contextual
  action visibility, drop-in and hidden markers. Full gate green.

**Acceptance:** the list opens to the current season with working expand panels
against the live-data replica; history reachable by filter; `offerNext` refuses all
three guard violations; gate green.

---

### Task 4: the detail page rebuild

**Files:** Modify `src/routes/admin/club/classes/[id]/+page.server.ts`,
`+page.svelte`, `src/admin-club/lib/classes-store.ts`; Test:
`src/tests/classes-detail.test.ts` (new or extended).

**Interfaces consumed:** toolkit subpath, existing detail actions (`update`, `delete`,
`assignInstructor`, `unassignInstructor`, `offer`, `cancelOffer`, `dropEnrollment`),
`listEnrollments()`, `listWaitlist()`, `listOffersForClass()`, ledger
`recordTransaction`.

**Interfaces produced:** a `recordPayment` form action (manual cash/check/comp: sets
`fee_paid`, writes the `money_ledger` row through the existing ledger vocabulary,
writes the audit row); the roster row shape Task 5's Move… hangs from.

- [x] **Step 1: structure.** `PageHeader` with the class name (breadcrumb finally
  carries it), season, dates, fraction in the meta line. Sections: roster, waitlist &
  offers, details (edit form), instructors, danger zone.
- [x] **Step 2: roster.** `AdminTable`: name, age, enrolled date, paid `StatusChip`;
  quiet per-row actions — Record payment (unpaid rows only), Move… (Task 5 wires it),
  Drop (confirm step; reuses `dropEnrollment`, which already runs the freed-spot
  logic). Empty roster gets `EmptyState`.
- [x] **Step 3: waitlist & offers.** Queue in position order, member vs applicant
  entries visibly distinguished, active offer with expiry, offer/cancel actions on the
  existing machinery; stale-offer sweep on load stays.
- [x] **Step 4: edit form + instructors.** The form rebuilds on the event-detail idiom
  (paired columns, real date inputs, Save placement); Delete demotes to a quiet
  danger-zone placement with confirm. Instructors section restyles to match the page;
  assign/unassign behavior untouched.
- [x] **Step 5: tests + gate.** `recordPayment` tests: flag set, ledger row written,
  audit row written, refuses an already-paid row. Assembly tests for section presence
  and unpaid-only action visibility. Full gate green.

**Acceptance:** the detail page shows a real named roster with ages and paid state
against the live-data replica; manual payment recording writes ledger + audit; no
floating red Delete; gate green.

---

### Task 5: the transfer flow

**Files:** Create `src/admin-club/lib/class-transfer.ts`; Modify
`src/routes/admin/club/classes/[id]/+page.server.ts`, `+page.svelte`; Test:
`src/tests/class-transfer.test.ts` (new).

**Interfaces consumed:** `getClassWithCounts()`, the freed-spot function
`dropEnrollment` reuses (import the same one — never a second copy), ledger
`recordTransaction`, audit helpers.

**Interfaces produced:** `transferEnrollment(db, { enrollmentId, destinationClassId,
actor, confirmFeeMismatch })` — the single store function the UI action wraps.

- [x] **Step 1: store function, test-first.** Behavior under test before UI: moves the
  enrollment to the destination class preserving `fee_paid`, `stripe_ref`,
  `guardian_contact`, `interests`, and the original `enrolled_at`; refuses a fee
  mismatch unless `confirmFeeMismatch` is set (the error names the exact difference);
  refuses a duplicate (destination already holds this member — the
  `UNIQUE(class_id, member_id)` case surfaces as a friendly error, not a 500); writes
  the ledger memo and audit rows recording source, destination, and any confirmed
  difference; runs the freed-spot logic at the source so the auto-offer fires.
  Destination may be over capacity (admin override is normal). Cover: same-fee move,
  mismatch refusal, mismatch + confirm, duplicate refusal, carry of all four fields,
  freed-spot trigger, audit/ledger rows.
- [x] **Step 2: UI.** Move… on a roster row opens the destination picker: current
  season, same class excluded, each candidate showing its fraction (over-capacity
  allowed, shown calm). Fee mismatch shows the difference and requires the explicit
  confirm before the action submits with `confirmFeeMismatch`.
- [x] **Step 3: gate.** Full gate green.

**Acceptance:** a paid student moves between same-price classes with the payment
following and the source's freed spot auto-offering; the mismatch path warns with the
exact difference and proceeds only on confirm; all store tests pass; gate green.

---

### Task 6: probes, coherence, and pass close

**Files:** Create probe pages under
`docs/design-benchmark/probes/2026-07-21-classes/`; Modify `docs/STATUS.md`,
`docs/design-benchmark/ledger.md`, `docs/2026-07-21-classes-pass-harvest-findings.md`.

- [x] **Step 1: probes.** Committed probe pages for the verdicts that need Geoff's
  eyes: list row anatomy and density, the over-capacity voice (2-3 variants), expand
  panel composition. The three open Members probe items (StatusChip palette mapping,
  the never-paid `'none'` copy, the search focus ring) ride the same review page set.
- [x] **Step 2: reviewer fan-out.** `web-auth-security-reviewer` (new form actions:
  `offerNext`, `recordPayment`, transfer), `svelte-reviewer`, `daisyui-a11y-reviewer`;
  findings triaged and fixed.
- [x] **Step 3: design-probe + coherence.** `scripts/design-probe.mjs` clean for the
  pass's surfaces; fresh-context whole-page coherence read (not a context that built
  it) at 390 and 1440 on both surfaces — the expert-tells question; fix round if it
  fails; verdict to the ledger.
- [x] **Step 4: baselines + deploy.** CI-canonical baseline regeneration via
  `gh workflow run ci.yml -f update_snapshots=true` (read the log, not the
  conclusion); push; dev deploy green.
- [x] **Step 5: records.** STATUS entry (trim rule applies), harvest findings filed,
  budgets scored (tokens + interaction points). Geoff's queue gains: the Classes
  before/after on dev and the probe verdicts.

**Acceptance:** reviewers clean or triaged, coherence PASS in the ledger, baselines
CI-minted, dev deploy green, STATUS points at Geoff's before/after as the open gate.
