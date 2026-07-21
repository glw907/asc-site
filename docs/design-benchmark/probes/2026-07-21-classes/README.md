# Classes-pass probes (Task 6)

> Spec: `docs/2026-07-21-classes-pass-design.md`. Plan: `docs/plans/2026-07-21-classes-pass.md`,
> Task 6 Step 1. All four pages are self-contained HTML (open directly in a browser, no build
> step, no dev server) — a different idiom from the Members-pass toolkit probe
> (`docs/design-benchmark/probes/2026-07-20-members-toolkit/`), which captured PNGs from a
> dev-only Svelte route. Each page embeds the real, currently-installed
> `node_modules/@glw907/cairn-cms/dist/components/cairn-admin.css` (cairn 0.89.1) verbatim in a
> `<style>` block, so every daisyUI/Tailwind class used below (`table`/`table-sm`/`table-xs`/
> `table-zebra`, `btn`/`btn-sm`/`btn-xs`/`btn-ghost`/`btn-primary`, `badge`/`badge-sm`/`badge-xs`/
> `badge-neutral`/`badge-ghost`/`badge-outline`, `status`/`status-success`/`status-warning`/
> `status-neutral`/`status-info`, `input`/`input-sm`/`select`/`select-sm`) is real compiled CSS,
> never an approximation — the pass's own binding constraint that any class in admin markup must
> exist in the built sheet. Every panel wraps its markup in `<div data-theme="cairn-admin">` (or
> `cairn-admin-dark`) around an inner `<div class="bg-base-100 text-base-content">`, the same
> descendant-of-the-theme-element structure the Members probe's own README documents (a class on
> the `data-theme` element itself does not match cairn's `:where([data-theme=...]) .bg-base-100`
> scoping). Both admin themes render side by side in every block; nothing here needs a toggle.

Markup, class names, and data shapes are grounded in the shipped code: `src/admin-club/lib/
classes-store.ts` (`ClassListRow`, `EnrollmentRow`, track/track-label vocabulary), the list screen
`src/routes/admin/club/classes/+page.svelte` (row anatomy, panel composition, commit 696a8f7), the
detail screen `src/routes/admin/club/classes/[id]/+page.svelte` (roster/waitlist markup, commit
b8df325), and `src/admin-club/lib/member-format.ts` (the household-standing `StatusChip` tone
mapping and the `'none'` copy Rider 1/2 below carry forward). Class names (Adult Learn to Sail,
Youth Optimist, Youth Laser Racing, Junior Race Team, Wednesday Night Drop-in, Keelboat Cruising
Clinic) are fictional, in the club's own program vocabulary; no field renders that the schema
doesn't carry, and none of the member/household names are real people.

## 1. `list-row-anatomy.html` — row anatomy & density

**Question:** which density should the season-scoped Classes list ship at — today's shipped
`density="sm" zebra`, the more compact `xs` tier (closer to the Members-pass "half height"
target), or `sm` with the zebra off — and does the row's own anatomy (name, track, dates, enrolled
fraction, waitlist count, pending-offer marker, the quiet Hidden marker, the drop-in mark) read
cleanly at each? Six rows exercise every anatomy case at once (a normal fraction with an active
offer, a full class with no waitlist, an over-capacity fraction, a hidden class, a drop-in class,
and a waiting class with no offer yet), across all three density variants, both themes.

**Verdict: open.**

## 2. `over-capacity-voice.html` — the over-capacity voice

**Question:** the spec rules capacity soft (over-capacity is normal admin life, never an alarm) —
does the shipped plain fraction already say enough on its own, or does a quiet treatment read
better once a class runs over: a muted fraction that recedes, or the fraction at full strength
plus a small neutral `badge-ghost` "+N over" annotation? Three variants, same five classes (under
capacity, exactly full, over by one, over by five, a drop-in), both themes. None of the three uses
`warning`/`error` color — that palette stays the household-standing vocabulary's own.

**Verdict: open.**

## 3. `expand-panel-composition.html` — expand panel composition

**Question:** does the list row's expand-in-place panel (roster with age and paid `StatusChip`, a
waitlist summary line, the fixed Open class / Email class / Offer next seat action set) read
cleanly, and does the one-time claim-code reveal sit well right after an offer fires? Two states:
a normal roster with an outstanding but currently-unactionable waitlist (Offer next seat hidden,
since this class's own waitlist is empty), and the instant after **Offer next seat** submits on a
different class (waitlist summary now reads "offer sent", the claim code shown once in its own
labeled field).

**Verdict: open.**

## 4. `riders.html` — three open Members-pass items

Carried forward from `docs/design-benchmark/probes/2026-07-20-members-toolkit/` since every
Classes surface reuses these same components:

- **Rider 1, StatusChip palette mapping:** the shipped mapping (Current `success`, Overdue
  `warning`, Former/None both `neutral`) against two alternatives — Former reading `info` to
  separate "used to be a member" from "never was," and a fully quiet reading where even Overdue
  drops to `neutral`, leaving Current's `success` as the palette's one live color.
- **Rider 2, the never-paid `'none'` display copy:** the shipped label ("No membership") against
  three alternatives ("Never joined", "Not a member", a bare em dash with no label at all).
- **Rider 3, the search focus ring:** `ListToolbar`'s search box compiles to daisyUI's own default
  `.input:focus-within` rule, which rings in `--color-base-content` (near-black in light, near-white
  in dark) rather than the flag-navy `--color-primary` every other focus-visible control on the
  page uses. Shown against a primary-colored ring and a softer muted-gray ring. Each box is forced
  into its focused visual state via an inline style matching the exact compiled rule shape (a
  static page can't hold real keyboard focus), so the ring itself is comparable without clicking
  in.

**Verdict: open** on all three (unchanged from the Members pass; riding this review since the
Classes build is this component set's second consumer).
