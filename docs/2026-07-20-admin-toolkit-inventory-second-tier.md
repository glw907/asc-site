# Second-tier design-system component inventory — admin/back-office relevance

Scope: Ant Design, GitHub Primer, Microsoft Fluent 2, Adobe Spectrum. Only components
relevant to admin/back-office data UIs (tables, lists, forms, status display, page
chrome, feedback) are included; purely marketing/media/decorative components are
skipped (noted per system). Sourced from each system's official component index pages
(ant.design, primer.style, fluent2.microsoft.design, react-spectrum/spectrum.adobe.com)
via live fetch, 2026-07-20.

---

## Ant Design (ant.design)

The canonical admin-dashboard system — most of its component set exists because
Alibaba's internal back-office tooling demanded it. 46 components surveyed here.

### Layout / page chrome
| Component | Purpose | Notable variants |
|---|---|---|
| Layout | Page structure container (Header/Sider/Content/Footer regions) | Fixed/collapsible sider |
| Divider | Visual separator line | Horizontal/vertical, text-in-divider |
| Flex / Grid / Space | Flexbox and responsive grid primitives | Grid uses a 24-col breakpoint system (`xs..xxl`) |
| Splitter | Resizable panel divider | Draggable, min/max size per pane |
| Breadcrumb | Hierarchical path display | Dropdown-in-crumb for long paths |
| Tabs | Tabbed content switcher | `card`/`line` type, editable-card (closable tabs), position (top/right/bottom/left) |
| Steps | Progress indicator across a multi-stage flow | `wait`/`process`/`finish`/`error` status per step, vertical/dot variants |

### Navigation
| Component | Purpose | Notable variants |
|---|---|---|
| Menu | Navigational menu structure | Inline/vertical/horizontal mode, nested submenus |
| Dropdown | Menu with options, triggered from any element | Trigger on click/hover/context-menu |
| Pagination | Page navigation control | `simple` mode, `showSizeChanger`, `showQuickJumper`, total-count text |

### Data entry / forms
| Component | Purpose | Notable variants |
|---|---|---|
| Form | Form container, validation, and layout management | `horizontal`/`vertical`/`inline` layout, built-in async validation rules |
| Input / InputNumber / Textarea (via Input) | Text and numeric entry | `addonBefore/After`, prefix/suffix icons, `allowClear` |
| Select / TreeSelect / Cascader | Single/multi/hierarchical option pickers | Search-in-select, `mode="multiple"/"tags"`, virtual scrolling on large option sets |
| AutoComplete | Free-text input with suggestion dropdown | — |
| Checkbox / Radio | Multi/single choice controls | Button-style radio group |
| DatePicker / TimePicker | Date/time selection | Range picker variant, presets |
| Switch | Boolean toggle | Loading state, size (default/small) |
| Slider | Range value selection | Range (two-handle) mode, marks |
| Transfer | Two-panel list-to-list mover | Searchable panes, one-way/two-way |
| Upload | File upload | Drag-and-drop zone, list-type (text/picture/picture-card) |

### Data display
| Component | Purpose | Notable variants |
|---|---|---|
| Table | Data table grid — the flagship admin component | `size`: `large`/`middle`/`small`; `expandable` (expandedRowRender, expand-by-row-click, custom expand icon); `rowSelection` (checkbox/radio, controlled keys); built-in `sorter`/`filterDropdown`; `sticky` header; `fixed` (start/end) columns; `summary` footer row; `virtual` scroll (5.9+); `pagination` prop wired straight to the Pagination component |
| Descriptions | Key-value/label-value display list (read-only record view) | `bordered`, `column` responsive count, per-item `span` |
| Statistic | Single numeric/metric display, large-type KPI number | `precision`, `prefix`/`suffix`, `Countdown` sub-component, loading state |
| List | Generic data list display | **Deprecated** in favor of Table/other patterns for most cases |
| Tag | Label/category chip | Closable, colored presets, checkable tag |
| Badge | Notification-count / status-dot indicator | `count`, `dot`, `status` (success/error/default/processing/warning) presets |
| Avatar | User profile image/initials | Shape (circle/square), size, group stacking |
| Tree | Hierarchical tree structure | Checkable, draggable, virtual scroll |
| Timeline | Chronological event display | Alternate layout, pending/last-item styling |
| Collapse | Collapsible content panel | Accordion mode |
| Empty | Empty-state placeholder | Custom image/description, size variants |
| Tooltip / Popover | Hover/click floating info | Popconfirm (below) is a specialized Popover |
| Segmented | Segmented button group (view switcher) | Icon-only option |

