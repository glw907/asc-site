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
