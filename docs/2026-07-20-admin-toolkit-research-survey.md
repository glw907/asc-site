# Admin toolkit design-research survey and collection grading

> The research phase that opens the `admin-screen-passes` effort (methodology ruling in
> `docs/2026-07-20-admin-toolkit-catalog.md`: recipes grounded in published evidence, not
> impressions). This document reports what the evidence supports, grades the starting
> collection (`docs/2026-07-20-admin-toolkit-starting-collection.md`) against it, and
> records the assembly doctrine. The Members pass and every later pass inherit these
> citations instead of re-deriving them.

Method, run 2026-07-20: a deep-research workflow (106 agents; every surviving claim
verified against its primary source by three adversarial voters), two component-inventory
sweeps across eight mature design systems (appendices:
`docs/2026-07-20-admin-toolkit-inventory-big-four.md` for Carbon, Polaris, Atlassian, and
Material 3; `docs/2026-07-20-admin-toolkit-inventory-second-tier.md` for Ant Design,
Primer, Fluent 2, and Spectrum), and an audit of which daisyUI classes the compiled
`cairn-admin.css` actually contains.

Two rulings from Geoff shape everything below. Assemble from daisyUI wherever
possible, and avoid building entirely new things.

## Evidence tiers

Every verdict in this document carries one of three labels, per the methodology ruling:

- **E (evidence)** — a verified finding from a controlled study or moderated testing,
  cited to its primary source.
- **C (convention)** — no surviving study, but three or more of the eight surveyed
  design systems independently converged on the same answer.
- **G (Geoff's verdict)** — the literature is silent and the systems diverge; the call
  is taste, made explicitly and logged in `docs/design-benchmark/decisions.md`.

The survey produced verified evidence in three of the ten scoped areas: zebra striping,
list-loading patterns, and form label placement. The other seven areas (density values,
column curation, chip vocabularies, per-row actions, expandable rows, empty states, stat
tiles) produced no surviving verified claims. They are convention tier and are labeled as
such.

## What the evidence says

### Zebra striping: preferred, with no measured performance effect

The only controlled work found is Enders' pair of studies (A List Apart, 2008; the first
also peer-reviewed as OzCHI 2007, DOI 10.1145/1324892.1324958). The untimed experiment
(N=244) found no statistically significant accuracy difference between striped and plain
tables, and a speed improvement on only one of six questions. The timed follow-up (2,276
sessions, 15 seconds per question) found striping more accurate on only three of eight
questions. Enders' own conclusion claims "better, or at least no worse" — never a general
readability gain. (High confidence; verified against both primary sources.)

The preference data is the strong result: in a Newspoll omnibus of more than 1,200
adults ranking six table styles, single-color alternating-row shading was the most
preferred format (31% rated it most helpful, 4% least). Enders' recommendation — shade
alternating rows with a single color as the safest choice, ruled lines next — rests on
preference, not on measured performance. (High confidence.)

NN/g treats striping as a Gestalt common-region grouping convention, not an
evidence-graded technique, and recommends whitespace-only grouping where it suffices
because it carries less visual complexity. (Medium confidence; the whitespace-first
application to table rows is principle plus inference, not an NN/g ruling on admin
tables.)

**Stance for the toolkit:** zebra is a legitimate default on preference grounds and
costs nothing on performance grounds. Geoff's walkthrough instinct (stops 1 and 4) is
supported. The honest label is that users like it but it does not measurably help
them. Ship
`AdminTable` with a zebra option and let per-screen passes choose; whitespace-plus-hairline
remains the quiet alternative. (E for the facts, G for the default.)

### Loading long lists: never infinite scroll; bounded view plus explicit action

NN/g scopes infinite scrolling to goal-free browsing of homogeneous content and
recommends against it when users need to find a specific item, compare items, or return
to an item's location — the core admin-table tasks. Baymard's moderated testing (50+
sites) independently corroborates: infinite scroll made users scan more and focus less,
and repeatedly pushed the footer out of reach. (High confidence.)

