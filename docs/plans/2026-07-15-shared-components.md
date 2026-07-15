# Shared Components Pass — Implementation Plan

> **For agentic workers:** execute task-by-task via the repo's implementer dispatch flow
> (cairn-implementer per task; the conductor reviews each diff and verifies the gate between
> dispatches). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable component vocabulary the 2026-07-15 design review identified
(facts, related, page-cta, steps, table system, category/status chips, requirement tone),
retrofit a bounded exemplar set of pages, and fix the four rendering defects the review
surfaced.

**Architecture:** Every component follows the existing registry pattern in
`src/theme/markdown/components.ts` (defineComponent, slots/attributes, styling in
`src/theme/asc-components.css`), rendering static HTML through the directive pipeline — no
new islands, no new dependencies. Page retrofits are content edits in `src/content/` plus
`npm run cairn:manifest`.

**Tech Stack:** cairn-cms directive registry (hastscript builders), theme CSS tokens,
vitest, Playwright pixel suite.

## Global constraints

- Design contract: `docs/2026-07-06-asc-phase-1-design.md` + `docs/design-benchmark/decisions.md`.
  Never re-litigate a logged decision. Bands stay home-only. Fireweed at most twice per page.
  Star gold marks waypoints only, never body text. Flag navy is the only link color.
- Owner dose words, binding on every visual choice: "don't overdo this; felt refinement only"
  and "fall back on proven web UI/UX design patterns."
- All styling uses existing tokens (`--color-primary`, `--color-base-200/300`, `--color-muted`,
  `--color-card-border`, `--color-star-gold`, `--color-*-dot`, `--radius-box`, `--spacing-*`,
  `--text-step-*`, `--container-measure`). No new hex values.
- Components must render sensibly at 320/390/768/1440/2560 and in dark mode.
- Any change that alters rendering regenerates its pixel baselines in the same change.
- `npm run check` 0/0, `npm test`, `npm run build` green after every task.
- Comments follow ts-conventions/svelte-conventions; commits Conventional-Commits imperative
  with the Claude co-author footer.

---

### Task 0: e2e infrastructure fixes (STATUS follow-ups A and B)

**Files:** Modify `e2e/fixtures/events-seed.sql`, `playwright.config.ts`.

- [ ] Add `DELETE FROM class_reminders_sent;` and `DELETE FROM credit_redemptions;` ahead of
  `DELETE FROM class_enrollments;` in events-seed.sql so a warm workstation replica
  re-bootstraps without FK errors.
- [ ] Move the Playwright webServer off contested port 4173 to a dedicated port (4179):
  update `port`/`baseURL` in playwright.config.ts. Keep `reuseExistingServer: !CI`.
- [ ] Acceptance: seed applies twice consecutively against a warm `.wrangler` replica without
  error; `npm run test:e2e -- --list` resolves against 4179.
- [ ] Commit (`fix(e2e): make seed re-runnable and move preview to a dedicated port`).

### Task 1: `:::facts` key-facts component

**Files:** Modify `src/theme/markdown/components.ts`, `src/theme/asc-components.css`.
Test: alongside the existing registry/component tests (follow the callout/cards test pattern).

**Interfaces (produces):** container directive `::::facts` with nested `:::fact[Label]`
children (same nesting mechanic as `cards`/`card`); `fact` has required inline `title` slot
(the label) and markdown `body` slot (the value — must support links and inline code).
Classes: `.asc-facts` (a `<dl>`), `.asc-fact-label` (`<dt>`), `.asc-fact-value` (`<dd>`).

Design spec (binding): semantic `<dl>`. Desktop: two-column grid, label column
`minmax(8rem, 12rem)`, value fills; hairline row separators
(`1px solid var(--color-card-border)`); no background, no border box, no radius — this is
quiet structure inside the prose measure, not a card. Label: `--text-step--1`, weight 600,
`var(--color-muted)`, sentence case (no small caps, no letter-spacing). Value: body size,
base-content ink. Below 40rem: single column, label above value, tighter separator spacing.
Dark mode inherits via tokens.

- [ ] Write failing component tests (render: dl/dt/dd structure, label text, markdown value
  with a link, multiple rows) following the existing registry test pattern; verify they fail.
- [ ] Register `facts`/`fact` (group 'Page structure', `fact` hidden like `card`, sensible
  `insertTemplate` and admin preview) and add the CSS per the design spec above.
