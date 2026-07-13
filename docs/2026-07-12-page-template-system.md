# The page template system: a shared spine, five templates, nav-rank tiers

Status: spec ratified in brainstorm (Geoff, 2026-07-12); awaiting his read of this
write-up before an implementation plan is written. Surfaced from the education
design-refinement arc (rounds 1-4, `docs/design-benchmark/`).

## The problem

The education arc kept fighting one root defect: the theme's type scale collapsed, so
`--text-step-1` and `--text-step-2` carry the identical clamp
(`src/theme/theme.css:155-156`) and h2 and h3 render at the same size. Every page's
heading hierarchy reads flat, and every per-page fix so far has been a local patch on a
global problem. The site also grew page treatments organically: home is its own
band-composed route (ratified, pinned benchmark), education runs a richer branch of the
shared `[...path]` template gated by `LONG_FORM_PAGE_SLUGS`
(`src/routes/(site)/[...path]/+page.svelte:88`), and every other page runs the plain
branch. Nothing names these treatments or says which pages get which.

## The model

Five templates in two families, unified by one shared typographic spine.

**The shared spine (all five templates).** One type face, one rhythm, and one fixed
type scale in which every adjacent step pair is visually distinct at both 320 and
2560 wide. This corrects the h2/h3 collapse everywhere at once; it is the universal
floor, not a tier.

**Family A: pages, three emphasis tiers, strictly additive.**

- **Secondary** = the clean spine: plain title hero, corrected hierarchy, no ornament.
  Every interior page, including the Members-dropdown pages.
- **Primary** = spine + a composed hero + the gold waypoint marker (the arc's
  candidate B). The hero is *adaptive*, below.
- **Home** = primary's spirit + its ratified band composition. Structurally untouched
  by this work, and re-verified against the pinned benchmark
  (`docs/design-benchmark/home-benchmark-{390,1440}.png`) after the spine lands.

**Family B: timeline content, each its own concept and template.**

- **Post**: dated article on the spine.
- **Bulletin**: short announcement with a permalink page plus the home banner surface.

Both inherit the corrected spine immediately. Their bespoke composition (post
hero/date treatment, the bulletin card, whether posts borrow the gold marker) is a
deliberate follow-up spec, out of scope here (ruled: phase it, 2026-07-12).

## The selector: nav rank (ruled by Geoff, supersedes the page-kind lean)

A page's tier derives from `menus.primary` in `src/theme/site.config.yaml`, with no
per-page bookkeeping:

- Top-level nav destination → **primary**: Education, Racing, Events, Join, Members,
  Contact.
- Everything else → **secondary** (nav children like New Member Guide are interior
  pages, not top-level destinations).
- Home keeps its own route; posts and bulletins select by concept.

The existing `LONG_FORM_PAGE_SLUGS` set generalizes into this selector rather than
gaining entries by hand.

## The adaptive primary hero (ruled: minimize templates)

Nav rank puts primary chrome on functional pages: Contact is a form, Events is a
listing. Geoff's steer is to minimize the template count, so there is **no sixth
"utility" template**. Instead the one primary template degrades gracefully:

- A page with hero content gets the full promise hero: eyebrow, italic promise line
  as the page's h1, lede, full-width photo, fact strip (education's ratified shape).
- A page without a photo gets the light variant: eyebrow and promise line, no empty
  photo slot.
- Group dividers and the gold waypoint marker fire only where a page actually has
  multiple content sections, so a single-purpose form page shows composed chrome and
  nothing forced.

Hero content (promise line, facts, photo) becomes per-page data. Bias the mechanism
toward frontmatter fields on the pages concept so editors own it; the existing
`LONG_FORM_HERO` code map is the interim shape the data migrates out of. The
implementation plan settles the exact fields.

## Binding constraints carried in

- **Bands are home-only** (Geoff, 2026-07-07, codified in `src/theme/site.css`).
  The primary tier adds the waypoint marker and hero, never bands.
- The gold active-nav underline is sanctioned north-star; do not re-flag it.
- The family five-viewport responsive standard applies: the corrected scale composes
  at 320 and 2560, not merely survives.

## Acceptance

1. Every adjacent type-scale step pair is distinct; h2 vs h3 is unmistakable on any
   content page.
2. Education still matches its ratified round-4 look (it becomes the reference
   primary page; visual delta only where the corrected spine itself moves it).
3. Home passes re-verification against the pinned benchmark captures after the spine
   change, or the delta is presented to Geoff before anything deploys.
4. The tier selector has one source of truth (`menus.primary`); adding a nav
   destination promotes its page with no code edit beyond optional hero data.
5. Posts and bulletins render on the corrected spine with no composition regression.
6. The full-manifest secondary sweep: every interior page reads clean on the new
   spine at 390 and 1440 (the page-review gate applies at settle, per the
   design-iteration economics ruling).

## Out of scope

- Posts/bulletins bespoke composition (the follow-up spec; includes the
  gold-marker-on-posts question).
- Any home structural change.
- The notifications concept's surfaces.
