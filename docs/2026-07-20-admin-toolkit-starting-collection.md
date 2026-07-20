# Cairn admin toolkit — rough starting collection (draft, 2026-07-20)

> **GRADED 2026-07-20:** the research survey ran and graded every entry; the verdicts
> live in `docs/2026-07-20-admin-toolkit-research-survey.md`, which supersedes this file
> as the working reference. This file stays as the pre-research hypothesis record.
>
> Drafted straight from the walkthrough evidence
> (`docs/2026-07-20-admin-toolkit-catalog.md`), BEFORE the design-research survey that
> opens the effort. Every entry is a hypothesis: the research phase (published UX
> literature plus mature admin design systems — NN/g, IBM Carbon, Shopify Polaris,
> Atlassian) confirms, reshapes, or kills it, and the per-screen passes then harden
> survivors into real cairn components. Evidence pointers name catalog stops.

## Standards (written doctrine, not components)

- **Density doctrine.** Compact single-line rows are the default; secondary facts move
  to the detail page, never stack in a cell. Looks-nice-but-scrolls is the named
  failure mode. (Stops 1, 4; every list screen.)
- **Page composition.** A screen leads with what the operator acts on; unbounded lists
  paginate or scope; grouped lists collapse; one list idiom per page. (Stops 2, 4.)
- **Action discipline.** Corrective/destructive actions (Release, Refund, Drop,
  Delete) present quietly — an overflow menu or subdued link — never an alarm-red link
  repeated on every row; semantic red belongs to state. Destructive page actions live
  in a quarantined zone, not floating at the top. (Stops 2, 4, 5.)
- **State-vocabulary consistency.** One chip system across screens; every state in a
  domain gets the same dressing tier; over-capacity gets an explicit visual voice.
  (Stops 1, 3, 4; events sweep.)
- **Formatters are toolkit citizens.** Money renders from cents with separators;
  civil dates never pass through a timestamp formatter (the "4:00 PM" artifact); one
  Anchorage-timestamp form. (Stops 2, 5; member-detail sweep.)
- **Copy register.** Breadcrumbs carry the entity name; leaf crumbs match the page
  title's case; count lines state their filter scope; empty states explain what fills
  the surface and link the action. (Stops 3, 5; sweep.)

## Chrome and layout

- **PageHeader** — eyebrow, title, subtitle/count line, actions slot; breadcrumb
  integration that accepts the entity name. Kills the double-header assembly (waivers
  sweep) and the buried-CTA pattern.
- **DetailPage skeleton** — header + fact summary + child-collection sections; the
  shape Members detail approximates and class detail lacks. (Stop 5; member-detail
  sweep.)
- **CollapsibleSection** — grouped-list container with designed boundary rhythm;
  Geoff's explicit ask on Assets. (Stop 4.)
- **SegmentedTabs** — the pill switcher Assets and Committees hand-roll. (Stops 4;
  committees.)

## Lists and tables

- **AdminTable** — the summary-table recipe: compact rows, zebra option, uppercase
  micro-label headers, em-dash empties, sticky header past a height, an empty-state
  slot, and column-curation guidance in its docs. (Stops 1, 3, 4.)
- **ListToolbar** — search + filter controls + primary action in one designed band;
  kills the loose two-row cluster. (Stop 1.)
- **Pagination** — trivial, shared, currently reinvented per screen. (Stop 1.)
- **ExpandableRow (master-detail)** — a row that opens in place to show children
  (class → roster); Geoff's headline ask on Classes. (Stop 3.)
- **ScopePicker** — season/scope selection as a real select bound to the list, not a
  bare text input plus "View". (Stop 2; waivers sweep.)

## Data display

- **Chip** — one component, tiered variants (neutral/info/success/warning/danger,
  solid/tint/outline), owned padding and truncation (no text overflow), optional
  legend surface. Absorbs standing chips, kind tags, payment states, category chips.
  (Stops 1, 3, 4; committees, events sweeps.)
- **CountBadge / AttentionMark** — numeric pills with an attention tint, shared with
  the sidebar badge pipeline so counts never disagree. (Stops 1, 4; waivers sweep.)
- **StatBand / StatTile** — labeled big-number tiles with real number formatting;
  replaces the hand-stacked micro-labels and the dead daisy `stats` classes (pass-B
  harvest finding 5). (Stop 2; asset-requests sweep.)
- **PersonRef / EntityRef** — renders a person or entity reference from an id (name,
  link, optional chip) and makes the raw-UUID fallback hard to write. (Stop 5.)
- **MoneyAmount / CivilDate / Timestamp** — the formatter primitives behind the
  standard above.

## Forms

- **FormLayout kit** — field rows, label register, two-column pairing rules, section
  headers, helper-text style; the class/event edit forms are the evidence. (Stop 5;
  event-detail sweep.)
- **SettingCluster** — the per-setting micro-form (control + its own Save) done
  deliberately, with consistent action alignment. (Club-settings sweep.)
- **DangerZone** — the quarantined home for Delete/Archive/Rollover actions.
  (Stop 5; club-settings sweep.)
- **RowActions** — per-row overflow menu implementing the action-discipline standard.
  (Stops 2, 4, 5.)
- **MoveDialog** — the "move X between containers, money follows" pattern (student
  between classes, asset between households). (Stop 3 requirements evidence.)

## Engine fixes riding the effort (not components)

Local-dev auth story (role-picker auto-login behind a `.dev.vars` flag); the
Overview-always-highlighted prefix-match bug; no active signal when the current item's
group is collapsed; "New <plural>" button copy; collapsed-group boundary spacing.
(Cross-cutting entry; pass-B harvest 6–7.)
