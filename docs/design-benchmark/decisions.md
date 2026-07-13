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

- **Bands**: full-page alternating tints are HOME-ONLY. A long-form page may use ONE tinted
  band around its primary action group (education's registration+CTA is the first). Ruling
  amended by the owner 2026-07-08; both forms codified in docs/2026-07-06-asc-phase-1-design.md.
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

## Benchmark provenance

Pinned by the owner 2026-07-08 ("that's our new design benchmark"): the home page at commit
9b0f415, re-captured at a681023 after the nav-divider removal. Captures in this directory.
