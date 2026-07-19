# Design decisions log

The design-refinement skill's persistent decisions log: every settled design question with
its reasoning. Later rounds never re-litigate a logged decision unless the owner reopens it.
Dates are 2026-07-07/08 (the home convergence arc) unless noted.

## Dose words (the owner's calibration language, quoted)

- "Don't overdo this stuff. The current design is solid. This is just **felt refinement**."
- Education: "**probably shouldn't be quite as 'designed'** [as home] since its function is
  different" … "it also shouldn't read as a well-structured formal document. It should read
  as a **fun, engaging, and informative web page**." (A program brochure done well.)
- "The general vibe should continue to be **fun, relaxed, and inviting**. But there are
  proven rules for creating exactly that effect while also remaining well organized."
- "You don't need to invent a radically new thing. You can fall back on **proven web UI/UX
  design patterns**."

## Settled decisions

- **Bands and full-bleed composition: considered and justified, not an exception list (Geoff,
  2026-07-16, reframing the older home-only rule)**: a page-level full-bleed composition is a
  deliberate design device that each page must earn. It is not forbidden everywhere except a
  named list, and it is not free. The standard is that the page's own function asks for it and
  the pass can say why. The worked examples carry the calibration, in both directions: HOME
  earns it (the north star's alternating bands are the page's whole composition). The MEMBER
  PORTAL earns it (an app surface, not a content page; the full-bleed masthead is the standing
  surface a member reads first, ratified in docs/2026-07-16-portal-redesign-design.md and
  confirmed by Geoff live: "the portal is a somewhat unique screen by design"). EDUCATION did
  NOT earn it: a pass gave it its own pitch-section bands and Geoff ruled them out on dev the
  same day, because a long-form content page's bands were decoration applied to prose, not
  composition the page's function needed. That outcome still stands under this framing. A
  long-form page may still use ONE tinted band around its primary action group (education's
  registration+CTA is the first; owner-amended 2026-07-08). The older "HOME-ONLY, no per-page
  exception" wording is superseded: it was protecting against unjustified bands, and the
  justification test protects against those directly. What a future pass owes is the reasoning,
  written down where the next reader will find it, not a plea for an exception.
- **Full-bleed**: content blocks (photos, card rows, galleries) never stretch viewport-wide
  at wide viewports — they cap at the wide content breakout. Edge-to-edge is fine at tablet
  and below where viewport and measure converge. Background bands may bleed.
- **The triptych (What we do)**: one GROUP-rounded object — radius and clip on the band,
  square interior seams, panels abutting. Not per-panel rounding (creates divots), not sharp
  (it's a framed object among framed objects). Panel captions are true shared grid rows
  (subgrid): titles, descriptions, links at identical y at every width. Copy is the club's
  original wording (owner-supplied), deletion-only trims, description ink full white at 450.
- **The notification (bulletin)**: a bounded card below the hero spanning the full measure —
  the north star's block form wearing the pennant glyph (the pennant is the gold accent; no
  left bar). "Read more →" (non-wrapping). Present, never loud.
- **The Season**: two balanced columns (month-boundary split), hairline month caps, fixed
  date column, four dot categories (gold=classes, green=social, gray=club business,
  blue=racing) pixel-verified for separation, quiet legend row, event names at step -1 with
  dates a step below. Dots center on the name's x-height (no manual nudge — the baseline
  slot does it; em-nudges die with type changes).
- **The fleet list**: a plain spelled-out list ("Six Lido 14s") in the quiet register
  (step -1, mid-muted ink, tight rows) — the club's original sentence as outro. Not
  leader-dots, not numeral columns, no composed summary lines ("Nineteen boats…" was an
  AI-tell flourish; killed).
- **The two-list register**: fleet and facilities lists are siblings — same step, ink, and
  rhythm; device varies only where content differs (counts vs checkmarks).
- **Nav**: no hairline divider before the icon trio — the gap rhythm carries the grouping
  (an invisible spacer preserves the approved distances). Members→Contact spacing has an
  optical correction. Hover dropdowns with enter/exit intent delays.
- **Link idiom** (site-wide tokens): rest underline at 35% translucent primary, hover
  strengthens to full color, focus ring 2px solid primary offset 2 on EVERY link family,
  selection = 28% navy wash.
- **The Questions close (education)**: a short warm text close with the action inline, set
  as the full-width closing card — never a bare centered button.
- **TOC standard**: in-flow jump list for medium pages; gutter rail for long pages, quiet
  register (wayfinding furniture, never a content peer); collapses to an accordion on mobile.