The three patterns form a measured trade-off triangle (Baymard): pagination made users
browse substantially less and over-weight the first page; infinite scroll made them
browse more but attend less to each item; "Load more" restores footer access and signals
that more content exists, at the cost of a click per batch. Baymard's recommended hybrid
— a bounded initial load, then explicit user action for the long tail — outperformed both
pure patterns. (High confidence. Scope caveat: this is e-commerce browsing research;
admin lookup tasks are search-dominant, so the translation to admin lists is inference.)

**Stance for the toolkit:** infinite scroll is banned. For lookup-dominant screens
(Members), search plus pagination is fine. The transferable finding is the
bounded-default principle — open on the operationally relevant scope (current season,
active members) and put history behind an explicit action. That converts the catalog's
"time-scoped list guidance" hypothesis from taste into an evidence-adjacent standard.
(E for the ban; evidence-adjacent for the bounded-default principle, with the
admin-list inference labeled.)

### Form labels: top-aligned wins the only direct measurement

Penzo's 2006 eyetracking study measured roughly 50ms saccades for labels above fields
(label and field captured in one eye movement) versus roughly 500ms for left-aligned
labels, interpreted as heavy cognitive load. This study is the empirical basis of the
now-standard top-aligned recommendation via Wroblewski and mainstream form guidance.
(Medium confidence: an informal industry study with no stated N; Das et al., NordiCHI
2008, found no completion-speed difference between placements. The verification pass
also refuted a companion claim about right-aligned label figures — do not cite specific
right-aligned numbers.)

**Stance for the toolkit:** the `FormLayout` kit adopts top-aligned labels. The admin's
current label-left rows (catalog stop 5) get rebuilt, not preserved. Single-column
remains the default form shape; the systems that document two-column pairing (Atlassian,
the event-detail form) treat it as the exception for tightly related fields. (E for
label placement at medium confidence; C for single-column.)

## The convention tier: what eight systems converge on

Full inventories are in the two appendix documents. Of the component genres relevant
to the ASC admin, these reach three or more systems in both sweeps: a structured data table with density options,
pagination, a status-label family, an overflow menu for row actions, empty-state and
skeleton components, toast-plus-banner as two distinct feedback tiers, a form layout
wrapper with validation messaging, a danger-button-plus-confirm-modal destructive
pattern, breadcrumbs, tabs, tooltip, and modal. Material 3 is the consistent outlier (it
dropped its data table, banner, and breadcrumb; it is a consumer-mobile system and is
cited here only for its chip taxonomy and destructive-dialog copy).

Convergences that sharpen specific collection entries:

- Polaris (Badge vs Tag, "never conflated"), Atlassian (Lozenge vs Badge vs Tag), and
  Spectrum (StatusLight vs Badge) each split system-set state, numeric counts, and
  user-set categorization into separate components with separate color rules.
- Destructive discipline is uniform across the systems. Carbon's danger modal requires
  the title and confirm button to name the specific action ("Delete 3 members", never
  "Confirm"); overflow menus in Carbon, Polaris, and Atlassian all quarantine
  destructive items below a divider with distinct styling. No system puts a red action
  link on every row, and M3 has no red button at all.
- The empty state belongs to the table. Atlassian's `emptyView` slot and Carbon's
  body-swap pattern both make it a table concern, filled by a dedicated empty-state
  component (Primer's Blankslate is the fullest contract:
  visual + heading + description + primary/secondary action).
- Carbon's scope rule for menus: an overflow menu belongs to a small object (a row, a
  card); a labeled menu button belongs to a large object (a page, a table).

## Assembly doctrine: daisyUI-first

