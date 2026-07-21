# The admin toolkit

The cairn admin toolkit's own components, born in this repo's theme layer (ASC is the first
consumer, not the ceiling) per `docs/2026-07-20-members-pass-design.md`'s "Toolkit births" and
`docs/plans/2026-07-20-members-pass.md`. Every contract here is general-purpose: it carries the
convergent shape the research survey's eight-design-system sweep found even where the Members
pass does not exercise the whole thing. A wrong contract shipped here costs one refactor; the same
mistake published to cairn costs every consuming site a breaking change, so generality is decided
before publication, not after.

Citations below point at `docs/2026-07-20-admin-toolkit-research-survey.md` ("the survey"), the
document every toolkit contract answers to. Tier letters are the survey's own (E = a cited
controlled study, C = convergent convention across 3+ of the eight surveyed systems, G = Geoff's
explicit call where the literature is silent).

## The compiled-CSS constraint

`/admin/**` routes render inside `CairnAdminShell` and load **only** cairn's precompiled
`cairn-admin.css` (`src/routes/admin/+layout.svelte`; see also
`src/routes/admin/club/+page.svelte`'s own "Scoped styles, not daisyUI stats" comment). This
site's own Tailwind/daisyUI build (`theme.css`, `src/routes/(site)/+layout.svelte`) never touches
an admin route. Two consequences shape every component below:

1. A daisyUI **component** class (`badge`, `status`, `join`, `table`, `stats`, ...) only works on
   an admin screen if it is already compiled into the packaged `cairn-admin.css` — either because
   cairn's own admin components happen to use it, or because it is in cairn's admin CSS blessed-set
   safelist (`ADMIN_CSS_SAFELIST`, cairn-cms's own `dist/components/admin-css-safelist.js`, shipped
   from 0.88.3). Each component's own section below lists the exact classes it leans on and
   whether the compiled sheet was checked directly (`grep` against
   `node_modules/@glw907/cairn-cms/dist/components/cairn-admin.css`) — the audit surface a future
   daisyUI upgrade can grep against to see its blast radius, per the plan's "stay upgrade-friendly
   to daisyUI" constraint.
2. An arbitrary **Tailwind utility** string (`min-w-[6rem]`, `gap-1.5`, a color opacity fraction)
   only works if that literal string already happens to appear somewhere in cairn's own scanned
   admin source — there is no guarantee, and no safelist covers open-ended utility values. Every
   component below keeps this class of styling (padding, truncation, min/max width, wrapper
   layout) in its own Svelte **scoped `<style>` block** instead, which Vite compiles and ships with
   the component regardless of what cairn's bundle contains. This is the same fix
   `/admin/club/+page.svelte` already applied to the Overview strip's `stats` band before the
   safelist existed, generalized into a standing rule for this toolkit.

The admin shell uses its own two-theme system, `cairn-admin` (light) and `cairn-admin-dark`
(dark) — a separate vocabulary from the public site's `asc`/`asc-dark` — set on the shell's own
root via `CairnAdminShell`'s theme toggle. "Both themes" below always means these two.

## `format.ts`

Pure formatter functions, general-purpose per the survey's "Formatters as citizens" verdict
(**C**, unopposed — "no system disagrees, several ship the helpers"). Every formatter takes its
locale/time zone as an option with a sensible default rather than assuming ASC's own defaults, so
a second consumer in another zone or locale is a parameter, not a fork.

| Function | Contract | Notes |
|---|---|---|
| `formatMoney(cents, options?)` | Signed integer cents in, a currency string with separators out (`30044` → `"$300.44"`, `-4500` → `"-$45.00"`). `options.currency` defaults `'USD'`, `options.locale` defaults `'en-US'`. | Ends the raw-cents artifact the walkthrough caught in the stats band (`docs/2026-07-20-admin-toolkit-catalog.md`). |
| `formatCivilDate(iso, options?)` | A calendar day (no time of day) from an ISO date or the leading 10 characters of a SQLite datetime, parsed at local midnight so it never shifts a day west of Greenwich. `options.fallback` defaults `'Not yet'`. | Never routes through a time-of-day formatter — the "4:00 PM" artifact a civil date picked up when it passed through a timestamp formatter. |
| `formatTimestamp(sqliteDatetime, options?)` | A SQLite `datetime('now')` UTC string as a local date and time. `options.timeZone` defaults `'America/Anchorage'` (the club's own zone, this formatter's first client, not its ceiling). | Pinned by option, not by the runtime's own zone: a Cloudflare Worker's runtime zone is UTC, not the club's. |
| `ageFromBirthdate(birthdateIso, asOf?)` | A whole-years age, turning over on the birthday itself. Reads `null` for a missing or unparseable birthdate. `asOf` defaults to `new Date()`; pass a fixed date for deterministic call sites. | The Members panel's per-member age (`members.birthdate`). |

No daisyUI assembly — these are TypeScript functions, no markup, no CSS. Tests:
`src/tests/toolkit-format.test.ts`.

`src/admin-club/lib/ui.ts` still carries this repo's own already-wired formatters
(`formatCivilDate`, `formatDollars`, `formatCents`, `formatClubTimestamp`); this module is the
toolkit's separate, general-contract set, not yet consumed by a screen (the Members screen rebuild
rewires onto it).

