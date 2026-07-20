# Members pass design — the first admin-screen pass

> The functional design for the Members screen redesign, brainstormed with Geoff
> 2026-07-20 (the first pass of ROADMAP's `admin-screen-passes`). Grounded in the
> walkthrough catalog's stop 1 (`docs/2026-07-20-admin-toolkit-catalog.md`) and the
> research survey (`docs/2026-07-20-admin-toolkit-research-survey.md`), whose graded
> verdicts this design consumes. Function first: the screen's jobs were settled before
> any visual decision; visual refinement runs later through the probe process.

## The screen's jobs

All four recurring jobs are real (Geoff): looking up one person, money-and-standing
work, roster hygiene, and segment sweeps. The **default view optimizes for lookup** —
the mid-phone-call case. The others sit one action away: segments behind toolbar
filters, hygiene behind the panel and the household desk, money work entirely on the
desk (the Money screen's own pass comes later).

## Standing vocabulary and the data tier

The member-standing vocabulary becomes three states, replacing current/grace/lapsed:

- **Current** — inside the household's own rolling paid window (`paid_at` plus one
  year; Geoff's 2026-07-07 ruling, never a season boundary).
- **Overdue** — past the renewal boundary while the reminder sequence is still
  running. Still a member: full benefits (portal, member pricing, class access)
  until Former.
- **Former** — the reminder sequence ended without payment. No longer a member.
  Paying again returns the household to Current automatically.

The reminder sequence is the boundary (Geoff's ruling this brainstorm). The sequence
already exists as `src/jobs/renewal-reminders.ts`: four touches at −30/−7/0/+30 days
around the household's renewal boundary, each marked exactly once in
`renewal_reminders_sent`. The +30 "stated-final" touch ends the sequence, so the
Former transition fires when that touch is sent (or when its staleness window passes
unsent, so imported or long-dormant households still transition). The transition is
**recorded, not re-derived on every read**: the job writes it, a backfill migration
classifies the existing 149 households once, and the household desk carries a manual
set/clear for edge cases (moved away mid-season; "they called, they're renewing").

Grace retires. Its job — "unpaid but still treated as a member" — is exactly what
Overdue means, so `renewal_grace_days` and the `'grace'` status go, and every
"current including grace" site (email segments, the members-only class door, portal
renew prompts, `standing.ts` and its consumers) maps to "Current + Overdue". This is
a real asc-club migration with forward/rollback/verify against the live rows, per
the schema-evolvability doctrine. The "renewal candidates" concept is retired with
it and does not reappear under a new name; chasing is the reminder sequence's job,
and overdue households are a standing filter away when someone wants to see them.

## Screen composition

Search-first roster of **household rows** (149 today). The cursor lands in search on
page open; typing narrows instantly; a search matches any member's name and
highlights the match in its household's row.

The ListToolbar carries search, the promoted filters — standing, holdings,
role/instructor, class — and Add household as the primary action. Applied filters
render as removable pills, and the count line states its scope ("12 households ·
overdue · holding assets"). **The default scope is members only** (Current +
Overdue); Former appears via the standing filter, archived via the existing include-
archived toggle. Compact single-line rows, zebra per the survey's preference-grounded
stance, `join`-based pagination.

## Row and expanded panel

The row stays one line: household name, member names (primary member first, labeled
plainly — the unlabeled star retires), standing chip, phone. City moves to the
detail page (stop-1 reaction).

Clicking a row expands it in place to the household panel — the full mid-call
picture without navigating away:

- Contacts: email and phone.
- Members: each with age (derived from `members.birthdate`), primary labeled,
  minors evident at a glance.
- Holdings: assets with paid/owing state.
- Classes: enrollments with paid status.
- Actions: **Open household**, **Email household**, **Add member**. Money actions
  are deliberately absent; the desk owns them (Record payment stays there).

Merge, move, archive, and tier changes stay on the household desk, restyled only
where the toolkit touches them.

## Toolkit births

This pass builds the first toolkit set kit-first (Geoff's ruling, 2026-07-20): the
components come before the screen, each with its own contract, tests, and a probe
page rendered with live data for Geoff's verdict; the screen then assembles them,
and assembling it is the test.

The contracts are designed **general-purpose, not ASC-shaped** (Geoff's ruling, same
sitting): this is a cairn admin toolkit with ASC as its first consumer, and for the
convergent genres the general contract already exists — the surveyed systems'
agreement encodes thousands of consuming teams' needs, so copying that shape is
standardization, not speculation. Concretely, each component carries the convergent
contract even where Members does not exercise it:

- **AdminTable** — named density tiers (`table-xs`/`table-sm`), zebra option,
  empty-state slot, and headroom for a future selection column.
- **ListToolbar** — search, promoted filters plus overflow disclosure, primary
  action, applied-filter pills (Members promotes four filters and uses no overflow).
- **ExpandableRow** — the expand-in-place genre; Classes inherits it for rosters.
- **StatusChip** — the full tone vocabulary (neutral/info/success/warning/danger),
  owned padding and truncation, a legend surface; Current/Overdue/Former is its
  first client, not its ceiling.
- **Pagination** — `join` + `btn`.
- **Formatters** — MoneyAmount, CivilDate, age-from-birthdate.

Generality shapes the contract; a consumer still gates publication. The components
are born in this repo's theme layer, Members shakes them for one pass, and they
harvest into cairn afterward with the generality already in the bones — cairn is a
versioned package, so a wrong contract published there costs a breaking change
across sites, where a wrong contract here costs one refactor. Genres with no
external contract to copy (MoveDialog, SettingCluster) and the unbuilt additions
(ConfirmDialog, feedback tiers, CapacityMeter, EmptyState beyond the table slot)
wait for their consuming passes.

The engine item rides first: the blessed-set daisy safelist in cairn's admin CSS
build, so `table-zebra`, `table-xs`, `stats`, and `toast` exist in the admin bundle
before ASC screens use them.

## Out of scope

Renewal-chasing workflows and payment recording (the Money pass), waiver-state
surfaces, the household desk's own redesign (a later pass; it only picks up toolkit
components this pass ships), and any Money-screen change beyond the standing
vocabulary rename flowing through shared code.

## Acceptance criteria

- The three-state vocabulary is live end to end: chips, filters, segments, portal
  and class-door gates, with the backfill applied and verified against the live 149
  households and the manual override working both directions.
- Search-to-answer: opening the page and typing a member's name reaches the
  household panel's full picture (contacts, members with ages, holdings, classes,
  paid states) without a page navigation.
- The default scope hides Former and archived households; the count line always
  states its scope; applied filters are visible and removable.
- Rows are single-line at 1440 with real data (multi-member households included);
  the stop-1 reactions are each addressed (no city column, no star glyph, no
  "Tier & Amount" column, toolbar not "thrown together").
- Standard gates: check 0/0, tests, build, CI-canonical baseline regen, the
  design-probe checks, and a fresh-context coherence read at 390/1440.

## Open items for the plan

- The exact Former-transition write (job-side event vs a derived-then-recorded
  daily sweep) and the backfill's edge cases (households with no `paid_at` at all,
  the `'none'` standing) settle at plan time against `standing.ts` and
  `renewal_reminders_sent`.
- StatusChip's color mapping onto the admin palette (probe round).
- Whether the class filter enumerates current-season classes only (likely yes,
  per the bounded-default principle).
