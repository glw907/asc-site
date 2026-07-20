# Admin/Back-Office Component Inventory: Carbon, Polaris, Atlassian, Material 3

Scope: components relevant to admin/back-office, data-heavy interfaces — tables, lists, forms,
status display, page chrome, feedback, and row/overflow actions. Marketing and pure-mobile
components are excluded. Sourced from the official component index pages of each system
(carbondesignsystem.com, polaris.shopify.com / polaris-react, atlassian.design / Atlaskit
docs, m3.material.io), July 2026.

---

## 1. IBM Carbon Design System

### Tables & Data Display

- **DataTable** — sortable, filterable, actionable tabular data grid.
  Variants: 4–5 named row-density sizes (extra large/large/medium/small/extra small, or
  tall/normal/short/compact in v10); toolbar with search/filter/primary action; single or
  batch row selection with a dedicated **batch action toolbar** replacing the normal toolbar;
  expandable rows; zebra striping; trailing overflow-menu column for per-row actions;
  pagination as a separate companion element; empty state replaces the table body entirely;
  skeleton loading state matching row/column geometry.
- **Structured List** — simpler read-mostly paired-content list (term/definition, spec
  sheets), recommended ceiling ~25 items, no nesting. Selectable variant is single-select
  (radio) only. Default vs. condensed sizing; hang vs. flush column alignment.
- **Contained List** — compact list for small containers (cards, sidebars) with inline
  actions; one nesting level max.
- **Tree View** — multi-level hierarchical navigation/organization without column structure;
  branch/leaf expand-collapse.
- **Tag** — small categorization/filter label. Ten-color palette (semantic by convention, not
  fixed meaning); filterable/removable variant with a clear action; disabled state. **Carbon
  ships no separate Badge component — Tag covers that role.**
- **Tile** (Clickable / Selectable / Expandable) — flexible grid-responsive content container.
  Clickable tile is a single link target; selectable tile is radio- or checkbox-style;
  expandable tile pushes page content down on reveal (not an overlay).
- **Pagination** — prev/next controls, inline page-jump select, items-per-page selector, page
  indicator; explicit disabled/last-page/unknown-total states.

### Forms

- **Form** (layout pattern, not a widget) — label + input + helper/validation + actions;
  button alignment convention (left for standard forms, right for wizards).
- **Text Input / Text Area** — default/invalid/disabled states, optional character counter.
- **Select / Dropdown family** — three named variants: **Dropdown** (single choice),
  **Multiselect** (multiple + filtering), **Combo box** (free text + typeahead). Shared
  three-size scale (48/40/32px) used across most form controls.