Per Geoff's rulings above, the toolkit assembles rather than invents. The audit
of the compiled `cairn-admin.css` (a Tailwind 4 + daisyUI 5 bundle, tree-shaken to what
cairn's own components reference) found the bundle already carries `table` (only the
`table-sm` modifier), `badge`, `btn`, `card`, `alert`, `tabs`, `menu`, `dropdown`,
`modal`, `collapse`, `join`, `skeleton`, `steps`, `tooltip`, `divider`, `progress`,
`status`, `list-row`, `loading`, and the form controls. Missing, because nothing in cairn
references them yet: `stats`/`stat-*`, `table-zebra`, `table-xs`, `toast`,
`radial-progress`.

This is the pass-B "dead daisy stats classes" harvest finding generalized: a daisy class
works in the admin only if cairn's build compiled it. The effort's first engine change is
therefore a **blessed-set safelist source** in cairn's admin CSS build, so site-authored
admin screens can use the toolkit's daisy vocabulary before each recipe is harvested.

Every component in the graded collection below assembles from daisy primitives. The
toolkit needs no new CSS systems. It is thin wrappers and recipes over written
standards.

## The graded collection

Verdicts on every entry in the starting collection, plus additions the survey exposed.
Tier letters as defined above; daisy column names the assembly.

### Standards

| Standard | Verdict | Tier | Notes |
|---|---|---|---|
| Density doctrine | **Confirmed, amended** | C + G | No study grades density values; Carbon's named row-height scale is the convention model. Adopt two named tiers (compact default, comfortable option) rather than one fixed height. Single-line rows stand. |
| Page composition | **Confirmed, strengthened** | E + C | The bounded-default principle is now evidence-adjacent (Baymard hybrid); "lead with what the operator acts on" stays convention. Infinite scroll formally banned. |
| Action discipline | **Confirmed** | C | Universal across systems; Carbon's name-the-action confirm rule and the destructive-below-divider menu idiom join the standard. |
| State-vocabulary consistency | **Reshaped** | C | Split into three components (see StatusChip below); the single-chip-system framing understated what the systems actually do. |
| Formatters as citizens | **Confirmed** | C | Unopposed; no system disagrees, several ship the helpers. |
| Copy register | **Confirmed, extended** | C | Gains the confirm-dialog copy rule (title and button name the specific action). |

### Components

