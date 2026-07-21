# Classes pass: functional design

> Spec for the second admin-screen pass (`admin-screen-passes`, ROADMAP). Brainstormed
> interactively with Geoff and approved 2026-07-21. Classes was chosen over Assets for the
> acuter functional failure (no roster surface, a paid-student transfer invisible to the
> UI) and the stronger toolkit second-consumer fit. Requirements evidence:
> `docs/2026-07-20-admin-toolkit-catalog.md`, stops 3 and 5. Visual verdicts settle
> through the probe-iteration process during the build pass, not here.

## Ratified functional rulings (Geoff, 2026-07-21)

- All four job buckets are load-bearing: roster operations, intake and capacity,
  communication, class setup. The usage rhythm is **mostly the registration burst**;
  once a class starts, the roster rarely changes. The screen optimizes for the burst.
- **Capacity is a soft target.** Public signup gates on it, but admins deliberately
  overfill. Over-capacity ("18/10") is normal life and gets a calm visual voice, never
  an alarm.
- **Transfers are same-price in practice.** The flow moves the payment and warns on a
  fee mismatch; no Stripe surgery, no auto-settle.
- **Waitlist converts by offer**: the admin offers a seat, the member pays to claim it.
  The existing offer machinery (expiry, claim, decline, stale sweep, auto-offer on a
  freed spot) is the mechanism; this pass surfaces it, never rebuilds it.
- **Instructors are out of scope.** The existing assign/unassign machinery keeps
  working and the section gets restyled with the page, but no new instructor behavior.
- **Payments are Stripe-at-signup.** Manual recording (cash, check, comp) is rare but
  real; it stays a per-row roster action, not a promoted flow.
- Rosters show each student's age, derived from `members.birthdate` with the toolkit's
  `ageFromBirthdate` (ruled during the Members brainstorm; reaffirmed here).
- Prior-year classes are rarely referenced: the list defaults to the current season and
  history sits behind a filter.

## Architecture

Hybrid, chosen over everything-on-the-list and lean-list-plus-detail:

- **The list** (`/admin/club/classes`) is the glance-and-act surface: season-scoped
  expandable rows whose panel shows the real roster and a small fixed action set.
- **The detail page** (`/admin/club/classes/[id]`) is the surgery surface: full roster
  operations (record payment, transfer, drop), the waitlist queue with offer actions,
  and the rebuilt edit form.
- **The cross-class waitlist screen** (`/admin/club/classes/waitlist`, pass B) stays
  as built.

Both surfaces compose the same toolkit components, giving every Members-pass component
its second consumer.

## The list screen

The toolbar (ListToolbar) carries a season filter defaulting to `settings.current_season`,
the one primary action (New class), and a count line that names the scope ("6 classes in
season 2026"). Rows are compact zebra (AdminTable), sorted by start date.

Each row (ExpandableRow) shows: name, track, dates, the enrolled fraction, waitlist
count, and a pending-offer marker. Two columns from the current screen die: Capacity
(redundant with the fraction) and Visibility (an all-same-value chip column). A hidden
class gets a quiet "Hidden" marker; a visible one gets nothing. A drop-in class shows a
"drop-in" mark instead of a fraction (no registration exists to count). The over-capacity
fraction renders in the calm voice; the exact treatment settles in probes.

The expand panel mirrors the Members shape: the roster (name, age, paid chip), a
waitlist summary line (count, next in line, any active offer with its expiry), and the
actions **Open class** and **Email class**, plus a contextual **Offer next seat** that
appears only when a seat is open, the waitlist is nonempty, and no offer is live. Email
class links the existing compose deep link (`?segment=class:ID`).

The empty state states what fills the surface and links New class.

## The detail page

Rebuilt end to end; the breadcrumb carries the class name.

- **Roster**: an AdminTable with name, age, enrolled date, and a paid StatusChip. Quiet
  per-row corrective actions: Record payment (unpaid rows only), Move… (the transfer),
  Drop. No red per-row alarm links.
- **Waitlist and offers**: the queue in position order, member and applicant entries
  distinguished, the active offer with its expiry, and offer/cancel actions. The
  stale-offer sweep on load stays.
- **Edit form**: rebuilt on the event-detail idiom (the walk's cleanest form: paired
  columns, real date inputs). Delete moves from floating-red-top-right to a quiet
  danger placement.
- **Instructors**: restyled with the page, functionally untouched.

## The transfer flow

Entry: Move… on a detail roster row. The admin picks a destination class in the current
season; the picker shows each candidate's fraction and allows over-capacity destinations
(admin override is normal).

When the fees match, the enrollment moves: `fee_paid` and `stripe_ref` carry to the
destination row, a `money_ledger` memo and an audit row record the transfer, and the
freed spot at the source runs the existing freed-spot logic (the same path
`adminDropEnrollment` takes), so the auto-offer fires. Guardian contact and interests
carry with the enrollment.

When the fees differ, the flow warns with the exact difference and requires explicit
confirmation; the difference settles out-of-band and the memo records it. No charge or
refund happens in the flow.

Unit tests cover the same-fee guard, the `fee_paid`/`stripe_ref` carry, the freed-spot
trigger, and the audit rows.

## Pass-opening mechanics

cairn 0.89.0 (the admin-toolkit subpath release) is on the registry. Before any Classes
work: bump the dependency range from `^0.88.0` to `^0.89.0`, replace the local
`src/admin-club/toolkit/` copies with the `admin-toolkit` subpath imports, delete the
local copies, and clear the full gate.

## Toolkit harvest

Second consumers this pass creates: AdminTable, ExpandableRow, StatusChip, ListToolbar,
and the formatters (including `ageFromBirthdate`). New harvest candidates it generates:
the over-capacity chip voice, the empty-state recipe, time-scoped list guidance, and the
move-between-containers action pattern (which later serves asset reassignment). The DX
harvest mandate applies throughout.

## Out of scope

- New instructor behavior (assignment stays as built).
- Any Stripe charge or refund inside the transfer flow.
- The cross-class waitlist screen (pass B built it; it only gains whatever the shared
  components give it for free).
- Auto-offer policy changes (the freed-spot rule stands as coded).
- The public signup flow and its capacity gate (`isPubliclyOpen` stands as coded).

## Process and acceptance

Probe pages settle the visual verdicts that need Geoff's eyes: row anatomy and density,
the over-capacity voice, and panel composition. The three open Members probe items
(StatusChip palette mapping, the never-paid `'none'` display copy, the search focus
ring) ride the same review. Then the standard pass shape: plan, Sonnet implementer
dispatches, reviewer fan-out, a fresh-context coherence read at 390 and 1440,
CI-canonical baseline regeneration via the `ci.yml` dispatch, and Geoff's before/after
on dev.

Acceptance: the list opens to the current season with working expand panels; the detail
page shows a real named roster with ages and paid state; a paid student moves between
same-price classes with the payment following and the freed spot auto-offering; the fee
mismatch warns; gates green (check 0/0, tests, build, design-probe, visual baselines).