## `StatusChip.svelte`

**Contract:** the toolkit's one surface allowed a semantic status color (survey: Chip **reshaped,
split in three**, tier C — StatusChip/TagChip/CountBadge, "one do-everything chip re-merges what
[three systems] learned to separate"). Props: `tone` (`'neutral' | 'info' | 'success' | 'warning'
| 'danger'`, the full vocabulary — Current/Overdue/Former is this chip's first client, not its
ceiling), `label`, `size` (`'xs' | 'sm'`, defaults `'sm'`, named after `AdminTable`'s own density
tiers), and an optional `legend` string surfacing as a native tooltip and folding into the chip's
accessible name — the toolkit's "legend hook." The tone-to-domain mapping (which standing reads
`warning`, which reads `neutral`) lives with the consumer; StatusChip carries no domain knowledge.
`STATUS_CHIP_DOT_CLASS` (the tone → `status-<tone>` map) is exported from the component's module
context so a future legend/key component can reuse the identical color without duplicating the
mapping.

**daisyUI assembly:** `badge badge-outline` (shape only — no tone reads through the badge fill) plus
a `status status-<tone>` dot for the actual color signal, and `badge-xs`/`badge-sm` +
`status-xs`/`status-sm` for the two sizes. **Verified against the built `cairn-admin.css`
(0.88.3):** `badge-info`, `badge-warning`, `badge-neutral`, and `badge-primary` compile, but
`badge-success` and `badge-error` do **not** — so a colored badge fill cannot cover the full tone
vocabulary consistently. Every `status-<tone>` modifier, including `status-success` and
`status-error`, is in the safelist and does compile, which is why the dot (not the badge fill)
carries tone color here: one consistent mechanism across all five tones, not four different ones
plus a gap. Padding, truncation, and min/max width (the "chip-overflow kill" — the walkthrough's
literal "text overflows the pills" reaction, `docs/2026-07-20-admin-toolkit-catalog.md`) are the
component's own scoped CSS, per the compiled-CSS constraint above.

**`badge-outline`, not `badge-ghost` (the Members pass coherence round).** `badge-ghost` compiles to
an explicit `background-color`/`border-color` of `--color-base-200` — one of `AdminTable`'s own two
zebra stripe colors — so a ghost chip melts into whichever row shares that exact color and only
reads as a pill on the other stripe. `badge-outline` has no fill (`--badge-bg: transparent`) and no
`--badge-color` custom property is ever set here (no `badge-<tone>` modifier class is applied), so
its `border-color: currentColor` resolves to the inherited text color instead — a border that reads
the same against either zebra stripe, or no zebra at all.

**Exact class inventory:** `badge`, `badge-outline`, `badge-xs`, `badge-sm`, `status`,
`status-neutral`, `status-info`, `status-success`, `status-warning`, `status-error`, `status-xs`,
`status-sm`.

Tests: `src/tests/toolkit-components.test.ts`.

## `Pagination.svelte`

**Contract:** page navigation plus an optional item-range line (survey: Pagination **confirmed**,
tier C, "`join` + `btn` (daisy's own idiom)"). Props: `page` (1-based), `pageCount`,
`onPageChange(page)`, and the optional `totalItems`/`pageSize`/`itemLabel` (defaults `'items'`)
that add a "Showing X–Y of N `<itemLabel>`" line — general enough that a consumer with only a page
count (no raw item total) still gets a working pager, and a consumer with both gets the range line
too. A page count of 7 or fewer renders every page button; beyond that, `computePageWindow`
(exported from the module context, independently unit tested) reduces to first, last, and a run
around the current page with `'ellipsis'` gap markers, so the control never grows unbounded. A
single page renders no nav at all, only the range line if one applies.

**daisyUI assembly:** `join` + `join-item` + `btn`/`btn-sm`/`btn-active`. **Verified against the
built `cairn-admin.css`:** every one of these already compiles from cairn's own admin usage (the
safelist's own comment: "every `btn` variant the join-pagination idiom needs ... already compiles
... so no `btn` addition belongs in this safelist"); `join-item` and both orientation modifiers are
newly safelisted in 0.88.3. Wrapper layout (the flex row between the range line and the nav) and
the range line's own type color (`var(--color-muted)`, the same theme variable `.text-muted`
resolves to) are scoped CSS, per the compiled-CSS constraint above — not because anything here is
missing from the compiled sheet, but because an unverified arbitrary spacing utility is the wrong
default to reach for on an admin route.

**Exact class inventory:** `join`, `join-item`, `btn`, `btn-sm`, `btn-active`, `btn-disabled`.

Tests: `src/tests/toolkit-components.test.ts` (component rendering) and the same file's
`computePageWindow`/`computeItemRange` suites (pure-function edge cases: zero/negative page count,
a stale page past the last item, window boundaries with no needless ellipsis).

## `AdminTable.svelte`

**Contract:** the table shell (survey: AdminTable **confirmed**, tier C, zebra stance tier E).
Props: `density` (`'xs' | 'sm'`, defaults `'sm'`), `zebra` (defaults `false` — the survey's zebra
stance is preference-only, so a screen opts in rather than inheriting a house style), `header` and
`children` (snippets — a `<tr>` of `<th>` cells and an `{#each}` of row markup respectively, so this
component owns the table's chrome and never a row shape or a data contract), `rowCount` (switches
the body to the `empty` snippet when `0`), and `emptyColspan` (defaults `100`, which HTML's own
`colspan` clamps to the real column count — the standard "span whatever exists" value).