- **Photography**: image identity = asset + crop (content decisions, never free variables);
  derived crops fix focal problems and push to BOTH local and production R2; original-site
  copy and image selections are the specification (typos and defects always fixed, recorded).

- **Education page (round 2, 2026-07-08, commit 9f6bd4a)**: the opening is an INTRO (warm
  lede at the lead register ending in "See class dates →", location woven in, kids-in-
  lifejackets photo, credentials in a body paragraph below). One sage band wraps How to
  Register & Pricing through Ready to Join (the page's single band per the amended ruling).
  The course weekend is a designed schedule in the Season's grammar (day caps, filled/open
  dots = on-water/classroom, legend, prose detail below). Registration path = stacked
  numbered rows (1-2-3 counter badges), not columns. What You'll Learn = three themed
  clusters, two columns desktop. Questions closes as a warm full-width card. TOC at step -2
  muted (wayfinding furniture), <details> accordion on mobile. Owner facts landed: youth
  swim/capsize policy, $500-family-for-child-only, Big Lake drive times (1h15 Anchorage /
  ~25 Wasilla / ~45 Palmer), US Sailing certification. Dose: "fun, engaging, informative
  web page — a program brochure done well, less designed than home."
- **Review state at handoff**: education round 2 is on dev UNREVIEWED by the owner; a lens
  re-read was killed mid-run (fragments found no majors: focus-on-tint correct; a mobile-TOC
  capture was being redone). The owner reviews next; his notes are the next round's input.

