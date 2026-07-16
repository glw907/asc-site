# Basic-polish fix list (adjudicated 2026-07-16)

The conductor's adjudication of the whole-site observation sweep (9 Opus observers + coverage
critic, workflow `wf_f30a1c8a-039`, 78 findings; screenshots under the session scratchpad's
`site-observe/`). Geoff's charge: the site needs a basic level of polish BEFORE his feedback
rounds — pages must feel designed, not assembled, and his eyes are reserved for taste, not for
cataloguing basics. Ranked by perceptual leverage. Home and education came back clean and are
untouched except where a sitewide fix naturally reaches them.

Execution is three sequential batches (one gate-running executor at a time). Every batch clears
the full gate (check 0/0, unit tests, build). Baselines are CI-canonical: batches commit CODE
ONLY, never PNGs; the conductor pushes and regenerates via the ci.yml `update_snapshots`
dispatch. Everything lands on dev; Geoff's before/after gallery reviews the finished state.

## Batch 1: component vocabulary (theme CSS + components — one fix, many pages)

1. **Card arrow inline** (high, ~7 pages): the `.asc-card-arrow` glyph strands alone on its own
   line at every link-card's bottom-left (join, new-member-guide, seasonal-storage, contact,
   welcome, class-registration, get-involved). Conform to the `:::related` idiom: the arrow
   rides inline after the card title/link text (aria-hidden trailing span), never a floating
   block glyph.
2. **Form control accent** (medium): radios and checkboxes render UA cornflower blue. One rule:
   `accent-color: var(--color-primary)` on the site's form controls (join/apply tier radios,
   liability checkbox, any others).
3. **Table variant hardening** (high, fixes the news results tables and every fees/gear table):
   in the `::::table` variant CSS — numeric columns right-aligned (keeping tabular-nums); cells
   `white-space: nowrap` with the existing overflow-x container carrying width (kills mid-name
   wraps); ONE row-separation treatment (zebra or hairline, never both — also fixes visiting's
   packing checklist and the committees roster); key/first column at row-header weight 600;
   raw migrated `.prose table` gets the same header-rule + spacing treatment so directive and
   legacy tables read as one vocabulary.
4. **Small furniture**: chip baseline alignment beside plain text in meta rows; the
   `<details>` marker styled to the navy link family (liability disclosure); the events month
   jump-links get the quiet link idiom (they currently read as inert text); the events timeline
   spine capped at the first and last dots; event-deck truncation cut on a clause boundary,
   never mid-clause.
5. **Reserved Turnstile slots** (medium, three money/contact forms): the invisible reserved
   band between last field and submit (join/apply, donate, contact) collapses to a spacing-scale
   gap when the widget is absent and sizes to the widget (~300x65) when present, so nothing
   jumps in either state; Turnstile theme set to follow light/dark; the my-account stacked
   controls (input / widget / button) get a shared measure so their right edges agree.

## Batch 2: content conversions (markdown/content rollout of the shared vocabulary)

1. **Join page** (the exemplar Geoff named): dues → `:::facts` (tabular numerals on amounts);
   Additional Fees → `::::table{variant="fees"}` with the "(see Education)" reference moved to
   the legend slot; the two peer sub-labels unified on the eyebrow token; the two cross-reference
   cards → `:::related`; "Ready to Join?" → `:::page-cta` with a fireweed `.asc-cta-btn` — the
   page's primary conversion currently reads as a body-prose link (the single worst finding).
   The About-the-Club h3 icon rule made consistent (icons on all peer h3s or none).
2. **Governance/legal docs**: all five documents' bold-label metadata headers ("Document:",
   "Adopted:", "Authority:") → `:::facts`; the stranded middot-joined download links fold into
   the facts/related furniture.
3. **Storage pages**: transient-rv "Before You Arrive" → `:::facts`; rack-storage and
   trailered-boat-parking stranded "Cost:" lines → `:::facts` (moorings is the exemplar);
   waitlists' four "Status:" prose lines → the availability-chip vocabulary; long-term-rv
   eligibility moves off `:::steps` (it implies sequence) onto the requirement callout tone.
4. **Guides/membership**: new-member-guide term:value bullet lists → `:::facts`;
   club-boat-use-and-qualification gets the `:::steps` rail + `:::related` its sibling
   visiting-the-club already has, plus a closer; discord-server Getting Started → `:::steps`;
   get-involved committee chairs → a one-row `:::facts` per committee.