- [ ] Verify tests pass; run check/test/build.
- [ ] Commit (`feat(theme): add facts definition-list component`).

### Task 2: `:::related` cross-reference block and `:::page-cta` closer

**Files:** Modify `src/theme/markdown/components.ts`, `src/theme/asc-components.css`.
Note: `page-cta` CSS classes already exist (education's closer, `.page-cta`,
`.page-cta-lead`, `.page-cta-body` in asc-components.css) — generalize them, don't fork.

**Interfaces (produces):**
- `::::related` container + `:::ref[Title]{href="..."}` children; `ref` has required `href`
  (use the existing LINK_PATTERN/LINK_HELP), required inline title, optional one-line markdown
  note. Classes: `.asc-related`, `.asc-related-item`, `.asc-related-note`.
- `:::page-cta` with inline `lead` slot, markdown `body` slot, and repeatable `actions` items
  `{label, href, kind}` where kind ∈ primary|secondary (default secondary). Classes reuse
  `.page-cta*` plus `.page-cta-actions`; buttons reuse the existing `.cta`/`.cta-primary`/
  `.cta-secondary` prose classes.

Design spec (binding): `related` is NOT a card — hairline top rule, then an eyebrow
"Related" (`--text-step--2`, letter-spacing 0.06em, uppercase, `--color-muted`), then each
item on its own line: navy link title with the site's standard underline idiom, `→` after the
title, muted note following on the same line (wrapping under itself). `page-cta`: top hairline
rule, generous vertical spacing (`--spacing-l`), lead at `--text-step-1` weight 600, body
muted at body size, actions in a wrapping flex row. At most ONE primary (fireweed) action;
never a band background — plain page ground only.

- [ ] Write failing tests for both (structure, href validation passthrough, action kinds,
  at-most rendering of provided actions); verify they fail.
- [ ] Implement both components and CSS; unify education's existing closer markup so one CSS
  block serves both (education content migrates in Task 7).
- [ ] Verify tests pass; run check/test/build.
- [ ] Commit (`feat(theme): add related and page-cta components`).

### Task 3: `:::steps` numbered sequence

**Files:** Modify `src/theme/markdown/components.ts`, `src/theme/asc-components.css`.

**Interfaces (produces):** `::::steps` container + `:::step[Title]` children with markdown
body. Rendered as `<ol class="asc-steps">` of `<li class="asc-step">`; number comes from a
CSS counter, not authored content. Classes: `.asc-steps`, `.asc-step`, `.asc-step-title`,
`.asc-step-body`.

Design spec (binding): left number rail — 1.75rem circle, `1.5px solid var(--color-primary)`,
transparent fill, navy numeral (`--text-step--1`, weight 600, tabular); hairline vertical
connector between circles (`--color-card-border`), no connector after the last step. Title
weight 600 base size; body normal, muted only if the design reads better in situ — default
base-content. No gold, no fireweed, no card chrome. Mobile: same rail, tighter gap.

- [ ] Write failing tests (ol/li structure, title/body slots, no hardcoded numbers); verify
  they fail.
- [ ] Implement component + CSS per spec.
- [ ] Verify tests pass; run check/test/build.
- [ ] Commit (`feat(theme): add steps sequence component`).

### Task 4: table system — `:::table` wrapper with variants and legend

**Files:** Modify `src/theme/markdown/components.ts`, `src/theme/asc-components.css`
(and/or `src/chassis/prose.css` ONLY through its existing seam rules — read
`src/chassis/README.md` first; if a change belongs to chassis prose, prefer a theme-side
override in asc-components.css instead).

**Interfaces (produces):** `::::table{variant="results|fees|gear"}` container whose markdown
body holds a standard markdown table, plus an optional `caption` inline slot and optional
`legend` markdown slot. Build wraps the table in
`<figure class="asc-table asc-table-<variant>">`, inner `.table-scroll` (the existing chassis
scroll container), caption as `<figcaption>`, legend as a trailing
`<div class="asc-table-legend">`.

Design spec (binding): all variants get `font-variant-numeric: tabular-nums` on cells,
header row weight 600 with a `2px solid var(--color-primary)` bottom rule, quiet zebra on
even rows (`var(--color-base-200)`), row hairlines `--color-card-border`. `results` variant
additionally drops cell type to `--text-step--1` and tightens cell padding (dense grids must
scan); `fees` and `gear` stay body-size. Legend: `--text-step--2`, `--color-muted`,
definition-style lines, sits visually attached under the table (tight top margin). Caption:
step -1, weight 600, above the table, left-aligned. No new colors; dark mode via tokens.