Single-line enforcement is a contract, not a full mechanism: every cell gets `white-space: nowrap`
via a `:global()` rule (a wrap can never happen even if a caller forgets), but ellipsis truncation
of one specific long value is the calling cell's own scoped-CSS responsibility — the same
scoped-truncation model `StatusChip`'s `.status-chip-label` already carries. This component cannot
reach inside a snippet's own markup to add truncation there itself, since `header`/`children` are
caller-authored and render as the caller's own template, not this component's.

Headroom for a future selection column is a reserved *convention*, not a built feature (the plan's
own wording): because `header`/`children` are snippets rather than a column schema, adding a
leading checkbox column later is a caller-side edit to those two snippets, never a structural or
breaking change to this component.

**daisyUI assembly:** `table`, `table-xs`, `table-sm`, `table-zebra`. **Verified against the built
`cairn-admin.css` (0.88.3):** all four compile. The wrapper's horizontal-scroll fallback
(`overflow-x: auto`) and the empty-state cell's padding/centering are this component's own scoped
CSS, per the compiled-CSS constraint above.

**Exact class inventory:** `table`, `table-xs`, `table-sm`, `table-zebra`.

Tests: `src/tests/toolkit-table.test.ts`.

## `ExpandableRow.svelte`

**Contract:** the expand-in-place table row (survey: ExpandableRow **confirmed**, tier C — "`table`
+ `collapse` semantics; genre exists in four systems in different shapes, pick at the Classes
pass"; this first shape favors the plainest accessible option over a bespoke one, leaving room for
the Classes pass to reconsider). Props: `expanded`/`onToggle` (fully controlled, matching this
toolkit's own `Pagination` convention rather than owning internal expand state — the "one row
expanded at a time" contract lives in the *caller* holding a single expanded-row id and deriving
`expanded={expandedId === row.id}` for every instance, the same way a radio group's "one selected at
a time" contract rides on `checked`, never on the input's own state), `datum` (the row's own value,
forwarded into `panel` so it never needs a closure), `colspan` (the panel cell's span — the summary
row's own `<td>` count including the trailing trigger cell), `summary` (the summary row's `<td>`
cells), `panel` (a `Snippet<[T]>`, the expand region — "receives the row's datum" per the plan),
and `triggerLabel` (an accessible name for the trigger control, since a chevron glyph alone carries
no text).

