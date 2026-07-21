# Classes pass: cairn DX harvest findings

> Staging file for cairn-cms's `docs/internal/docs-friction-log.md`, per the fragments
> precedent: a cairn session showed live signals at 2026-07-21 prep (showcase workerd,
> a probe-screenshot viewer), so nothing writes into that repo from here. Paste these
> into the friction log when cairn is free, then delete this file. Findings accumulate
> here through the pass. The frame (Geoff, 2026-07-21): the component library improves
> as we go — each finding is an improvement to make, not a complaint to archive.

## Filed at pass prep (2026-07-21, before execution)

1. **Graduation drift: the toolkit wave re-expressed from a stale snapshot (defect +
   process gap).** cairn 0.89.0's `Pagination` and `ListToolbar` take a plain-string
   `itemLabel` and would render "1 households" — the exact tell ASC's coherence re-read
   caught and fixed (ASC a9a2c8d: `itemNoun` + `ItemLabel { one, many }`). The fix
   landed in ASC's local copies after the harvest note was filed, and the graduation
   wave never diffed the local copies at graduation time. Consequence: a blind subpath
   swap regresses a Geoff-flagged coherence fix. Immediate fix: the classes-pass plan's
   Task 1 (0.89.1, additive `string | ItemLabel` widening, `itemNoun`/`ItemLabel`
   exported from the barrel). Process fix for the wave-by-graduation ritual: graduation
   REQUIRES a diff of the first consumer's live copies against the harvest-time
   snapshot, and the consumer's newer commits win.