### Feedback / status
| Component | Purpose | Notable variants |
|---|---|---|
| Alert | Inline banner message | `type`: success/info/warning/error; closable, action slot |
| Message | Transient top-of-page toast | Global API (`message.success()` etc.) |
| Notification | Persistent corner notification | Placement, duration, action button |
| Modal | Dialog popup window | `confirm` static method, `Modal.error/success/info/warning` presets |
| Drawer | Side sliding panel | Placement (left/right/top/bottom), nested drawers |
| Popconfirm | Inline confirmation popover before a destructive action | Danger button styling built in — Ant's canonical "confirm before delete" pattern |
| Progress | Progress bar/circle/dashboard indicator | `status`: success/exception/active |
| Result | Full-panel operation-result display (success/error/403/404/500) | Preset icon sets per status code |
| Skeleton | Loading placeholder shapes | `active` shimmer animation, avatar/title/paragraph sub-shapes |
| Spin | Loading spinner | `tip` text, wraps content (nested loading overlay) |

*Skipped as non-admin: FloatButton, Watermark, QRCode, Carousel, BorderBeam, Anchor,
ColorPicker, Rate, Calendar, Image, Masonry, App, ConfigProvider, Util, Mentions, Tour.*

---

## GitHub Primer (primer.style)

Primer is itself an admin/product-management surface (issues, PRs, org settings), so
nearly its entire catalogue qualifies. ~55 components surveyed here (of ~70 total).

### Actions
| Component | Purpose | Notable variants |
|---|---|---|
| Button / IconButton / ButtonGroup | Primary action triggers | Icon-only button, grouped sequential buttons |
| ActionList | Vertical list of interactive actions/options | Dividers, group headings, leading/trailing visuals — the base primitive behind menus and select panels |
| ActionMenu | ActionList + Overlay combo for a "quick actions" trigger | — |
| ActionBar | Horizontally aligned IconButtons | Built-in overflow menu when the bar can't fit |

### Forms
| Component | Purpose | Notable variants |
|---|---|---|
| FormControl | Labelled input wrapper with validation/hint text | Required/disabled/validation states |
| TextInput / Textarea | Single/multi-line text entry | `TextInputWithTokens` for tag-style list input |
| Select / Checkbox(Group) / Radio(Group) | Standard choice controls | — |
| SegmentedControl | Pick one of a small set of closely related options | Icon-only segments |
| ToggleSwitch | Immediate on/off setting toggle | — |
| Autocomplete | Filter-and-pick text input | Pairs with ActionList for suggestions |

### Navigation / page chrome
| Component | Purpose | Notable variants |
|---|---|---|
| PageHeader | Top-level page heading region | Title/description/actions/breadcrumb slots |
| PageLayout / SplitPageLayout | Header/main/pane/footer page regions; two-column with sidebar | Responsive stacking on narrow viewports |
| Breadcrumbs | Current page/context within the hierarchy | — |
| NavList | Vertical list of navigation links | Nested/collapsible sections |
| UnderlineNav / UnderlinePanels | Horizontal tabbed navigation / tabbed content panels | — |
| Pagination | Horizontal set of links to navigate paginated content | Truncation for long page ranges |
| Stack | Responsive-flow layout primitive | Direction/gap/wrap props |

### Overlays / dialogs
| Component | Purpose | Notable variants |
|---|---|---|
| Dialog / ConfirmationDialog | Floating transient surface / action-confirmation dialog | ConfirmationDialog is Primer's dedicated destructive-action-confirm pattern |
| Overlay / AnchoredOverlay | Base floating-surface primitives | Anchored positions relative to trigger |
| SelectPanel | Dialog for selecting items from a (searchable) list | Single/multi-select modes |
| Popover / Tooltip | Contextual floating info | — |

### Data display
| Component | Purpose | Notable variants |
|---|---|---|
| DataTable | 2-D tabular data structure | Built for GitHub's own dense admin/settings tables |
| Avatar / AvatarStack | User/org image / stacked overlapping avatars | — |
| Label / LabelGroup / Token | Contextual metadata chip / grouped chips / compact object representation | — |
| StateLabel | Issue/PR-style status pill (open/closed/merged/draft) | Explicit status-color semantics |
| CounterLabel | Numeric count badge on nav items/buttons | — |
| ProgressBar | Completion indicator | Multi-segment (stacked) bars |
| Truncate | Ellipsis-truncate overflowing text | Expand-on-hover option |
| Timeline | Vertical chronological item display | — |
| TreeView | Hierarchical parent/child list | — |