| Component | Verdict | Tier | daisyUI assembly |
|---|---|---|---|
| AdminTable | **Confirmed** | C (zebra stance E) | `table` + `table-zebra` + `table-xs`/`table-sm` named density tiers; empty-state slot per the table-owns-it convention |
| ListToolbar | **Confirmed** | C | Layout recipe over `input`, `select`, `btn`; Polaris applied-filters-as-pills is the reference detail |
| Pagination | **Confirmed** | C | `join` + `btn` (daisy's own idiom) |
| ExpandableRow | **Confirmed** | C | `table` + `collapse` semantics; genre exists in four systems in different shapes, pick at the Classes pass |
| ScopePicker | **Confirmed** | C | `select` bound to the list; kills the bare-text-input-plus-View |
| PageHeader | **Confirmed** | C | Layout recipe; Primer PageHeader is the slot model (title, description, actions, breadcrumb with entity name) |
| DetailPage skeleton | **Confirmed, sharpened** | C | Recipe; the fact-summary half gets a named key-value piece (`FactList`, modeled on Ant Descriptions) over `list-row` |
| CollapsibleSection | **Confirmed** | C | `collapse` (already in the bundle) |
| SegmentedTabs | **Confirmed** | C | `tabs tabs-box`; Carbon documents the tabs-vs-switcher distinction |
| Chip | **Reshaped: split in three** | C | `StatusChip` (fixed semantic vocabulary, the only surface allowed status colors; daisy `badge` + `status` dot), `TagChip` (categorization; `badge` soft/outline), and the existing CountBadge for numbers. Three systems split these deliberately; one do-everything chip re-merges what they learned to separate |
| CountBadge / AttentionMark | **Confirmed** | C | `badge` + `indicator`; Atlassian Badge (counts only) is the semantic model |
| StatBand / StatTile | **Confirmed** | C | daisy `stats`/`stat` (needs the safelist); Ant Statistic is the reference shape |
| PersonRef / EntityRef | **Confirmed** | C | Svelte helper, no CSS; Fluent Persona is the precedent |
| MoneyAmount / CivilDate / Timestamp | **Confirmed** | C | Functions, not CSS |
| FormLayout kit | **Confirmed, reshaped** | E (labels) + C | Top-aligned labels (Penzo, medium confidence); single-column default; `fieldset` + `label` + form controls; adopt Atlassian's three-state validation messaging (error/valid/helper) |
| SettingCluster | **Confirmed** | G | No system precedent either way; keep, Geoff's call on shape at the relevant pass |
| DangerZone | **Confirmed** | C | Quarantined placement confirmed by every system's destructive discipline |
| RowActions | **Confirmed, sharpened** | C | `dropdown` + `menu`; destructive items below a divider; Carbon's scope rule (overflow menu for rows, menu button for pages) |
| MoveDialog | **Confirmed as bespoke** | G | No system ships it (Ant Transfer is the nearest kin); ASC-specific pattern, designed at the Classes pass |

### Additions (gaps the survey exposed)

| Component | Why | Tier | daisyUI assembly |
|---|---|---|---|
| EmptyState | Six of eight systems ship a component; the collection had only copy guidance. The walkthrough saw four bad empty states | C | Recipe over `card`; Blankslate's contract (visual, heading, description, action) |
| ConfirmDialog | DangerZone covers placement but not the confirm interaction; every system pairs the danger button with a naming confirm | C | `modal` + `btn-error`; Ant Popconfirm's inline low-ceremony variant fits per-row Release/Drop |
| Feedback tiers (Toast + Alert) | The admin has no designed "saved" confirmation; seven of eight systems split transient from persistent | C | `alert` (in bundle) + `toast` (needs safelist) |
| CapacityMeter | The over-capacity voice (19/10 enrolled, three surfaces) gets a real precedent: Spectrum Meter with positive/warning/critical thresholds | C | `progress` with threshold colors, or fraction + StatusChip |
| Skeleton stance | Six systems ship skeletons; cairn's bundle already has the class. Server-rendered admin lists may not need them | G | `skeleton`; decide once at the Members pass, then standard |

### Deliberate non-adoptions (decisions, not oversights)

- Saved table views (Polaris IndexFilters): wrong scale for a 285-member club.
- Inline edit (Atlassian): detail-page forms suffice.
- Drawer-for-row-detail: a third navigation idiom beside ExpandableRow and DetailPage;
  per-screen brainstorms may reopen it.
- Bulk selection with an action bar (Spectrum, Carbon): no current ASC use case,
  though AdminTable must not preclude a selection column later.
- Avatars: no member photos in ASC data.
- Tree view, virtual scroll, contextual save bar: no evidence of need.

## Engine items riding the effort

The daisy blessed-set safelist (above) joins the list already filed in the starting
collection: local-dev auto-login behind a `.dev.vars` flag, the Overview
always-highlighted prefix-match bug, the collapsed-group active-signal gap, "New
<plural>" button copy, and collapsed-group boundary spacing.

## What the Members pass inherits

The Members pass inherits these decisions:

- Compact single-line rows in a zebra-optional AdminTable (`table-xs`/`table-sm`) with
  a curated column set. City moves to the detail page; the primary-member flag becomes
  a column or a StatusChip, not an unlabeled star.
- A ListToolbar band replaces the loose filter cluster.
- Search-first with pagination. Active members are the bounded default scope; archived
  members stay behind the existing toggle.
- Per-row actions move into a quiet overflow menu.
- Standing chips draw from the StatusChip vocabulary, with a legend surface.
- The count line states its filter scope.

Every one of these maps to a stop-1 walkthrough reaction, now carrying a citation or an
explicit convention label.