- **Education round 3 (2026-07-09, merged to main at 0827c06)**: the round-2 page had a
  hydration DUPLICATION bug (the band wrapper was applied before the divider-group split, the
  split cut through the wrapper's open divs, and the browser's parse repair rendered the whole
  Registration-through-Questions block twice; the owner's "empty green band" and "three tall
  boxes" notes were both this one defect). Invariant now enforced by a regression test: split
  the plain body at group boundaries FIRST, then wrap within each segment; every `{@html}`
  segment must be balanced. Shipped in the round: the band holds ONLY How to Register & Pricing;
  a third divider group ("Preparing for class" over Swim Test / Gear / Camping); the PROMISE
  HERO (eyebrow = page name, h1 = "Come learn to sail on an Alaska lake." in the display italic
  voice, support lede, full-frame 3:2 postcard photo on the wide breakout, gold-dot fact strip
  at the breakout width); valley-first unparenthesized drive times; right-of-way under
  Seamanship & safety (third cluster retitled Racing basics); the redundant gear pull-quote cut;
  membership benefits as a two-column checkmark grid (the facilities device's family, full ink);
  Questions as one full-width closing card; program-section children back on the plain prose
  rhythm (the 2xl gap is the boundary's alone); divider labels at step 0 full ink; the
  registration badge anchored to the card's real padding token (measured 1.4px from title
  center). The hero was picked by the conductor from three parallel static-HTML candidates
  (owner delegated the pick).
- **Hero photography standard**: 3:2 native, shown full frame; boxes are designed to the photo,
  never the photo cropped to a box (the round-2 portrait box beheaded the instructor in a 3:2
  source). The owner shoots mostly 3:2 and supplies orientations on spec when a slot needs one.
- **PROCESS (owner rulings, 2026-07-09, binding on every future round)**: owner notes are
  exploratory probes, not settled directives ("an opportunity for you to change and try out");
  expect 10-15 fast iterations per arc. Iteration is FULLY LOCAL: `npm run dev` plus the
  `.dev-media` fallback (seed once with `node scripts/sync-media-local.mjs`; seeding is now
  `npm run media:seed`, the shipped `cairn-media-seed` bin, engine 0.84.1); the owner reviews
  on localhost; nothing deploys to GitHub or Cloudflare until the design is finalized.
  Per-iteration ceremony is banned: no code-simplifier, no full gate, no e2e per tweak — the
  simplifier and the whole gate run ONCE when the arc settles and the branch merges.
  Turnaround target per iteration: minutes. (The design-refinement skill's dispatch-builders
  shape failed this owner's iteration economics; its next revision needs an exploratory mode.)
- **Engine bug found by the local machinery (filed in cairn-cms ROADMAP)**: the cairn media
  route passes the request `Headers` as R2 `get`'s `onlyIf`; production accepts it, but
  miniflare's dev platform proxy cannot serialize `Headers`, so every `/media` read 500s under
  a consumer's `vite dev`. The site carries a dev-only middleware workaround
  (vite.config.ts `devMediaFallback`) that retires when the fixed engine ships. Retired
  2026-07-08 with the `@glw907/cairn-cms` 0.84.1 upgrade: 0.84.0 fixed the `onlyIf`/`range`
  call site but left a second one (`obj.writeHttpMetadata(headers)` still marshaled a live
  `Headers` instance across the same RPC boundary), which 0.84.1 fixed by reading plain
  `httpMetadata` fields instead. The engine fix landed and the `devMediaFallback` middleware,
  `scripts/sync-media-local.mjs`, and `.dev-media/` are gone.

- **Header hierarchy, resolved (page template system pass, 2026-07-12)**: the round-4 arc's
  open item ("h2 vs h3 reads as one weak step") traced to a root cause, not a per-page fix:
  `--text-step-1` (the lede family) was a literal duplicate of `--text-step-2` (h3's own
  size), so the promise-hero standfirst and h3 rendered identically. Shipped both arc
  candidates together: **A** (`--text-step-1` repinned to `clamp(1.19rem, 1.17rem + 0.1vw,
  1.25rem)`, strictly between body and h3; `.prose h2` weight 600 → 700, so h2 differs from
  h3 in size and weight) plus **B** (a short gold waypoint rule above each `.prose h2`,
  kin to `EventsListing.svelte`'s spine marker). The fix is spine-wide, not education-only:
  the education-only `LONG_FORM_PAGE_SLUGS` gate generalized into a nav-rank tier selector
  (`src/theme/page-tiers.ts`, `isPrimaryPage`), deriving primary status from
  `menus.primary` with no per-page bookkeeping. Every primary page (Education, Racing,
  Events, Join, Members, Contact) now carries the composed hero and the gold marker; the
  hero itself moved from a code map (`LONG_FORM_HERO`) into pages frontmatter (`promise`,
  `facts`) and degrades to a light variant (no photo slot) when a page has no hero photo.
  Bands stay home-only, unaffected.

- **Dedicated-route primary pages mirror the light hero locally (verification round,
  2026-07-12)**: `/events/` never passes through `[...path]`, so the tier gate cannot reach
  it; the route now renders the eyebrow-plus-promise light variant itself, matched
  declaration-for-declaration to the template's, and keeps the calendar's own composition
  (its month waypoints already carry the spine's gold marks, so no prose-h2 tier rule
  there). Consolidate into a shared component when a third consumer appears. Two cosmetic
  carries from the verifier fan-out await the owner's read: home's news-card headings
  shrank with `--text-step-1` (full titles now fit where they ellipsized), and education's
  standfirst sits near body size (distinct from body by ink recession and position only).

- **Hero photos crop 2:1 with per-photo focus; the image standard is codified
  (2026-07-12)**: the owner picked the 2:1 editorial crop from side-by-side candidates
  ("2:1 looks better") with the caution that crop location must not cut heads or break
  composition. A global up-bias failed its second photo (racing's fleet cropped to sky),
  so the crop window is per-photo data: the pages concept's `imageFocus` field, centered
  default, join `50% 30%`, racing `50% 65%`. The full template-by-template imagery rules
  now live in `docs/image-standard.md`; future page builds consult it rather than
  re-deriving. Related fix the probe surfaced: the lede's trailing-CTA styling keyed off
  `a:last-child` and broke racing's mid-sentence link; the CTA is now stamped
  structurally (`lede-cta`) by the split code.

- **Inline figures: 85% flush-left inset on primary pages (ratified at the evening
  close, 2026-07-12)**: the step-down sharpens the hero's seniority on many-figure
  pages. Centered was tried first and the owner read it as right-aligned despite
  measured 49px/49px symmetry; the ragged-right column's hard left anchor makes a
  centered inset read displaced, so flush-left (spare room to the rag side) is the
  ruling. The hero's extra-width breakout is confirmed deliberate (wider-than-column =
  senior; if it ever reads accidental, widen it, never shrink). Per-template, not
  per-page; codified in `docs/image-standard.md`.

- **Submit-button color: fireweed for money/conversion, navy for utility (ratified by the
  conductor 2026-07-16, from the coherence read)**: a form's primary submit spends the
  fireweed budget only when the action is money or membership conversion (join/apply,
  donate, the class fee payment) — the site's genuine "at most twice per page" pop color,
  consistent with the fireweed-budget doctrine (see the club-grounds color story). A form
  whose action is a utility step (contact, a class waitlist join, sign-in) keeps the plain
  navy `.btn-primary`, since none of those asks a visitor to spend money or commit to
  membership.

- **Form field labels: the uppercase tracked muted label is the one idiom (ratified by the
  conductor 2026-07-16, from the coherence read; OVERRULED by Geoff the same day, round 2 of the
  basic-polish pass — see the two-level entry directly below)**: every field label on the site (a
  `<legend class="fieldset-legend">`, or an inline `<label>`'s own visible text) reads in the
  site's eyebrow device — `font-display`, `text-step--1`, weight 700, `tracking-eyebrow`,
  uppercase, `color-muted` — matching ContactForm/DonateForm/the class-signup form/my-account's
  own precedent. A fieldset's group legend carries the same register as a single field's own
  label; there is no separate, quieter treatment for a group heading.

- **Form field labels, two-level register (Geoff, 2026-07-16, overruling the entry above): "the
  labels and form title look too similar"**: a group or section legend (join/apply's "Membership
  tier," "Your details," "Household members," "Classes (optional)," "Liability release") keeps
  the uppercase tracked muted eyebrow unchanged. An individual field's own label (join/apply's
  `.field-label` span; every other form's `.fieldset-legend`, since those forms declare no
  separate group tier) drops to sentence case, weight 600, `text-step--1`, `base-content` ink —
  no tracking, no uppercase, no `font-display` override — so a single field's label reads as a
  plain form label rather than another eyebrow the same weight as the group title above it.
  Applied to all five forms: join/apply, ContactForm, DonateForm, the class-signup form, and
  my-account.

- **Post hero width: A, the reading measure (template round 1, ratified 2026-07-16, Geoff
  live)**: a post's header image renders at the article's own reading measure, not a wider
  breakout. Rider ruling: a post almost always carries one, so the template designs around the
  photo as a structural constant at that measure (placement, aspect ratio, spacing against the
  title block), not as an optional extra.

- **Waitlists: the conformed spec-sheet skeleton, not a status-index mock (template round 1,
  ratified 2026-07-16, Geoff live)**: the structural fork probed between the conformed spec-sheet
  (round 3's own device) and a status-index mock settles on the spec-sheet, the shape round 3
  already landed.

- **CTA matched pair: one geometry, two skins (template round 1, ratified 2026-07-16, Geoff
  live)**: a page-cta's primary and secondary actions share the same `.asc-cta-btn` geometry
  (display, size, weight, padding, radius, transition) instead of two unrelated button families
  (racing's own "Ready to try it?" pair measured inverted, a 62px/18px chassis secondary beside a
  44px/15.2px fireweed primary; the membership-open bulletin's Join/Renew pair carried the same
  defect). Secondary rides an `asc-cta-btn-secondary` modifier: a quiet ghost skin (transparent
  ground, a primary-tinted border, primary ink, no shadow), a one-step hover/active deepening on
  the same axis, the site's one focus recipe. `:::cta-action`'s `kind="secondary"` maps to this
  pair sitewide, not only where a matched pair appears, so every closer with a single secondary
  action (join, new-member-guide, visiting-the-club, it-request, club-boat-use-and-qualification,
  confirmation) inherits the same quieter geometry too.

- **TOC nested tier: a real sub-register, not indent alone (template round 1, ratified
  2026-07-16, Geoff live: "much better")**: a long-form page's own h3 subsections (racing today,
  via `NESTED_TOC_SLUGS`) render one step down from their h2 siblings in the jump-list/gutter-rail
  pair: 0.85x the tier's own top-level size, weight 400, muted ink, a tighter line-height, indented
  0.85rem rather than the deep `ml-m` tab, and grouped close beneath their own h2 with real
  separation between h2 groups. The boxed-panel `.toc`/`.page-toc-sticky` system (bylaws and the
  rest of the long secondary catalog) keeps its own plain indent-only treatment unchanged; only the
  long-form rail/jump-list pair was probed and ratified.

- **The gear door: a rare verb earns a door, not landing real estate (Geoff, 2026-07-16, portal
  redesign pass)**: mock D's rail is reference-only ("links only, never a button"), but the
  landing carried three real asset verbs (Release, Request an asset, Cancel request) the mock
  gave no home. Ruled: `/my-account/gear` becomes the gear-and-moorings home, absorbing the whole
  assets composition (assignment rows with payment standing, waitlist positions, pending requests
  with cancel, the request form, per-row release). The rail tile stays exactly as mock D draws it
  and gains one quiet "Manage gear & moorings" foot link; Gear joins the doors row. Paying an
  outstanding fee is NOT affected: it stays the main column's one weighted action row.
  GROUNDED IN LIVE DATA, not intuition: zero `asset_requests` have ever been filed, zero waitlist
  rows today, 40 active assignments across 148 households. Release and request run to single
  digits per season club-wide. The generalizable rule: landing real estate is priced by
  recognition value, and the rail rows already deliver the recognition ("you hold B-Dock 12");
  a door named by the noun the member is already reading IS the recognition path, so inline
  chrome buys a rare verb no findability and spends the page's calm. What would reverse this:
  real seasonal request churn (a spring mooring scramble). The fix then is a seasonal
  needs-attention pointer linking to the door, never a landing form.

- **The renewal door (Geoff, 2026-07-16, portal redesign pass)**: mock D draws the masthead's
  renewal CTA as one plain fireweed button, so the landing's old tier `<select>` had nowhere to
  live. Rebuilding it as a hidden field defaulting to the household's last tier was NOT a
  survivable simplification: it turns a grown household's one-click renewal into a silent purchase
  of the wrong tier at the wrong price, with nothing catching it. Ruled: the masthead CTA LINKS to
  `/my-account/renew`, a small step that states the tier and price plainly and continues to Stripe.
  The masthead keeps mock D's single button exactly. GROUNDED: 3 of 88 renewals with a prior season
  changed tier (~3.4%) -- rare, and rarer things than this earn a door under the gear ruling above,
  but not zero, and money correctness is not a rounding error. Same shape as [[the gear door]]: a
  rare verb earns a door, and the landing keeps its calm.

- **Release gets a two-step confirm (Geoff, 2026-07-16)**: releasing an assignment gives up a
  scarce club resource with a waitlist behind it, has no member-side undo, and recovery needs an
  admin, yet it shipped as one tap on a quiet button sharing a wrap-flexed row with Pay (plausibly
  mis-tapped at 390px). An inline two-step in the plain-words register, no modal: "This gives up
  your mooring for your household. The club may offer it to the next member. [Release mooring]
  [Keep it]".

- **Em dashes: banned from UI copy sitewide (Geoff, 2026-07-16, from the portal round's own copy
  ruling)**: the round-3 asset-row "name — detail" delimiter retires for structural label/value or
  middot separation. The ruling originated on the portal but binds every future UI copy decision,
  not the portal alone.

- **The signing moment: inline text, accordion as progress (Geoff, 2026-07-18, waivers
  probe rounds 1-2, both fully verdicted same day; built by the waivers pass)**: the legal
  text renders INLINE in the page, never a nested scroll region (NN/g and GOV.UK ground the
  ruling: inner scrolls get overlooked and are awkward on touch; inline is also the most
  conservative reading of full-text display for enforceability). The hairline document list
  IS the progress: signed entries collapse to a receipt line ("Signed {date} as {name}"),
  the current document expands with a quiet "Document i of N" eyebrow, upcoming entries sit
  muted -- no wizard chrome. The document renders as a framed sheet whose bottom edge is the
  signature strip (sage ground, typed name, filled flag-navy Sign -- the portal's first
  filled button; the one weighty act earns it; zero fireweed, zero gold). The sheet omits
  the document's own title (the entry heading carries it). Framing lines come verbatim from
  docs/waivers/signing-framing-copy.md and never characterize legal effect.

- **Household signing (same rounds)**: one Part Two entry PER CHILD with the full text each
  (a signature sits adjacent to the exact text it adopts; bundling releases under one
  signature is the pattern courts distrust); "type once, sign each" -- the first signature
  is typed fresh, later documents prefill the editable name and carried-forward attestation,
  one Sign click per document (flagged to the attorney); the AS 09.65.292 relationship
  attestation is a quiet radio group in the strip, first child unselected. The
  HOUSEHOLD-COMPLETE gate (spec decision 7 as amended 2026-07-18): no payment, no class
  registration, no joined state until every member's signatures are in; an incomplete
  household's moment ends at a WAITING state (who remains, cooldown-guarded nudge, payment
  locked), and one resumption email deep-links payment when the last signature lands.
  Contact-confirm (storage/mooring holders, once, after the last signature) is a
  glance card: read-only rows, filled "This is current", quiet "Update it".

## Benchmark provenance

Pinned by the owner 2026-07-08 ("that's our new design benchmark"): the home page at commit
9b0f415, re-captured at a681023 after the nav-divider removal. Captures in this directory.