### Communication / feedback / empty states
| Component | Purpose | Notable variants |
|---|---|---|
| Banner | Highlight important page-level information | Severity variants (info/warning/critical/success) |
| **Blankslate** | Placeholder for missing/empty content | Sizes (small/medium/large); `narrow`/`spacious`/`border` layout variants; composed of `Visual` + `Heading` + `Description` + `PrimaryAction` + `SecondaryAction` — the canonical empty-state/zero-data/first-run pattern |
| InlineMessage | Inform users of an action's result inline with content | Severity variants |
| Details | Native disclosure-element wrapper | Progressive-enhancement summary/detail pattern |
| RelativeTime | Accessible relative timestamp display ("3 days ago") | Auto-updates, falls back to absolute time |
| Spinner / SkeletonAvatar / SkeletonBox / SkeletonText | Loading indicators | Skeleton family mirrors the shape of the content it's replacing |

*Skipped as GitHub-specific/non-admin: BranchName, CircleBadge, KeybindingHint, Link,
Heading, Text (typography primitives, not admin-specific).*

---

## Microsoft Fluent 2 (fluent2.microsoft.design)

Fluent 2's public component index page is marketing-oriented (prose descriptions, not
a full technical index); the React v9 implementation (Fluent UI React v9 / Storybook)
adds a few components — notably **DataGrid** — not enumerated on the marketing page
itself. ~40 components surveyed here.

### Page chrome / navigation
| Component | Purpose | Notable variants |
|---|---|---|
| Nav | List of links moving through main app/site sections | Collapsible groups |
| Breadcrumb | Understand/move through hierarchy of a complex app | Overflow-to-dropdown on long paths |
| Tablist | Switch between categories of related information | — |
| Toolbar | Access to frequently used actions for the current view/task | Overflow menu for excess actions |
| Divider | Groups sections of content, creates visual rhythm | Text-inset divider |
| Drawer | Secondary content sliding in from a layout edge | Overlay vs. inline (push-content) mode |

### Forms
| Component | Purpose | Notable variants |
|---|---|---|
| Field | Combines a label with a form component plus validation messaging | Wraps most Fluent input primitives |
| Input / Textarea | Free-form text entry | — |
| Combobox / Dropdown / Select | List-based option pickers | Combobox allows free text + filtering |
| Checkbox / Radio group / Switch | Standard choice controls | — |
| Slider / Spin button | Range value entry / stepped numeric entry | — |
| Tag picker | Text input + dropdown producing selectable tags | Custom-value entry |
| SearchBox | Search input | — |

### Data display
| Component | Purpose (fills the Table/DataGrid gap) | Notable variants |
|---|---|---|
| **DataGrid** (Fluent UI React v9; not on the marketing index page) | Data-grid/table primitive built on Fluent's `Table` | Selection modes (single/multiple row selection); sortable columns; resizable columns; composable subcomponents (`DataGridHeader`, `DataGridRow`, `DataGridCell`) for custom cell rendering |
| List | Collection of like items in a vertical stack | — |
| Card | Container grouping related content/actions | Selectable/interactive card variant |
| Avatar / Avatar group / Persona | User image or initials / stacked avatars / person + status + metadata | Persona shows presence/status alongside identity — Fluent's answer to a "member row" |
| Badge | Communicates status or description of an associated component | Shape (circular/rounded/square), color presets, size scale |
| Tag | Represents a value someone has picked | Removable, grouped |
| Tree | Hierarchical view of nested data | — |
| Label / Info label | Names a component/group; label + info-button popover | — |

### Feedback / status
| Component | Purpose | Notable variants |
|---|---|---|
| Message bar | Communicates important product/surface state information | Intent (info/warning/error/success), actionable variant |
| Toast | Communicates action status or app events | Auto-dismiss timing |
| Dialog | Supplemental surface for interactions or requiring a decision | Alert vs. non-modal dialog variants |
| Skeleton | Indicates content is loading without blocking the rest of the page | Shape templates matching target content |
| Spinner | Communicates that something is processing | Size scale |
| Progress bar | Communicates task/system progress | Determinate/indeterminate |
| Rating | Communicates user sentiment | — |

*Skipped as non-admin: Carousel, Image, Icon (generic), Fluent provider (theming
infra), Text (typography primitive).*