- [ ] Write failing tests (figure/figcaption/scroll wrapper structure per variant, legend
  presence/absence, table passthrough); verify they fail.
- [ ] Implement component + CSS per spec.
- [ ] Verify tests pass; run check/test/build.
- [ ] Commit (`feat(theme): add table wrapper with results/fees/gear variants`).

### Task 5: category/status chip vocabulary (events + class schedule)

**Files:** Modify `src/theme/components/EventsListing.svelte`,
`src/theme/components/ClassSchedule.svelte`, `src/theme/asc-components.css` (or the
components' own styles, following where their current badge styles live). Read
`src/theme/season-data.ts` / `events-data.ts` for the category model — read-only on
EVENTS_DB, no schema or query-shape changes.

Design spec (binding): unify on the home Season list's settled C7 encoding.
- Category chip = colored dot (the existing `--color-racing-dot` / `--color-sage-dot` /
  `--color-business-dot` category tokens) + small-caps label at `--text-step--2`, muted ink;
  classes/clinics use the gold star glyph (the season taxonomy's mark) instead of a dot.
- Availability chip (OPEN / FULL / COMPLETED) is a separate element, never sharing a slot
  with category: quiet outline chip — `1px solid var(--color-card-border)`, muted text,
  `--text-step--2`, uppercase, small radius (`--radius-selector`), transparent fill. No
  semantic-palette colors (that vocabulary stays reserved).
- Events page adopts both; ClassSchedule's status cell adopts the availability chip.
- While in EventsListing: fix truncation (bug B2) — truncate descriptions at a word boundary,
  and make the affordance explicit (title link or a trailing "More →" to `/events/[id]`);
  no mid-word cuts.

- [ ] Write/adjust component tests for the chip markup and word-boundary truncation; verify
  the new assertions fail first.
- [ ] Implement chips in both components + shared CSS; fix truncation.
- [ ] Verify tests pass; run check/test/build.
- [ ] Commit (`feat(theme): unify category and availability chips across event surfaces`).

### Task 6: remaining defects (B1, B3, B4) and the `requirement` callout tone

**Files:** Investigate then modify as found: `src/content/pages/join.md` (B1),
the post template under `src/routes/(site)/[...path]/` or its rendering component (B3),
the posts-index topic cards source (B4, likely `src/theme/post-cards.ts` or the posts route),
`src/theme/markdown/components.ts` + CSS (tone).

- [ ] B1 — Join renders literal `::membership-pricing(tier="individual")::`. The registry's
  insertTemplate is `:::membership-pricing{tier="..."}:::` — diagnose whether join.md carries
  wrong directive syntax or the inline-in-list-item context can't render the directive.
  Fix so live prices render in Join's dues bullets (content fix preferred; if inline-in-bullet
  is unsupported, restructure those bullets as a `:::table{variant="fees"}` per Task 4 and
  keep the pricing directives in table cells only if supported — otherwise sentence-form).
  Regenerate the manifest after any content edit.
- [ ] B3 — the post deck/description renders twice (deck + first body paragraph) on the
  Northern Lights recap. Determine whether the template duplicates description or migrated
  content repeats it; fix at the responsible layer (template if template, content+manifest if
  content; check 2-3 other posts to confirm the pattern).
- [ ] B4 — the News index shows a "News — 0 posts" topic card; filter empty topics out of the
  browse-by-topic grid.
- [ ] Add `requirement` to the callout tone options and style it: sage tint ground
  (`--color-base-200`), `1px solid var(--color-primary)` full border (no left-bar accent),
  title prefixed by the existing icon slot (suggest `anchor`); reads as "prerequisite,"
  quieter than warning, firmer than note. Test: tone renders with its class.
- [ ] Verify all tests pass; run check/test/build.
- [ ] Commit per fix or as one commit (`fix(site): join pricing, post deck duplication, empty
  topic card; add requirement callout tone`).

### Task 7: retrofit exemplar pages

**Files:** Modify `src/content/pages/moorings.md`, `visiting-the-club.md`, `join.md`,
`new-member-guide.md` (closing sections only), `education.md` (closer swap only),
`src/content/posts/2025-09-30-northern-lights-results-work-party-recap.md`. Run
`npm run cairn:manifest` after edits.

Scope is bounded to demonstrating each component where the review found the need; a full
site-wide content consolidation is a later content pass. Editing rule: existing approved
copy is the specification — restructure into components by moving text, deletion-only trims,
never paraphrase.

- [ ] Moorings: cost/eligibility as `:::facts` (Cost, Eligibility, Boat size, Waitlist);
  "Active Participating Member" prerequisite as a `requirement` callout; trailing storage
  link becomes `:::related`.
- [ ] Visiting: "Getting there" address as `:::facts`; the RV-parking bold-label bullets as
  `:::facts`; the three single-card cross-references become `:::related` blocks in place;
  club-boat "Before you sail / At the dock / When you're done" as `:::steps`; the closing
  "Questions?" list as `:::page-cta` (secondary action to contact).
- [ ] Join: "How to Apply" as `:::steps`; dues + additional fees as `:::table{variant="fees"}`
  (respecting the B1 resolution from Task 6); "Questions?" closer as `:::page-cta`.
- [ ] New Member Guide: "What's Next" and "Need Help?" card clusters become `:::related`
  blocks plus one `:::page-cta`; leave the rest of the page for the content pass.
- [ ] Education: swap the hand-rolled closing CTA markup for `:::page-cta` (visual parity —
  this is the CSS Task 2 generalized).
- [ ] Recap post: wrap the results tables in `:::table{variant="results"}` and move the
  bold-label "Scoring Codes"/"Race Detail Columns" paragraphs into the tables' `legend` slots.
- [ ] Regenerate the manifest; run check/test/build; render-read each changed page yourself
  at 390 and 1440 against the dev server and report anything that reads wrong rather than
  shipping it.
- [ ] Commit (`content: retrofit exemplar pages onto the shared components`).

### Task 8: pass close — baselines, gates, review, release (conductor-led)

- [ ] Regenerate pixel baselines for every changed page in the visual suite; confirm the e2e
  suite is rendering THIS site (Task 0's dedicated port; verify a title/logo marker before
  trusting green).
- [ ] Full gate: `npm run check` 0/0, `npm test`, `npm run build`, `npm run test:e2e`.
- [ ] Conductor render reads at 390/1440 of every changed page (fresh full-page captures),
  plus dark mode spot-check of facts/related/steps/table/chips.
- [ ] code-simplifier over the pass diff; re-run the gate.
- [ ] Reviewer fan-out: svelte-reviewer + daisyui-a11y-reviewer over the pass diff; triage
  and fix confirmed findings; re-gate.
- [ ] Update docs/STATUS.md (new entry; apply the trim rule) and note chassis-worthy
  harvest candidates (facts/related/steps/table are cairn-generic) for the cairn DX file.
- [ ] Commit docs; push to main (dev deploy); post-deploy render read on
  dev.aksailingclub.org; assemble the before/after set for Geoff (the review captures in the
  session scratchpad are the "before").

## Self-review notes

- Every review finding maps to a task: facts (T1), cross-ref + closer (T2), steps (T3),
  tables + legend (T4), badges (T5), requirement tone + bugs B1/B3/B4 (T6), B2 (T5),
  address block (folded into facts, T7 visiting), exemplar retrofits (T7).
- Type/name consistency: `facts`/`fact`, `related`/`ref`, `page-cta`, `steps`/`step`,
  `table` — all registered in the one registry; class names all `asc-*` except the
  pre-existing `.page-cta*` and chassis `.table-scroll`.
- Deliberately out of scope: site-wide content consolidation (later content pass), education
  pacing (existing backlog item), any EVENTS_DB write or migration, the hero/TOC families
  (already standardized), dark-mode audit beyond spot-checks (backlog).
- Fragments (Geoff, 2026-07-15): the next cairn release adds a "fragments" concept for content
  that logically exists in multiple locations. The follow-up content-consolidation pass should
  single-source the duplicated facts this review found (mooring cost on Moorings + Join, the
  club address on Contact/Visiting/Home, the New Member Guide's restatements of Join/
  Education/Moorings material) as fragments — typically a fragment carrying a `:::facts`
  block. This pass deliberately leaves those duplicates in place, formatted consistently.