5. **Forms pages**: donate tiers → `:::facts` (amount/outcome, aligned numerals); contact
   location/mailing → `:::facts`; emails leave the monospace code-chip register and become
   mailto links (donate, it-request — Discord #channel chips stay, they are literal tokens);
   it-request's void closed with the `:::page-cta` closer; redundant label-echoing placeholders
   dropped on join/apply.
6. **News surfaces**: dock-party's raw migrated HTML tables → `::::table` directives;
   one-design race tables drop their all-empty handicap columns at the source; Browse-by-Topic
   grid → 2x2 ordered by post count; "Browse by Topic" heading gets the year-headings' rule;
   post-list rows group title+date consistently at 390; tag-archive header gets the index's
   count/eyebrow vocabulary; the 2+1 stats-bar wrap composed.
7. **System pages**: the payment confirmation page gets a designed success surface (checkmark
   from the icon set, next-step `:::page-cta` to /my-account and Events — a member just paid;
   the page currently dead-ends into two viewport-heights of white); official-website's
   triple-affordance link list de-layered; education's "18-25" → en dash.

## Batch 3: composition corrections (visible changes, headline items in Geoff's gallery)

1. **New-member-guide de-carding** (the sweep's heaviest page): per-section card wrappers drop
   so prose sections read as passages ("passages mark sections, cards mark objects, nothing
   gets both"); one tinted-panel idiom reserved for the genuine link-card clusters; the 390
   double-inset collapses.
2. **Event/class meta strip → `:::facts` anatomy**: card chrome drops in favor of the
   borderless label/value rows; the 390 grid pins two shared tracks (no 2-then-3 ragged wrap);
   add-to-calendar becomes the listing's iconed calendar-link idiom on the detail page.
3. **Articles-of-incorporation (and member-expectations, committees) card-stack flattening**:
   continuous legal prose reads as flat sectioned prose with the TOC carrying navigation
   (determination-letter is the exemplar) — the design contract itself names heavy card use as
   a phase-1 defect.
4. **Donate page**: hero composed per the home north-star (no L-shaped dead quadrant); the
   custom-amount field sized to a currency value; the resting submit either gains a default
   amount or a deliberate gated-state treatment (currently reads broken); the same hero fix
   applies to new-member-guide's hero void.
5. **Home news card image**: the synthetic Matrix-code image swapped for a photograph meeting
   docs/image-standard.md's news-card crop (the one home finding).
6. **Notification banner marker**: OS emoji flag → theme icon set in a token color.
7. **Moorings facts label column**: tightened toward content-max so short labels don't open a
   dead gutter (the one moorings finding).

## Round 2 (Geoff's gallery notes, 2026-07-16; conductor-designed, measured before ruled)

Geoff's five notes translate to three axes; the card notes (1, 2, 5) are one system ruled
whole per his own words ("this card idiom is a problem in all cases, and the component needs
a redesign").

1. **The card component, redesigned** (`components.ts` buildCard/buildCards +
   `asc-components.css`):
   - Anatomy: the icon hangs in a fixed leading column (top-aligned to the title's cap
     height) and NEVER sits inline with title text; the text column carries the title (600,
     inline trailing arrow as shipped) with the description below it, aligned to the title's
     left edge — wrapped title lines stay in the text column.
   - Grids are count-aware lattices (the builder knows the count): 2 cards → 2-up, 3 → 3-up,
     4 → 2x2, 5 → 3-up, 6 → 3x2 — always spanning the full available measure, with
     `align-items: stretch` AND `grid-auto-rows: 1fr` so every card in a lattice shares one
     height (fixes join's 169/145 mix, members' 120/96 mix, the NMG panel's 198/173/202
     2+1). The members-only equalize device and the TWO_UP heading-ID device retire into
     this (they were patches on the un-designed system).
   - A single card is not a grid: render it as a full-measure quiet row-card (icon left,
     title + description right), replacing the lone 448px box floating in a 614px container
     (NMG's Discord/Account/Get-Involved cards).
   - Measured baselines: join 6-card heights 169/145/145/169/145/169; NMG panel
     grid-template 257/257 holding 3 cards; members grid2 120/120/120/96/96/96. After: one
     height per lattice, full-measure tracks.
2. **Form label register, two-level** (reverses the finish-round one-idiom ruling — Geoff:
   "the labels and form title look too similar"): field labels are sentence-case, weight
   600, `--text-step--1`, base-content ink; group legends and section titles keep the
   uppercase tracked muted eyebrow. Applied to ALL five forms (join/apply, contact, donate,
   class signup, my-account). decisions.md updated: the 2026-07-16 one-idiom entry is
   OVERRULED by Geoff, this two-level scheme is the ruling.
3. **Heading rhythm** (measured: education's settled h2-to-content gap is 13px; NMG's
   de-carded flow shows 56px, the awkward space Geoff flagged on Life at the Club): add
   tight-below-heading rules for h2/h3 as `--flow-space` overrides on `h2 + *` / `h3 + *`
   (the small step), keeping the owl-selector system intact. Education must render
   pixel-identical (its baselines are the proof); NMG lands at the benchmark rhythm.

## Round 3 (the five-template first pass, adjudicated from workflow wf_2dd7fd6d-362)

Round-2 verification: forms/rhythm CLEAN; cards clean everywhere except one root cause. Five
template observations (class-door, racing, news-post, utility-leaf, member-portal — the portal
captured signed-in for the first time, light+dark, via a seeded local session). Execution is
four sequential batches; racing's lower-two-thirds pacing and the post-hero width are
DELIBERATELY DEFERRED to Geoff's interactive exemplar round (taste, not basics).

### Batch 3A: component contracts (gate the rest)

1. **Card lattices go container-query** (round-2 verify HIGH): the per-count column rules gate
   on a 40rem VIEWPORT breakpoint, but the NMG panel's lattice lives in a ~560px container at
   1440 — forced 3-up gives 169px cards (mid-word title break, split code chip, ~150px dead
   space). `.asc-cards`' parent context gets `container-type: inline-size`; the count rules
   move to `@container` gates on the lattice's real width (3-up needs roughly ≥42rem of
   container; 2-up ≥26rem; below that, one column). NMG's panel lands at 2-up naturally.
2. **Table nowrap scoped down** (racing HIGH; a Batch-1 over-application): the blanket
   `.asc-table td { white-space: nowrap }` clips prose Notes columns (racing's gear table cut
   mid-word at 1440, the whole column off-screen at 390). Scope nowrap to the results variant
   and right-aligned numeric cells; fees/gear prose cells wrap on the measure.
3. **Availability inline-note contract** (utility HIGH): the note slot renders as a detached
   sibling paragraph. Coerce it inline — chip + middot + note in one grouped status line
   (`.asc-availability-note`, muted, step--1) — and tighten the chip's flow-space so it groups
   with its heading.

### Batch 3B: class-door + utility-leaf first passes

- Class-door: the meta row becomes the facts-family anatomy (drop the "Alaska Sailing Club"
  self-reference location; add fee; availability as the neutral chip, killing the
  colored-sentence status); the "Sign up: {name}" setup-colon title recomposes as an eyebrow
  kicker + class-name title; one light seam ("Your details" group legend) between the reading
  half and the acting half; outcome/pivot panels move off daisyUI info/success tints onto the
  site's own callout vocabulary; the pre-submit Turnstile void collapses when the managed
  challenge passes invisibly (the :empty rule misses the hidden-input case — investigate
  :has(iframe) or equivalent; no jump in either state).
- Utility-leaf: trailered's raw closing link → `:::related` (identical to rack's); waitlists
  gains the same closer; rack + trailered get one real multi-row facts block near the top
  (Cost / Eligibility / Contact, moorings as the model) replacing the sparse single-row block;
  the four "To express interest:" bold-colon lines drop the faux-structure frame for plain
  sentences.

### Batch 3C: news-post + racing first passes

- News-post: a designed tail — rule, "Filed under" tag chips LINKED to /tags/[tag] (they are
  currently inert decoration) with hover/focus states, prev/next between date-adjacent posts,
  and a "More news →" index link; a "News" back-link above the date (the governance back-link
  device); the post's first paragraph gets the lede treatment via the existing splitLede
  machinery; the dangling "And here's a PDF copy to download:" line is removed from the
  results post's source (FLAG for Geoff: the PDF asset needs re-locating from the legacy site
  before a real download slot is worth building).
- Racing: a `:::page-cta` closer (one fireweed action toward /events/, a quiet education
  secondary); the TOC gains a nested h3 tier for this page via the template's override device
  (education's settled TOC untouched); the "What to Bring" caption echo drops (the h3 already
  names the table).

### Batch 3D: member-portal first pass

One shared portal field-label class propagating the sentence-case ruling to profile, classes,
household, directory (deleting the four duplicated uppercase blocks); assets rows become one
consistent label/value grammar with the status chip and tabular fees (killing the em-dash /
label-colon / inline-warning mix); every member-facing date routes through the one shared
long-form formatter (no raw ISO slices); row actions (Release / Update listing / Withdraw /
Cancel / Leave waitlist) take the portal-quiet-action affordance, destructive confirm tier
unchanged; the landing adopts one deliberate card-vs-flat grouping rule (status/household/
assets carded; receipts and the nav row flat) with deliberate spacing steps; the classes
empty-state stack tightens.

## Rejected / already-ruled (not applied, logged so nothing is silently dropped)

- The category-dot + availability-chip two-register pairing: the deliberately shipped chip
  vocabulary (observer correctly held fire; stays).
- Discord #channel names in the code-chip register: literal tokens, stays (emails do not).
- Season gold dot vs star: retracted by the observer against the north star.

## Coverage-debt additions (supplementary observer, folded 2026-07-16)

The four missed surfaces are fundamentally well-composed; seven polish findings fold in:

Into Batch 2:
- `/racing` "What to Bring" → `::::table{variant="gear"}` with caption.
- `/class-registration-complete` joins the confirmation-page item: kicker eyebrow, a success
  affordance, and the dead void closed — both system success pages get the same designed
  surface.
- The membership-open bulletin (`/bulletins/2026-03-membership-open`) ends on a `:::related`
  or `:::page-cta` closer instead of a hard stop.
- The h3 icon rule (join's item 1) extends to `/racing`: per page, peer h3s are icon-consistent
  — icons stay in card titles where they are card vocabulary; prose h3s drop them.

Into Batch 3:
- `/members` card rows equalize height (grid stretch) so bottom edges and affordances share a
  baseline.
- `/members` "At the Club & On the Water" holds 4 cards in a 3-wide grid, stranding one —
  rebalance (2x2 or an even count); gallery flag.

Observer note: the live notification page routes at `/bulletins/<slug>`, not
`/notifications/<slug>` (consistent with the notification-pages memory).