---

## Adobe Spectrum (spectrum.adobe.com / react-spectrum)

Spectrum's public marketing site is largely a JS SPA without a static index; this
inventory is built from React Spectrum's component documentation and the Spectrum 2
(S2) release notes. ~30 components surveyed here.

### Actions
| Component | Purpose | Notable variants |
|---|---|---|
| ActionButton | Icon/text button for a toolbar-style action | Quiet/emphasized styling |
| ActionGroup | Group of related ActionButtons | Single/multiple selection mode |
| ActionMenu | ActionButton + Menu combo for "more actions" (kebab menu) | — |
| **ActionBar** | Companion component for bulk actions on selected items within a collection | Built from ActionGroup + a clear-selection button + a selected-count label — Spectrum's canonical "N rows selected" bulk-action bar |
| Menu | Options list, typically opened from a trigger | Submenus, selection modes |

### Forms
| Component | Purpose | Notable variants |
|---|---|---|
| TextField / TextArea | Single/multi-line text entry | — |
| NumberField | Numeric entry with stepper | Format options (currency, percent) |
| Picker | Single-select dropdown | — |
| ComboBox | Filterable text input + dropdown list | Allows custom value entry |
| Checkbox(Group) / RadioGroup / Switch | Standard choice controls | — |
| SearchField | Search input | Clearable |
| DatePicker / Calendar / RangeCalendar | Date/date-range selection | — |
| TimeField | Time entry | — |

### Data display
| Component | Purpose | Notable variants |
|---|---|---|
| TableView | Container for displaying rows/columns of information | Row selection, sortable columns |
| ListView | Displays a list of interactive items | Keyboard navigation, row selection, row-level actions |
| CardView | Grid-of-cards collection layout | Selectable cards |
| TagGroup | Displays a list of removable tag items | Keyboard navigation, item removal |
| Breadcrumbs | Current-page/context hierarchy display | Overflow menu for long paths |
| Tabs | Tabbed content switching | Orientation (horizontal/vertical) |
| TreeView | Hierarchical nested-data display | — |
| Avatar | User/entity image representation | — |
| **Badge** | Small amount of color-categorized metadata for attention | Color-coded semantic variants |
| **StatusLight** | Color-coded dot + label used to categorize status, common in data-viz/table cells | Fixed semantic color set (neutral/info/positive/notice/negative) — narrower/stricter than a generic Badge, purpose-built for admin status columns |
| **Meter** | Visual representation of a quantity/achievement against a bound (e.g., quota usage) | Variant thresholds (positive/warning/critical) as the value approaches the max |
| ProgressBar / ProgressCircle | Determinate/indeterminate progress indication | — |

### Overlays / feedback
| Component | Purpose | Notable variants |
|---|---|---|
| Dialog | Floating surface for transient content or decisions | Alert dialog, fullscreen/dismissible variants |
| Popover | Contextual floating content anchored to a trigger | — |
| ContextualHelp | Inline help affordance opening a small info popover | Info vs. help variants |
| Toast | Brief temporary notification of an action, error, or event | Positive/negative/info/neutral variants |
| InlineAlert | Static (non-dismissing) in-context alert banner | Severity variants |
| **IllustratedMessage** | Illustration + heading + description placeholder for empty/error/zero-result states | Spectrum's Blankslate-equivalent — used across Adobe apps for "no results," "nothing here yet," and error pages |

*Skipped as non-admin: ColorArea and other color-tool primitives, Well, general
typography/layout primitives without a dedicated admin role.*

---

## Cross-system synthesis

### Component genres present in 3 of 4, or all 4, systems