Keyboard operability rides the native `<button>` element's own Enter/Space activation — no bespoke
`onkeydown` reinvents what the browser already does correctly for a real button. `aria-expanded`
lives on that one button, the trigger control, per the plan's own wording, never on the `<tr>`
itself (`aria-expanded` is not a valid attribute on a table row). The whole summary `<tr>` also
carries a mouse-only `onclick` convenience (the design spec's "clicking a row expands it in
place"), which is why summary cells should stay non-interactive (plain text, a `StatusChip`, and
similar) — an interactive control nested inside the row would double-handle the click. Per-row
actions belong in the panel, never inline in a summary cell, for the same reason.

**daisyUI assembly:** `btn`, `btn-ghost`, `btn-xs` for the trigger control. **Verified against the
built `cairn-admin.css`:** all three already compile from cairn's own admin usage (the same
methodology `StatusChip`/`Pagination`'s own header comments explain). Row cursor affordance, the
trigger cell's fixed width, and the panel cell's padding/line-wrap-back-on are this component's own
scoped CSS, per the compiled-CSS constraint above.

**Narrow-viewport contract (the Members pass coherence round):** `AdminTable`'s own horizontal-
scroll fallback (see that component's own section above) means a summary row wider than its
viewport scrolls rather than wraps. The trigger cell is `position: sticky; right: 0` with its own
opaque background (`--color-base-100`, not the zebra stripe's alternating color, the standard
frozen-column tradeoff), so the expand control stays inside the visible viewport at every scroll
position, including the unscrolled one — a narrow screen never strands the trigger off-screen with
no visible cue that a row expands.

The panel cell stays a genuine `<td colspan>`, deliberately not `display: block`: a spanning cell
un-tabled that way still resolves its width against an anonymous fixup row the browser generates for
a block-display child of a `<tbody>`, and that anonymous row's own width is *still* driven by the
table's real column widths (verified empirically — `width: 100%` on the un-tabled cell kept
measuring the summary rows' own narrower first-two-column width, not the scroll wrapper's full
width, at every viewport tried). A caller whose panel needs to collapse to fewer columns at a narrow
width instead needs the table itself to never require horizontal scroll in the first place: Members'
own `+page.svelte` hides its lower-priority summary columns (Standing, Phone — both already shown in
full inside the panel) under a `max-width` breakpoint, so the whole row, panel included, fits the
viewport with nothing to scroll, and the panel's own responsive grid (`auto-fit, minmax(12rem,
1fr)`) collapses correctly because the real `<td colspan>` it lives in now measures the viewport's
own width.

**Exact class inventory:** `btn`, `btn-ghost`, `btn-xs`.

Tests: `src/tests/toolkit-table.test.ts`.

## `ListToolbar.svelte`

**Contract:** the list-header band (survey: ListToolbar **confirmed**, tier C, "a layout recipe
over `input`, `select`, `btn`; Polaris applied-filters-as-pills is the reference detail"). Every
prop is a controlled value plus a change callback, the same fully-controlled convention
`Pagination`/`ExpandableRow` already establish — a search box's text, a filter's selected value,
and which filters are promoted are all state the caller owns, never this component.

Props: `search`/`onSearch` (the search box, always rendered); `searchLabel` (defaults `'Search'`,
doubles as the box's accessible name and its placeholder — the toolbar band stays compact by never
rendering a visible label, the same choice the fixture Members screen's own search box already
made); `autofocus` (defaults `false` — the autofocus contract a screen opts into for "cursor lands
in search on open"; native HTML autofocus is the mechanism, so a screen gets it for free just by
mounting the toolbar with the flag set, no `tick()`/`.focus()` wiring of its own); `filters`
(`ListToolbarFilter[]`, defaults `[]`) — each carries `id`, `label` (the control's accessible name,
never rendered as visible chrome either), `options`, `value`, `onChange`, an optional
`defaultValue` (the "no filter applied" value, defaults `'all'`), and `promoted` (defaults `true`)
choosing whether the control renders directly in the band or behind the overflow disclosure;
`overflowLabel` (defaults `'More filters'`, only rendered once at least one filter opts out of
promotion — **present in the contract even when a consumer promotes every filter and never
triggers it**, per the plan's own wording); `primaryAction` (`{ label, onClick }`, the toolbar's
one right-aligned action — omit it for a toolbar with none, but the contract never accepts more
than one); `count`/`itemLabel` (the count line's own scope).

Two functions are exported from the module context, independently unit tested the same way
`Pagination`'s `computePageWindow`/`computeItemRange` are:

- `computeAppliedFilters(filters)` — every filter away from its own `defaultValue`, as a pill
  `{ id, label }` where `label` reads from the matching option's own label (falling back to the
  raw value for a stale or externally-set one, so a pill is never blank). This is also the
  round-trip the survey's Polaris-pills detail describes: a filter's `onChange` firing with its
  `defaultValue` (what the pill's own remove control calls) is exactly what turns its own entry
  back off the next time this function runs.
- `computeCountLine(count, itemLabel, appliedLabels)` — the count line's own copy pattern:
  `"<count> <itemLabel>"`, followed by every applied-filter label joined with a middle dot
  (`"12 households · Overdue · Holding assets"`). The line always renders, even at zero applied
  filters or a zero count — a count line that only sometimes states its scope is the failure mode
  the design spec's own acceptance criterion ("the count line always states its scope") rules out.
  **This is the copy pattern's one home**: a consumer supplies `count`/`itemLabel` and the applied
  filters' own option labels; it never re-derives or restates the join pattern itself.

Applied-filter pills render in the toolkit's one neutral badge tone (`badge-neutral`), never an
alarm color, per the survey's action-discipline standard: an applied filter is a normal state of
the list, not a warning needing a semantic red/amber/green read. A filter's own vocabulary
(including its casing — "Overdue" in a pill, "overdue" in prose) is entirely the options list the
consumer supplies; this component never rewrites a label.

The band itself never wraps — its two children (the controls cluster and the primary action) stay
on one flex line, so the primary action always stays pinned at the band's top-right corner. The
controls cluster (search plus every promoted filter) is a CSS grid, not a wrapped flex row (the
Members pass coherence round): `grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr))` gives
every promoted `<select>` one shared column track (`width: 100%` inside its own cell, replacing the
select's own organic, option-text-driven width), and the search box spans two of those tracks
(`grid-column: span 2`) so it stays wide enough for a longer placeholder without losing the shared
grid. A second wrapped line's controls land under the first line's own column boundaries as a
result, instead of an independently sized, misaligned row — `auto-fill` still keeps the column
count viewport-driven, with no media query of this component's own.

**daisyUI assembly:** `input`/`input-sm` (search), `select`/`select-sm` (every filter, promoted or
overflow), `btn`/`btn-sm`/`btn-primary`/`btn-outline` (the primary action and the overflow
trigger), `dropdown`/`dropdown-content`/`dropdown-open`/`menu` (the overflow disclosure — the same
assembly the survey's RowActions entry names for a row's own overflow menu), `badge`/`badge-neutral`
/`badge-sm` (the pills). **Verified against the built `cairn-admin.css`:** every one of these
already compiles from cairn's own admin usage — none of it needed a safelist addition, unlike
`StatusChip`'s `status-*` family or `Pagination`'s `join-item`. The overflow disclosure carries real
toggle semantics (the Members pass coherence round): a `$state` boolean drives `class:dropdown-open`
on the wrapping `.dropdown` (daisyUI's own already-compiled open/close rule, layered on top of the
bare `:focus-within` daisyUI gives every `.dropdown` for free) plus `aria-expanded`/`aria-controls`
on the trigger button, so the disclosure reports its real state and opens on a click, not only a
focus move — present in the contract even though Members promotes every filter and never exercises
it. The trigger and content are a plain `<button>` plus a plain `<div>` (no `tabindex` on either):
the trigger is already focusable as a real button, and the content holds only real, already-
focusable controls (`<select>`), so nothing here needs the tabindex-on-a-non-interactive-element
idiom daisyUI's own docs show for a menu of plain, non-native items. The search box strips the
browser's own `type="search"` chrome (`appearance: none`): left in place, some engines draw a
second, separately positioned focus ring for a native search input on top of `.input`'s own themed
one, reading as a doubled outline. Pill layout, the pill's own remove control, the controls grid,
and the count line's muted color (`var(--color-muted)`, matching `Pagination`'s own range line) are
this component's own scoped CSS, per the compiled-CSS constraint above.

**Exact class inventory:** `input`, `input-sm`, `select`, `select-sm`, `btn`, `btn-sm`,
`btn-primary`, `btn-outline`, `dropdown`, `dropdown-content`, `dropdown-open`, `menu`, `badge`,
`badge-neutral`, `badge-sm`.

Tests: `src/tests/toolkit-toolbar.test.ts` (component rendering) and the same file's
`computeAppliedFilters`/`computeCountLine` suites (the applied/removed pill round-trip, the
count-line copy pattern at zero filters/zero count, a stale filter value with no matching option).

## What is not here yet

The Members screen rebuild (Task 7) is every component's first real consumer.