2. **The admin-CSS class gate stops at cairn's own templates.**
   `check:admin-css-classes` (0.89.0) checks cairn's admin-toolkit and admin component
   templates against the built sheet — the right gate, but only for cairn. A consumer
   site's hand-written admin markup still hits the silent-non-compile trap with all
   gates green (the Members pass's `bg-warning/15` Overdue chip). The checker now
   exists; export it (or document the recipe) so a site can run the same check over its
   own admin templates against the shipped `cairn-admin.css`. This closes the Members
   harvest finding's consumer half.

3. **Partial graduation needs a blessed consumer pattern.** `ExpandableRow` stayed
   local (correctly — no second consumer yet), so after the swap ASC's toolkit
   directory holds one component whose own imports reach into the subpath, and a README
   that is mostly a pointer. The state is fine but undocumented; the admin-toolkit
   reference could carry two paragraphs on the mid-graduation consumer shape: local
   components import graduated ones from the subpath, local tests cover only local
   contracts, the site README points at cairn for everything graduated.

4. **Every 0.x minor strands every consumer behind its caret range.** `^0.88.0`
   excludes 0.89.0, so each minor needs a manual range bump in each consumer — hit at
   0.85.0 (recorded then) and again now. Small ritual fix: the cairn-release checklist
   carries a known-consumers list (asc-site, ecxc-ski, 907-life) and the release close
   names which were bumped or deliberately left.

5. **Evidence the model works (keep doing this).** 0.89.0 shipped `PageHeader` and
   `EmptyState` ahead of ASC's need for them — this pass adopts both on day one instead
   of hand-rolling. The engine-pull direction of wave-by-graduation is earning its
   keep; worth a line in the toolkit reference's history note when the next wave lands.

## Filed during execution

6. **Task 1 close-out on finding 1 (2026-07-21).** The `itemNoun` graduation landed in
   cairn as the planned additive widening (`string | ItemLabel` on both components'
   `itemLabel`, `itemNoun`/`ItemLabel` exported from the barrel; every count and range
   line routes through the one fix point). Cairn's port also accepts a plain string in
   `itemNoun` itself, which ASC's original never needed — the graduated form is the more
   general contract. The process fix stands as filed: graduation requires a diff of the
   first consumer's live copies against the harvest-time snapshot, and the consumer's
   newer commits win. One naming note for the friction log: cairn-cms has no `build`
   script (`npm run package` is the library build), so a plan or dispatch written from
   the consumer side says "build" and the executor has to map it; the gate list in
   cairn's CONTRIBUTING/README could name the canonical gate commands once.

7. **Task 2 close-out: the graduated contracts needed zero caller-side reconciliation
   (evidence the model works, keep doing this).** The plan flagged a risk ("cairn
   re-expressed `ListToolbar` substantially — segmented filters, count presentation;
   reconcile each caller to the graduated contract") that never materialized in
   practice: `StatusChip`, `Pagination`, `AdminTable`, and `ListToolbar`'s graduated
   props are a strict superset of ASC's own local contracts (`display: 'segmented'`,
   `trailing`, `overflowLabel`, `pageSizeOptions` are all-optional additions), so the
   Members screen's every existing prop call site kept working unchanged — the swap
   was import-path-only. The one real integration point, `itemNoun`'s `string |
   ItemLabel` widening (Task 1), was exactly enough; no other reconciliation surfaced.

8. **Task 3: `ListToolbar.search`/`onSearch` are mandatory props, but a filter-only
   toolbar is a real shape.** The Classes list's own design spec calls for a season
   filter, a primary action, and a count line -- no search (the season is small enough
   to scan; nothing in the spec asks for a name search). `ListToolbar`'s Props type
   has no optional form of `search`/`onSearch`, so this second consumer either drops
   `ListToolbar` for a filter-only screen or invents a search box the design never
   asked for. Task 3 chose the latter (a client-side name filter over the already-
   loaded season, cheap since there is no per-row secret to leak the way Members'
   server-side search protects), which is a legitimate feature but was added to
   satisfy the component's contract, not the product spec. Worth a widening: `search`/
   `onSearch` optional, the search box rendered only when both are given, mirroring how
   `primaryAction`/`filters`/`trailing` are already all-optional on the same component.

9. **Task 3: `PageHeader` has no matching bare card-shell primitive.** `OfficeList`
   bundles the eyebrow/title/meta header AND the bordered `rounded-box` card shell in
   one component; `PageHeader` graduated only the header half (by design, per its own
   doc comment: "the `OfficeList` shape, generalized"). A screen that adopts
   `PageHeader` for its header (this pass's first ASC consumer) still needs a card
   shell around its own table/form content below it, and the only way to get the exact
   same shell is to hand-copy `OfficeList`'s own wrapper div class string
   (`rounded-box border border-[var(--cairn-card-border)] bg-base-100 overflow-x-auto
   shadow-[var(--cairn-shadow)]`) verbatim -- safe (it is a literal token already
   compiled from `OfficeList.svelte`'s own scanned template, the same trick
   `PageHeader`'s own doc comment describes for its typography classes), but a fourth
   copy of that exact string across the codebase is a graduation candidate of its own:
   a bare `Card`/`AdminCardShell` primitive in the toolkit, so `PageHeader` and a card
   shell compose independently instead of every non-`OfficeList` screen re-deriving
   the same wrapper string.

10. **Task 4: `EmptyState`'s own header explicitly rules out an `AdminTable` empty
    snippet as its use case, but there is no matching small in-card primitive either.**
    `EmptyState.svelte`'s doc comment is explicit: "never the filtered-to-zero state
    ... that recipe stays a smaller, in-card notice inside `AdminTable`'s own `empty`
    snippet." Both consumer screens (Task 3's list, this task's detail roster) end up
    hand-writing the identical `<p class="text-sm text-muted">No one is ... yet.</p>`
    for that smaller notice -- a real, if small, third copy. Worth a one-line addition
    to the admin-toolkit reference (not necessarily a new component): name the exact
    recipe for an `AdminTable`'s own `empty` snippet, so a future screen does not
    independently reinvent it a fourth time.

11. **Task 4: a genuine pre-existing display bug, found but left unfixed (correctly
    out of scope).** Both waitlist screens (`classes/[id]/+page.svelte`'s own queue and
    the cross-class `classes/waitlist/+page.svelte` pass-B overview) render
    `entry.applicantName ?? entry.applicantEmail` for a queue entry's name -- but a
    MEMBER-sourced `class_waitlist` row (`memberId` set) carries neither field; both are
    `null` by the schema's own `CHECK` (exactly one of `memberId`/`applicantEmail` is
    set). Every member-originated waitlist entry has silently rendered a blank name on
    both screens since the waitlist ever existed. This task fixed its own surface (one
    scoped `getWaitlistMemberNames` side query, resolved in the route's own load, kept
    deliberately OUT of `listWaitlist`'s shared `WaitlistRow` shape since that read
    serves ten-plus other call sites whose tests pin its exact SQL text -- widening it
    structurally would have rippled far past this task's own file list). The cross-class
    overview (`classes/waitlist/+page.svelte`, pass B, not in this task's own file list)
    still carries the bug; it is a one-line follow-up (reuse the same
    `getWaitlistMemberNames` helper this task added) that belongs to a later, dedicated
    fix or Task 6's own coherence pass.

12. **Task 4: a small, low-risk `ml-1` non-compile, found while verifying a NEW class
    against the built sheet (the Members-pass lesson holding).** `ml-1` does not compile
    in `cairn-admin.css` (`mr-1` and `ml-1.5` both do; `ml-1` alone is absent from
    whatever scanned template set produced the sheet) -- cosmetic only, a missing
    left-margin on a badge, but it is the SAME class Task 3's own list-screen "Hidden"
    marker already uses (`badge badge-ghost badge-sm ml-1 font-medium`), so that
    marker has likely rendered with no gap since Task 3 shipped, all gates green. This
    task's own new instance was rewritten to a `gap-2` flex row instead (which does
    compile) rather than perpetuating the class; Task 3's own pre-existing instance was
    left alone (out of this task's file list) and is filed here for a future fix pass.

## Filed at the Task 6 release round (2026-07-21)

13. **ExpandableRow's narrow-width contract recurred at its second consumer.** The
    Classes list hit the exact Members-pass failure again: the expanded panel's width
    follows the summary table's computed width (`<td colspan>` can never be narrower),
    so a summary row wider than a phone viewport drags the panel past the right edge
    and strands the roster's StatusChips off-screen. The fix was the same
    `*-narrow-hide` column-drop idiom Members already carries. Two consumers, two
    independent rediscoveries of the same constraint, both caught only by a
    fresh-context coherence read at 390. When ExpandableRow graduates, the contract
    must graduate with it: either documented loudly (panel width = summary width; the
    consumer owns keeping the summary inside the viewport) or mitigated in the
    component itself.

14. **Fresh evidence for finding 2 (the consumer-side admin-CSS check): two more
    silent non-compiles in one pass.** Hand-written `divide-y
    divide-[var(--cairn-card-border)]` separators compiled to nothing (lists rendered
    with no dividers, all gates green; caught by the daisy-a11y reviewer's built-sheet
    sweep, confirmed by grep), and finding 12's `ml-1` was the same trap earlier in
    the pass. The same dead `divide-*` pattern sits latent in
    `classes/waitlist/+page.svelte`, `members/[id]/+page.svelte`, and
    `money/+page.svelte` (site-side follow-up filed in STATUS). An exported
    `check:admin-css-classes` a consumer could run over its own `src/routes/admin/**`
    would have caught all of these mechanically at build time.

15. **Svelte's control-flow leading-whitespace trim breaks composed count lines.** A
    literal leading space directly inside an `{#if}` block boundary is dropped, so
    idioms like `waiting{#if next} &middot; next: {next}{/if}` render "waiting· next"
    -- two instances in one screen, each caught only by a cold read's micro-typography
    check ("Jun 20, 2026– Jun 22" was the other). The repo already dodges this ad hoc
    (span-wrapped spaces elsewhere); the toolkit's count-line documentation should
    carry the recipe explicitly (`&nbsp;` at the block boundary, or a span wrap) so
    composed summary lines stop rediscovering it.