| Genre | Ant | Primer | Fluent 2 | Spectrum |
|---|---|---|---|---|
| Data table/grid (rich: sort, select, resize, expand) | Table | DataTable | DataGrid | TableView |
| List view (rows w/ selection + actions, table-adjacent) | List (deprecated) | ActionList | List | ListView |
| Pagination | Pagination | Pagination | — (handled via Table/List patterns) | — (collection-level, not a standalone doc'd component) |
| Breadcrumbs | Breadcrumb | Breadcrumbs | Breadcrumb | Breadcrumbs |
| Tabs | Tabs | UnderlineNav/UnderlinePanels | Tablist | Tabs |
| Tag/label/chip | Tag | Label/Token | Tag | TagGroup |
| Badge / status indicator | Badge | StateLabel/CounterLabel | Badge | Badge/StatusLight |
| Avatar (incl. stacking) | Avatar | Avatar/AvatarStack | Avatar/Avatar group | Avatar |
| Tree view | Tree | TreeView | Tree | TreeView |
| Progress bar | Progress | ProgressBar | Progress bar | ProgressBar/ProgressCircle |
| Toast/transient notification | Message | (Banner covers persistent; no toast) | Toast | Toast |
| Alert/banner (persistent, page/section-level) | Alert | Banner | Message bar | InlineAlert |
| Modal/dialog | Modal | Dialog/ConfirmationDialog | Dialog | Dialog |
| Empty state / placeholder | Empty | **Blankslate** | — (no dedicated component) | **IllustratedMessage** |
| Skeleton loading | Skeleton | SkeletonAvatar/Box/Text | Skeleton | — (no dedicated skeleton family documented) |
| Form field wrapper (label+input+validation) | Form (Item) | FormControl | Field | (composed manually; no single wrapper doc'd) |
| Drawer/side panel | Drawer | — (no dedicated drawer) | Drawer | — |
| Popover/tooltip | Popover/Tooltip | Popover/Tooltip | Popover/Tooltip | Popover/ContextualHelp |
| Destructive-action confirm | Popconfirm | ConfirmationDialog | (Dialog, no dedicated variant) | (Dialog, no dedicated variant) |
| Page header / breadcrumb+title+actions region | (composed, no single component) | **PageHeader** | (composed) | (composed) |
| Bulk row-action bar (N selected → actions) | (rowSelection + custom toolbar) | (composed from ActionBar-like patterns) | (composed) | **ActionBar** |

**Convergent core (appears in all 4 or all-but-one, with near-identical intent):**
data table/grid, list-with-selection, breadcrumbs, tabs, tag/chip, badge/status,
avatar, tree view, progress bar, modal/dialog, popover/tooltip, some form of
alert/banner. Every system independently arrived at these as load-bearing
admin/back-office primitives.

### Distinctive components other systems' admin builders widely copy

- **Ant's Descriptions and Statistic** — Descriptions (a labelled key-value grid for a
  read-only record view: "Name: X, Status: Y, Created: Z") and Statistic (a large-type
  single-metric display with prefix/suffix and a Countdown variant) are patterns most
  other systems leave for consumers to compose by hand from Text + Grid. Ant ships them
  as first-class, reusable components — visibly why so many non-Ant admin dashboards
  (including custom internal tools) still reach for "an Ant-style Descriptions panel."
- **Primer's Blankslate** — the most fully-specified empty-state component of the
  four: explicit size scale, narrow/spacious/border layout knobs, and a formal
  Visual+Heading+Description+PrimaryAction+SecondaryAction composition contract. Its
  closest peer is Spectrum's IllustratedMessage; Ant's Empty and Fluent's absence of
  any dedicated empty-state component are noticeably thinner by comparison.
- **Spectrum's StatusLight vs. Badge split** — Spectrum is the only system here that
  separates a general-purpose Badge (color-coded metadata chip) from StatusLight (a
  narrower, fixed-semantic dot+label built specifically for table/data-viz status
  columns). Ant, Primer, and Fluent all fold this into a single Badge/Tag/StateLabel
  component with a status-color prop, which is looser but less discoverable for "what
  are the only allowed status colors here."
- **Spectrum's ActionBar** — a dedicated, purpose-built "N items selected → bulk
  actions" bar (ActionGroup + clear button + count label) that appears automatically
  in response to a collection's selection state. The other three systems support the
  same interaction (Ant's rowSelection + a hand-built toolbar, Primer/Fluent composed
  from primitives) but don't name or ship it as its own component — this is the one
  place Spectrum's API surface is ahead of the others for a very common admin pattern.
- **Ant's Table density/expandable/virtual feature depth** — no other system's single
  table component documents this many built-in knobs (three-tier `size`, expandable
  rows with per-row custom render, `sticky` header, `fixed` columns by side, a
  `summary` footer row, and native virtual scrolling past 5.9). Fluent's DataGrid,
  Primer's DataTable, and Spectrum's TableView all cover a subset; Ant's is the most
  "batteries included" for the classic dense-admin-grid case.
- **Fluent's Persona** — folds identity (avatar) + presence/status + secondary
  metadata into one component, closer to a "member row" primitive than a plain Avatar.
  None of the other three name this as a distinct component (they'd compose Avatar +
  Badge + Text by hand).
