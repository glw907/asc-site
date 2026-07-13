# Image standard, template by template

The one page stating what imagery each template carries: size, ratio, crop discipline,
and what never appears. Codified 2026-07-12 during the page-template pass, from the
owner's crop picks and the verified hero geometry. The template system itself is
`docs/2026-07-12-page-template-system.md`; design rulings live in
`docs/design-benchmark/decisions.md`.

## Universal rules (every template)

- **Real club photography only, never stock.** Photos of actual members on the actual
  lake are the site's trust signal; a generic sailing photo is worse than no photo.
- **Every image carries honest alt text** describing the scene. No member names in alt
  text or captions (public repo; the PII rule).
- **Images serve from the cairn media library** (`media:` references in frontmatter and
  figure directives), never committed to the repo or hotlinked.
- **Native ratio unless this standard says otherwise.** When a template crops (the 2:1
  hero), the subject is protected per photo with the pages concept's `imageFocus` field
  (a CSS object-position pair, e.g. `"50% 30%"`); the crop centers when unset. Check
  every new hero photo's crop at 390 and 1440 before calling it done.
- **One lead image per page.** The hero is the largest image on its page; nothing
  below it competes at the same scale.
- Composition holds at the family five-viewport bar (320 / 390 / 768 / 1440 / 2560).

## Home (band-composed, pinned benchmark)

Home's imagery is part of its ratified composition: the split hero photo, the
portrait triptych, and the Learn/Race/Relax band. It follows the benchmark, not this
standard's generic rules. Any image change re-verifies against
`docs/design-benchmark/home-benchmark-{390,1440}.png` before deploy.

## Primary pages (Education, Racing, Events, Join, Members, Contact)

- **Hero photo: 2:1, column width with the modest breakout.** The flatter editorial
  ratio keeps the first content section near the fold. Set `imageFocus` when the
  subject sits high or low in frame (join `50% 30%`, racing `50% 65%`); education and
  members ride the centered default.
- **The light variant is fine.** A primary page without a suitable photo renders
  eyebrow plus promise line with no photo slot (Contact, Events). Never force a photo.
- **Fact strip only with real facts.** No fact strip exists without frontmatter
  `facts`.
- **Inline figures: text measure, native ratio (usually 3:2), uncropped.** The
  breakout belongs to the hero alone.
- Open item, owner verdict pending: on a many-figure page (education runs six),
  stepping inline figures to ~85% of the measure to sharpen the hero's seniority.

## Secondary pages (every interior page)

- **Usually no imagery.** These pages are documents; the corrected type spine carries
  them.
- When a photo genuinely helps, it gets the quiet title-adjacent hero at native
  ratio. Never a promise hero, fact strip, or breakout on a secondary page.
- Inline figures follow the same rule as primary: text measure, native ratio.

## Posts (interim, pending the composition follow-up spec)

- Posts ride the shared spine today; their bespoke composition (hero and date
  treatment, whether they borrow the gold marker) settles in the posts/bulletins
  follow-up spec.
- Until then: an optional hero from the `image` field renders at 2:1 for family
  consistency; inline figures follow the primary-page rule.

## Bulletins

- **No imagery.** A bulletin is a short, time-sensitive text announcement with a
  permalink page and the home banner surface. If a bulletin needs a photo, it is
  probably a post.