- **Checkbox** — supports an indeterminate state for parent/child partial selection.
- **Radio Button**, **Toggle** (binary switch, distinct from Content Switcher's view-switching
  and Checkbox's list-selection).
- **Date Picker** — three sub-variants: simple text input, calendar picker + manual entry,
  time picker.
- **File Uploader** — button trigger or drag-and-drop; per-file loading/success/error status;
  uploaded-file list with delete action.
- **Search** — large (global) vs. small (component-local, e.g. filtering a table) sizes.
- **Toggletip** — click-triggered contextual help attached to a form control (touch/keyboard
  accessible cousin of Tooltip).

### Status & Feedback

- **Notification** (Toast / Inline) — Toast is non-modal, top-right, auto-dismisses at 5s;
  Inline persists until dismissed. Type: error/warning/success/info. **High-contrast
  ("critical") vs. low-contrast ("less disruptive")** is an explicit severity lever
  independent of color/type.
- **Loading (spinner)** — overlay/blocking vs. inline/contextual; standard vs. small size;
  recommended once a wait exceeds ~3 seconds.
- **Inline Loading** — per-action state machine: inactive → active → success (holds ~1.5s) →
  error; one instance at a time, triggering control disabled while active.
- **Progress Indicator** — multi-step wizard tracker; step states include complete/current/
  incomplete/invalid/disabled/warning; horizontal or vertical orientation; supports backward
  navigation to completed steps.
- **Skeleton states** — structural loading placeholders scoped to data-shaped containers
  (tiles, structured lists, data tables), not arbitrary UI.
- **Empty states** (pattern) — table body replaced by message + optional CTA, headers/footer
  suppressed.
- **Tooltip** — hover/focus contextual info, base of Toggletip.

### Page Chrome & Navigation

- **UI Shell — Header** — fixed left-to-right hierarchy: product identity → nav links →
  global actions (search, notifications, account, app switcher) with no gaps.
- **UI Shell — Left Panel** (side nav) — recommended past ~5 items; mixes flat links and
  expandable sub-menus, capped at two nesting levels (a third level becomes page tabs
  instead).
- **UI Shell — Right Panel** — optional companion contextual/utility surface.
- **Breadcrumb** — location-based vs. path-based variants; current page excluded by default;
  overflow collapses middle crumbs, keeping first + last two, never wraps.
- **Tabs** — line (lightweight, nested) vs. container (page-level) weights; practical cap
  ~six before recommending side-nav instead.
- **Content Switcher** — toggles between full content views occupying the same space (e.g.
  grid/table view toggle); distinct from Tabs (separate sections) and Toggle (strict binary).
- **Accordion** — vertical progressive disclosure; supports multiple simultaneously-open
  sections and a tree-like start-aligned icon variant.

### Actions & Menus

- **Button** — emphasis tiers primary/secondary/tertiary/ghost; **Danger variant** available
  at primary/tertiary/ghost weights; rule: never two primary buttons together.
- **Modal** — passive vs. transactional; **Danger modal** requires the title and confirm
  button to both name the specific destructive action ("Delete 3 members," never "Confirm");
  sizes xs/s/default/large (large reserved for content like an embedded table); vertical
  scroll allowed, horizontal disallowed.
- **Overflow Menu** — icon-triggered row/space-constrained action menu; destructive items
  separated below a divider; explicit scope rule — overflow menu is for a small object (a row,
  a card), Menu Button/Combo Button are for a large object (a whole table/page).
- **Menu** — general-purpose disclosure list underlying Overflow Menu and Menu Button.
- **Menu Button / Combo Button** — page-header-level action triggers; menu width can expand
  independently of the trigger's width.
- **Link** — inline or standalone navigation element.

---

## 2. Shopify Polaris

### Tables & Data Display

- **IndexTable** — the primary actionable-resource table (orders, products). Row selection
  (checkbox column, shift-click range) with **promoted bulk actions** (surfaced) vs.
  **overflow bulk actions**; sortable columns; `condensed` mode collapses bulk actions on
  small screens; `lastColumnSticky` pins a trailing actions column during horizontal scroll;
  zebra striping; row-level **tone** (subdued/critical/warning/success); parent/child row
  grouping via `rowType` + `selectionRange`. Sort/filter/paginate logic is left to the
  consuming app — the component is presentation-only.
- **DataTable** — static/analytical grid, distinct from IndexTable by having **no
  selection/bulk-actions model**. Per-column content-type alignment, a totals row, fixed
  first columns and sticky header for scroll, zebra striping and a density option.
- **ResourceList / ResourceItem** — pre-IndexTable pattern for heterogeneous, per-item custom
  layout (`renderItem`); same promoted/overflow bulk-action split; separate empty-state vs.
  empty-search-results state; ResourceItem supports media/avatar slot, "shortcut" actions,
  and persistent (always-visible) vs. hover-revealed actions.

### Forms

- **FormLayout** — vertical field-stacking primitive with a `Group` sub-component for
  side-by-side related fields; pure structure, no validation logic.
- **TextField** — multiline/monospaced variants, prefix/suffix content, connected-field
  joining, character count, clear button.
- **Select** — option groups, `tone="magic"` (AI-flavored) variant.
- **ChoiceList** — single-select (default) vs. `allowMultiple`; nested content per choice.
- **Combobox / Autocomplete** — accessible typeahead built from TextField + Popover + Listbox;
  `allowMultiple`, lazy-load on scroll.
- **DatePicker** — range mode (`allowRange`), multi-month display; Polaris explicitly
  recommends never using it standalone — always pair with a text field for typed entry.
- **InlineError** — brief field-adjacent validation message tied via `aria-describedby`.
- **Filters** — search + categorical filter bar; applied filters render as removable pills;
  a `shortcut` promotes 2–3 filters into the visible bar, the rest sit behind a disclosure.
- **IndexFilters** — the maturity ladder above Filters, purpose-built for IndexTable: **saved
  views as tabs** (create/rename/duplicate/delete, each capturing its own filter+search+sort
  state), sort control, dirty-state-aware "Save"/"Save as."

### Status & Feedback

- **Badge** — non-interactive, system-assigned status (domain presets for financial and
  fulfillment status plus generic info/success/attention/warning/critical/incomplete tones).
  **Badge (status, system-set) vs. Tag (categorization, merchant-set, interactive/removable)
  is a strict, never-conflated split.**
- **Tag** — interactive, merchant-controlled categorization label; removable, clickable, or
  link variants.
- **Banner** — page/section-level persistent message; four tones (info/success/warning/
  critical); dismissible by default except for critical/required-action banners.
- **Toast** (deprecated component, App Bridge API preserves the pattern) — bottom transient
  confirmation; never the sole path to an action if it carries a button; `aria-live=assertive`.
- **Spinner** — indeterminate, component/action-scoped, not for full-page loads.
- **SkeletonPage / SkeletonBodyText / SkeletonDisplayText / SkeletonThumbnail / SkeletonTabs**
  — structural loading placeholders mirroring the eventual real layout; convention: only
  genuinely dynamic content gets skeletonized, never a label that won't change.
- **ProgressBar** — determinate long-running task indicator (highlight/primary/success/
  critical tones), not for page loads.
- **Exception List** — compact itemized-issue list, a lighter alternative to Banner.

### Page Chrome & Navigation

- **Page** — outer page wrapper: title/subtitle/titleMetadata (inline status), primary +
  secondary actions (auto-collapsing into a dropdown), sibling-object pagination. Its own
  `backAction`/breadcrumb slot is deprecated in favor of App Bridge–owned breadcrumbs.
- **Card** — primary content-grouping container; sectioned/titled/flushed sections; header
  icon-actions vs. footer primary-action convention (one primary CTA per card).
- **Tabs** — `fitted`, overflow via disclosure, badge/count per tab.
- **Pagination** — prev/next or URL-based, `type="table"` variant; guidance: only for lists
  over 25 items, mobile prefers infinite scroll.
- **Navigation / TopBar / Frame** (internal Shopify-admin-only, several deprecated as
  standalone React components but pattern preserved via App Bridge) — sidebar with
  collapsible sections/badges, header search + user menu, and the Frame shell that nests them
  together with Toast and Contextual Save Bar.
- **Contextual Save Bar** (deprecated) — sticky save/discard bar appearing only while a form
  is dirty, unifying multiple independent forms under one bar.

### Actions & Menus

- **Button** — primary/secondary/tertiary/plain/monochrome-plain; **success/critical tones**
  (critical is the destructive hook); sizes micro/slim/medium/large; icon-only, split-button.
- **ButtonGroup** — segmented-style joined arrangement; convention caps at six icon-only
  buttons.
- **ActionList** — the canonical menu-content primitive nested in a Popover for row-overflow
  ("...") menus; auto-search past 8 items; **destructive item styling**; verb+noun copy
  convention.
- **Popover** — controlled overlay, preferred position/alignment; canonical ActionList pairing.
- **Tooltip** — hover/focus hint, commonly labels icon-only buttons.
- **Modal** (deprecated component, App Bridge preserves pattern) — small/large/fullScreen
  sizes; **destructive confirmation pattern** (critical-tone primary + Cancel secondary); max
  two footer buttons.
- **Setting toggle** (deprecated) — labeled on/off row pairing description text with state.
- **Sheet** (deprecated) — non-modal side panel for more room than a Popover without full
  modal interruption.

---

## 3. Atlassian Design System

### Tables & Data Display

- **Dynamic Table** — the default admin list-view table with built-in pagination, sorting,
  and row reordering. `isLoading` overlays a spinner on the current page rather than blanking
  it; `onSort`/`sortKey`/`sortOrder` are controlled (consumer supplies pre-sorted rows);
  `emptyView` accepts a full composed element (typically an Empty State); drag-based row
  reordering is first-class; `caption` for accessibility.
- **Table (tokens-based)** — the docs themselves flag this as a deprioritized experiment with
  no production support, actively steering consumers back to Dynamic Table — a design-system
  gap, not a real second option.
- **Table Tree** — expandable table for nested/hierarchical parent-child data, a distinct
  component from Dynamic Table's flat model.
- **Pagination** — standalone page-number control for custom/server-paginated lists outside
  Dynamic Table's built-in pager.
- **Inline Edit** — swaps a read view for an edit view in place on the same page (no
  navigation to a separate form); `keepEditViewOpenOnBlur` avoids a stray click silently
  discarding an unfinished edit — a direct "click a cell to edit it" pattern.

### Forms

- **Form / FormHeader / FormSection / FormFooter** — structural wrapper; `FormFooter` has an
  `align` prop for button alignment.
- **Field / Label / RequiredAsterisk** — required fields marked next to the label, not via
  placeholder text alone.
- **Three-state validation vocabulary**: `ErrorMessage` (invalid), `ValidMessage` (confirmed
  valid), `HelperMessage` (neutral guidance) — a deliberate three-way split, not binary.
- **Text field** — `isInvalid`, `isDisabled`, **`isCompact`** (dense/table-inline sizing),
  `elemBeforeInput`/`elemAfterInput` icon/affix slots.
- **Text area, Select, Checkbox, Radio, Toggle** — standard set.
- **Calendar, Date time picker** — Calendar is the visual grid underlying the combined
  date+time picker.
- **Range** — approximate-value slider, more relevant to settings/filters than CRUD.
- **Button danger/destructive vocabulary** — `default`/`primary`/`subtle`/`link` plus
  **`warning`** (significant but reversible-ish consequence) and **`danger`** (final
  confirmation of an irreversible action — meant for the confirming button inside a modal,
  not necessarily the triggering row action); `isLoading` preserves button width; explicit
  **compact spacing variant called out for table/dense-row use**.
- **Modal Dialog** — named width tiers small(400px)/medium(600px)/large(800px)/x-large(968px)
  rather than free-form sizing; destructive confirmation pairs Modal Dialog with a
  danger-appearance confirm button by convention.

### Status & Feedback

- **Lozenge** — status pill for a single meaningful attribute. Appearance vocabulary
  (`default`/`success`/`removed`/`inprogress`/`new`/`moved`) maps to **categories of
  meaning**, not literal colors.
- **Badge** — numeric-only indicator (counts/tallies), appearances `default`/`primary`/
  `added`/`removed`/`important` — draws attention to a *count*, where Lozenge names a *state*.
- **Tag / Tag Group** — compact, removable, multi-value categorization label (`removeButtonText`
  for accessible dismissal; `rounded` appearance specifically recommended when paired with an
  Avatar).
- **Date Label** — non-interactive date rendering that can also signal status (e.g. overdue).
- **Three-tier messaging hierarchy**: **Banner** (top-of-screen, persistent, app-wide) →
  **Section Message** (inline, scoped to a page section; fullest tone vocabulary — information/
  success/warning/error/discovery — with title, icon override, actions) → **Flag** (transient
  toast-layer confirmation, `bold` variant with no dismiss button forces deliberate
  acknowledgment, `isAutoDismiss` at 8s, managed via a Flag Group). **Inline Message** is a
  lighter-footprint sibling for per-field/per-row notes.
- **Empty State** — header + description + primary/secondary(/tertiary) action, commonly
  plugged directly into Dynamic Table's `emptyView` slot.
- **Progress Bar** (system-process %) vs. **Progress Indicator** (current step in a fixed
  sequence) vs. **Progress Tracker** (all steps visible at once) — a deliberate three-way
  split of progress semantics.
- **Skeleton** (structural placeholder shapes) vs. **Spinner** (generic loading icon, used
  where structural preview isn't meaningful, e.g. inside a button or Dynamic Table's overlay).

### Page Chrome & Navigation

- **Page / Page Header** — grid-based page layout; Page Header composes breadcrumbs, action
  buttons, search, and filters into one header region for an admin list page.
- **Breadcrumbs** — pairs with Page Header rather than standing alone.
- **Panel** — auxiliary content container alongside main content, distinct from Drawer's
  slide-in overlay behavior.
- **Navigation System** — current app-shell navigation, explicitly superseding deprecated
  Atlassian Navigation, Side Navigation, Layout Grid, and Page Layout.
- **Tabs** — composable API (`Tabs`/`Tab`/`TabList`/`TabPanel` + hooks) rather than a single
  monolithic component; requires a unique `id` when multiple Tabs instances share a page.
- **Menu** — general-purpose option list, sibling to Dropdown Menu for standalone/persistent
  (not triggered-popup) option lists.

### Actions & Menus

- **Dropdown Menu** — the canonical row-overflow ("⋯") pattern; item-type variety (standard,
  checkbox/multi-select, radio/single-select, grouped, **destructive** items get distinct
  styling) mirrors Button's danger convention.
- **Popup, Inline Dialog, Tooltip** — a graduated overlay-weight ladder: Tooltip (read-only,
  no controls) → Inline Dialog (small content, can hold controls) → Popup (generic floating
  overlay) → full Dropdown Menu/Modal.
- **Blanket** — the shared dimmed-backdrop primitive underneath Modal/overlay-class components.
- **Drawer** — slide-in side panel alternative to Modal for detail view/edit without full page
  navigation — a common "open row detail in a side drawer" admin pattern.
- **Avatar / Avatar Group** — Avatar Group stacks with a max-count "+N" overflow, the standard
  "assigned to"/"members" table-cell pattern.
- **Icon, Link/LinkButton** — building blocks referenced throughout.
- **Layout primitives** (documented as first-class components): Box, Stack, Inline, Flex,
  Grid, Bleed, Anchor/Pressable/Focusable, Text/**MetricText** (token-backed typography;
  MetricText specifically for stat/metric numbers — relevant to an admin overview strip),
  Responsive, XCSS.

---

## 4. Material Design 3 (M3)

**Headline finding: M3 has no Data table component and no Banner component — both existed in
Material 2 and were dropped for M3, with no first-party replacement guidance for either.**
`m3.material.io/components/data-tables` 404s; a still-open (closed-as-not-planned) GitHub
issue on `material-components/material-web` (#3867) confirms it was never restored; teams
building admin/data UI in M3 improvise from Lists + Cards + Chips instead. No Breadcrumb
component exists either. This makes M3 clearly the weakest of the four for admin/back-office
data density — its component set is optimized for consumer mobile apps.

### Tables & Data Display (notably thin)

- **Data table — ABSENT** (dropped from spec; no sort/select/density/column-action guidance
  exists anywhere in the current M3 docs).
- **Lists** — scannable item rows at fixed heights (56/72/88dp) driven by content; slots for
  label, supporting text, leading image, trailing icon. "M3 Expressive" (Dec 2025) adds
  standard/segmented visual styles and highlighted selection states. Alignment rule: rows
  middle-align by default, top-align once 88dp or 3+ lines — the closest thing to a density
  rule for text-heavy rows.
- **Cards** — elevated/filled/outlined variants distinguished by depth/fill, not density;
  read as content-summary units, not table replacements.
- **Divider** — full-bleed, inset, and (new) vertical variants; "groups, doesn't separate."
- **Carousel** — present in the index but a media/marketing pattern, out of scope.

### Forms

- **Text fields** — filled (more visual weight, dialogs/short forms) vs. outlined (long
  forms); blank/with-input/error states.
- **Checkbox** — four states: unselected, selected, indeterminate, and error (layered across
  selection states).
- **Switch** — strict on/off for independently controllable settings, vs. Radio's mutual
  exclusivity; M3 widened the track and added an optional handle icon.
- **Radio button** — single-select from a set.
- **Date pickers** — three variants: docked (text-field trigger, forms), modal (full-screen,
  ranges), modal date input (keyboard entry, compact layouts).
- **Sliders** — continuous-value/settings input, not core data entry.

### Status & Feedback

- **Snackbar** — bottom-anchored transient notification; dismissive vs. non-dismissive modes.
- **Banner — ABSENT** (removed entirely; the docs funnel persistent-status use cases into
  Dialog or Snackbar instead — a real gap for a persistent top-of-page status strip).
- **Badges** — small (plain dot, unread-only, no count) vs. large (label text, up to 4 chars
  incl. a "+" overflow marker); anchored to an icon's upper-trailing edge.
- **Progress indicators** — linear/circular; framed more around motion/attention-capture than
  a static determinate/indeterminate contrast; "M3 Expressive" (Aug 2024) added wavy shapes.
- **Tooltips** — plain (brief label) vs. rich (title + supporting text + optional
  links/buttons).

### Page Chrome & Navigation

- **Top app bar** — four configurations (search, small, medium-flexible, large-flexible);
  deliberately capped at 1–2 essential actions, pushing bulk actions elsewhere — a real
  friction point for admin toolbars wanting more controls.
- **Navigation drawer** — standard (persistent, ≥840dp) vs. modal (overlay, <840dp); **now
  deprecated in "M3 Expressive" (May 2025) in favor of the expanded navigation rail.**
- **Navigation rail** — medium/large screens, 3–7 destinations + optional FAB, now positioned
  as the drawer's replacement.
- **Navigation bar** — bottom bar, phone-width, low relevance to desktop admin.
- **Tabs** — primary (top-level) vs. secondary (always nested below primary).
- **Breadcrumb — does not exist** as a named M3 component; confirmed absent from the index.

### Actions & Menus

- **Menus** — unified generic Menu concept (dropdown/exposed-dropdown merged); separate
  **context menu** variant for right-click/secondary-click on an element — the closest analog
  to a row-action menu, though not explicitly framed as a table pattern.
- **Dialogs** — basic (single confirmation/alert) vs. full-screen (multi-step); explicitly
  called out for **confirming high-risk/destructive actions** — M3's one clear destructive
  pattern statement, since it has no destructive button color.
- **Buttons** — emphasis tiers filled > filled-tonal ≈ elevated ≈ outlined > text > icon
  button. **No error/danger button variant anywhere in the spec** — destructive intent lives
  only in Dialog confirmation copy, never in button color.
- **Search** — search bar (persistent, grows on focus) vs. search view (full-screen entry
  point).
- **Chips** — four types, a genuinely decision-revealing taxonomy: **Assist** (smart/auto
  actions), **Filter** (tag-style content filtering, substitutes toggle/checkbox groups),
  **Input** (user-entered discrete data, e.g. applied filters/contact chips), **Suggestion**
  (system-generated suggested responses). Zero elevation by default.

### M3 thin/absent coverage summary
Data table (absent), Banner (absent), Breadcrumb (absent), destructive button color (absent),
row-action menu (implicit only, not table-framed), navigation drawer (being sunset in favor
of navigation rail).

---

## Cross-System Synthesis

### Convergent core — component genres present in 3 or 4 of the 4 systems

These are the genres an admin toolkit should assume are "table stakes," each system's own
name in parentheses:

| Genre | Carbon | Polaris | Atlassian | M3 |
|---|---|---|---|---|
| Structured data table (sort/select/density) | DataTable | IndexTable + DataTable | Dynamic Table | **absent** |
| Pagination | Pagination | Pagination | Pagination | **absent** |
| Status/label family (badge–tag–pill) | Tag (covers both roles) | Badge vs. Tag | Lozenge vs. Badge vs. Tag | Badge, Chips |
| Overflow / row-action menu | Overflow Menu | ActionList in Popover | Dropdown Menu | Menu (context menu, weak) |
| Empty state | pattern (table body swap) | EmptyState component | Empty State component | **thin/absent** (no dedicated component) |
| Skeleton loading placeholder | Skeleton states | SkeletonPage/BodyText/etc. | Skeleton | **absent** (no named skeleton) |
| Transient toast/snackbar feedback | Notification (Toast) | Toast (deprecated, pattern lives) | Flag | Snackbar |
| Persistent page/section banner | Notification (Inline) | Banner | Banner + Section Message | **absent** (removed from spec) |
| Form layout primitive | Form (pattern) | FormLayout | Form/FormSection/FormFooter | **thin** (no layout wrapper, just fields) |
| Danger/destructive button + confirm-modal pattern | Danger button + Danger modal | Critical-tone Button + Modal confirm | `danger` appearance + Modal Dialog convention | Dialog-only (no danger button color) |
| Breadcrumb | Breadcrumb | Breadcrumbs (deprecating in-place) | Breadcrumbs | **absent** |
| Tabs | Tabs | Tabs | Tabs | Tabs |
| Side navigation / drawer | UI Shell Left Panel | Navigation (internal-only) | Navigation System | Navigation drawer/rail |
| Multi-step or determinate progress indicator | Progress Indicator | ProgressBar | Progress Bar/Indicator/Tracker (3-way split) | Progress indicators (linear/circular) |
| Tooltip | Tooltip (+ Toggletip) | Tooltip | Tooltip (+ Inline Dialog) | Tooltip (plain/rich) |
| Modal/dialog | Modal | Modal (deprecated, pattern lives) | Modal Dialog | Dialog |

**14 of these 15 genres reach at least 3/4 systems.** Material 3 is the system that most often
supplies the missing quarter — it has no data table, no pagination, no banner, no breadcrumb,
and no dedicated skeleton/empty-state component. This is a real, well-documented gap (M3 is
mobile-app-first), not a naming difference — where Carbon/Polaris/Atlassian have converged on
a genre, M3 routes the same job through a lower-fidelity substitute (Dialog absorbs both
destructive-confirmation and persistent-banner duty; Lists/Cards absorb table duty).

### Genres that appear in only 1–2 systems (system-specific, not yet convergent)

- **Saved/named table views as tabs** (Polaris IndexFilters) — only Polaris treats "save this
  filter+sort+search combination as a reusable view" as a first-class table feature.
- **Dedicated Inline Edit component** (Atlassian) — click-a-cell-to-edit-in-place as its own
  named component with dirty-state handling; Carbon/Polaris achieve the same effect ad hoc
  with a TextField, not as a packaged component.
- **Three-way progress semantic split** (Atlassian: Progress Bar vs. Indicator vs. Tracker) —
  Carbon and M3 fold this into one "Progress Indicator/indicator" concept; Polaris only has
  ProgressBar.
- **Chip taxonomy by intent** (M3: Assist/Filter/Input/Suggestion) — a uniquely fine-grained
  categorization other systems don't draw; Polaris/Atlassian/Carbon just have Tag.
  Conversely, **M3 is missing Carbon/Polaris/Atlassian's status-badge granularity** (no
  Lozenge-equivalent workflow-state pill).
  workflow-state pill).
- **Explicit named row-density scale** (Carbon: 4–5 named row heights) — Atlassian only
  offers a binary `isCompact`; Polaris has a generic "increased density" toggle; M3 has no
  table to have density on.
- **Contextual Save Bar** (Polaris, deprecated) — a cross-form dirty-state bar unifying save
  actions for multiple independent forms on one page; no equivalent named component in the
  other three.
- **Table Tree / hierarchical expandable table as its own component** (Atlassian's Table
  Tree, Carbon's separate Tree View for nav) — two different manifestations, neither matched
  by Polaris (which folds parent/child grouping into IndexTable's `rowType`) or M3 (no table
  at all).
- **Documented layout-primitive package as components** (Atlassian: Box/Stack/Inline/Flex/
  Grid/Bleed/MetricText) — Atlassian is alone in treating these as citable, individually
  documented components; the other systems either don't document a primitives layer this way
  in their public component index, or fold it into internal grid guidance.
- **Avatar Group with "+N" overflow as a named component** (Atlassian) — Polaris has an
  avatar slot inside ResourceItem but no dedicated grouped-overflow component; Carbon and M3
  don't surface this as an admin-table pattern at all.
- **Drawer/Sheet as a distinct side-panel-vs-modal component** (Atlassian's Drawer, Polaris's
  deprecated Sheet) — Carbon and M3 don't name this as its own component (M3's Navigation
  drawer is nav-only, not a detail/edit panel).

### Takeaway for the ASC admin toolkit

The convergent core — data table with density/sort/select, status-pill vocabulary, row
overflow menu, empty/skeleton states, toast + persistent banner as two distinct feedback
tiers, form layout wrapper, a danger-button-plus-confirm-modal destructive pattern,
breadcrumb, tabs, side nav, progress indicator, tooltip, modal — is the safe, evidence-backed
baseline to build against; it is not one system's house style, it is what three or four
independent, mature admin/back-office design systems converge on. The 1–2-system items above
are the differentiators worth a deliberate yes/no decision rather than default inclusion:
saved table views, inline-edit-as-a-component, a three-way progress split, and a documented
density scale are the ones most directly relevant to an admin data-table-heavy toolkit.
