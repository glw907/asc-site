# The original manifest — aksailingclub.org vs the dev build

The doctrine's checklist (2026-07-06, from the three-chunk full-site walkthrough: every
page dev-vs-live, contrast probes clean throughout). Verdict at the site level:
**strong foundation, drastically incomplete against the original's full surface** —
Geoff's "starting design fine / polished beta disaster" calibration confirmed page by
page. Every line below is MATCHED / gap / SANCTION-NEEDED. The completion pass works
this file top to bottom.

## Page verdicts

MATCHED (verified content parity + design applied): /education, /racing, /join,
/governance (+bylaws, +committees content), /official-website, both sampled posts,
all six member guides, both coming-soon member surfaces, the themed 404 (beats live),
redirect coverage, feeds (cleaner than live's).

## The master punch list (ranked)

### Go-live blockers
1. **The events page is a stub** — the entire D1 detail listing unbuilt: month filter
   tabs, category + status badges, per-event descriptions and locations, Register links,
   calendar-subscribe (iCal/Google), the Meetings & Governance section.
   **RESOLVED (2026-07-06, the events deep-look pass): the full detailed listing is built**
   (month sections, Off-Season, Meetings & Governance, type and registration-status
   badges, descriptions, register links, per-event photography, a real `.ics` feed) —
   see the events deep-look section below and `docs/events-manifest.md`.
2. **Contact + Donate forms are placeholders** — the two conversion paths dead (donate:
   presets + custom + Turnstile; contact: routed message form). Donate also lost its
   hero photo.
   **RESOLVED (2026-07-06, the completion pass):** both forms are live, hydrated islands
   (`ContactForm.svelte`, `DonateForm.svelte`) over a plain mailto fallback for a reader
   with no JavaScript. Contact posts through `sendMessage`, routing by category to the
   right volunteer committee (`contact-routing.ts`, ported from the retiring Worker's own
   routing map). Donate offers the four live presets plus a custom amount and an optional
   note, and posts through `createDonationCheckout`, which creates a Stripe Checkout
   Session (`donate-pricing.ts`); its hero photo is restored via the pages concept's own
   `image` field. Both run Turnstile and degrade to a graceful message when their secrets
   aren't provisioned yet.
3. **The notifications concept does not render** — the home banner strip absent; the
   concept's display path is unwired.
   **RESOLVED (2026-07-06):** the home banner strip now reads a pure, unit-tested
   `activeNotification` (`active-notification.ts`), extracted from the page load and
   proven against the concept's own expiry rule (an expired entry is honest silence, not
   a bug).
4. **THE LOGO IS WRONG** — an invented navy badge replaces the club's crescent-and-star-
   trail mark, sitewide. Identity item; restore the real mark everywhere.
   **RESOLVED (2026-07-06):** the club's real logo (aksailingclub.org's own `/img/logo.png`
   and its dark-theme variant) replaces the invented badge in the site header, the only
   place the placeholder mark appeared.
5. **News feature images missing on the home cards** (posts render them fine — the home
   card image path is the gap); read-times dropped too.
   **RESOLVED (2026-07-06):** `post-cards.ts` resolves each shown post's real frontmatter
   hero photo through the media manifest and computes a reading time from its word count;
   the News & Updates cards on the home page show both.
6. **The bulletins concept is missing** — two live URLs 404 with no redirect.
   **RESOLVED (2026-07-06, the completion pass): a real `bulletins` concept**, both live
   bulletins migrated with their exact `/bulletins/<slug>/` URLs (no redirect needed; the
   default day-granularity datePrefix does not strip a month-only id), rendering through
   the same catch-all template as posts and pages.
7. **News index lost its wayfinding** — the stats bar and the eight-topic Browse grid.
   **RESOLVED (2026-07-06): a stats bar** (post count, topic count, year range) **and a
   Browse-by-Topic grid** on `/posts/`, plus a `/tags/[tag]/` destination per topic. Reads
   the site's own five-value curated vocabulary (news/racing/results/education/club), not
   live's now-superseded eight-tag set — the content migration already collapsed the three
   extra tags into `club`, a prior editorial call this pass didn't relitigate.

### Must-fix before "done"
8. Header feature gaps: **site search absent** (/search 404s), the **Donate heart
   shortcut** gone, live's **Members dropdown** flattened to a link.
   **RAISED (Geoff, 2026-07-06): search must be TOP NOTCH** — the family Pagefind pattern
   (ecxc's implementation is the precedent) with a fast keyboard-first overlay, quality
   result grouping, and the five-viewport composure; a search that feels like the site's
   own feature, not a bolt-on.
   **RESOLVED (2026-07-06):** `SearchModal.svelte` (ecxc's own Pagefind component, family
   pattern) is wired into the header, opened by its trigger or Cmd/Ctrl+K, deploying
   through the existing `build:search`/`pagefind` step. The Donate heart (the live site's
   own Phosphor icon path) sits beside it. The Members entry keeps its own link plus a
   caret that opens its seven live sub-links as a DaisyUI v5 popover dropdown on desktop
   (`popovertarget`/`anchor-name`, the EditorToolbar recipe) and inlines them under the
   parent link in the mobile drawer.
9. **The packing-checklist table overflows at 390** on visiting-the-club (the one hard
   responsive break; the family standard fails there).
   **RESOLVED (2026-07-06):** the engine's own default table-scroll wrap (0.81.0) already
   sandboxed the table's internal overflow; the actual break was `.site-main` (a flex item
   in the layout's column flex) lacking the explicit `width: 100%; min-width: 0` the
   chassis's own `.cairn-site-main` documents as the real fix for a wide descendant
   blowing out a flex-item ancestor. Verified at 390 with Playwright: the packing table's
   own scroll region now stays inside the viewport.
10. **In-page TOCs missing on the longest pages** — spec B1 calls for them; the 18k-px
    bylaws and the new-member guide need them most (breadcrumbs + subtitles dropped on
    governance subpages too).
    **RESOLVED (2026-07-06):** the catch-all template extracts a collapsible table of
    contents from any entry with eight or more h2/h3 headings (a density gate, not a
    slug list, so it generalizes past the two named pages to every long reference
    document), the astropaper-theme's own family pattern. Governance subpages (derived
    from `redirects.ts`'s own `governance/*` keys, so the set can't drift from the
    redirect map) restore their "back to Governance" link and a `description`
    frontmatter field renders as the subtitle under the title.
11. **Legacy /index.xml RSS** needs a redirect to /feed.xml (existing subscribers 404).
    **RESOLVED (2026-07-06):** added to `redirects.ts`; prerenders as a real redirect
    page, verified in the build output.
12. Facilities renders prose where live has the 9-item amenity list; the Season legend
    dot jams mid-sentence; footer missing Discord + Contact links.
    **RESOLVED (2026-07-06):** the home page's facilities section restores the live
    9-item list; the Season legend now reads as one sentence ("...the gold dot marks
    classes and clinics"); the footer adds Discord and Contact, in the live footer menu's
    own weight order.

### Sanctions RESOLVED (Geoff, 2026-07-06)
13. The "What do we do?" band: **RESTORE, IMPROVED (Geoff, 2026-07-06): the live icons
    "suck" — the band returns with PHOTOS instead — GEOFF SUPPLIES THE PHOTOS;
    the build ships three clearly-labeled photo PLACEHOLDERS** (proper aspect frames,
    "photo coming" treatment, alt-text slots ready) so he drops the real shots in via
    the media library. The band's structure and copy restore from live; icons->photo-
    placeholders is the sanctioned change.
    **SHIPPED (2026-07-06):** the band restores between News & updates and The Season
    (live's own position), heading and copy verbatim, three dashed-frame placeholder
    tiles (a "photo coming" glyph plus the intended alt text) in place of `icon-learn`/
    `icon-race`/`icon-relax`. Geoff wires the real photos through the media library later.
14. The home hero: **RESTORE** live's photo and treatment. **BROADENED (Geoff): cropping
    was wrong on ALL front-page images** — every home image (hero, fleet, facilities,
    news cards when they land) gets the live site's asset AND crop/focal treatment
    verified individually, not just "a photo loads."
    **SHIPPED (2026-07-06):** the hero now resolves to live's own `site-header-4x3.jpeg`
    (already in the library as `site-header-big-lake`), replacing the wrong sunset photo
    the theme build had picked; fleet and facilities were individually checked against
    their own real club photography and left as-is. News-card images are item 5's own
    scope, tracked separately.
15. Guide/hub heroes: **RESTORE** (the members group photo, the kayak hero, the Discord
    images).
    **SHIPPED (2026-07-06):** the members hub's group photo, the new member guide's
    orientation photo (the canopied paddle boat, live's `getting-started-hero.jpg`), and
    the Discord server's mascot and Boson Bot images, all pulled from live into the media
    library (local + remote R2, committed manifest).
16. Post hero treatment: **KEEP dev's** (contained rounded image — the one sanctioned
    improvement).

### The events deep-look (Geoff: "look carefully at the events page")
**USER-VALIDATED LAYOUT (Geoff, 2026-07-06): ASC users enjoy the CURRENT live events
page's layout — the new page preserves its SHAPE (the month filter tabs, the
category/status badge placement, per-event description blocks with register links, the
calendar-subscribe block, the meetings section's position) and re-expresses only the
SKIN in the north-star design language (the club-grounds colors, the type, the band
rhythm). Layout similarity to live is a grading criterion, not a suggestion: the
verifier compares the new page's structure against live's side by side.**
The completion pass treats live /events/ as its own mini-manifest: re-enumerate the page
directly and exhaustively (the walk's 8-feature list is the floor, not the ceiling —
filters, badges, statuses, descriptions, locations, register links, calendar-subscribe,
the meetings section, plus anything the walk missed: per-event images? recurring-date
history? empty-state behavior between seasons?) before building the listing.

**DONE (2026-07-06):** `docs/events-manifest.md` is that re-enumeration (live page walked
with Playwright, cross-checked against the legacy Worker's own source and the live
`asc-ops` schema). The full listing is built against it: month sections, Off-Season, and
Meetings & Governance (a meeting pulled out by type regardless of date), the type and
registration-status badges, descriptions (short plain text, long markdown), register
links, a type-colored placeholder glyph or a real photo (14 event/class images migrated
into the media library), a real `/events/calendar.ics` feed (iCal/Apple and Google
Calendar both read it), and one added empty-state line the live page itself never had.
`$theme/events-data.ts` and `$theme/ics.ts`, unit-tested; `EventsListing.svelte` and
`EventCard.svelte`.

### Noted, no action
- The pirate post's empty gallery is live's own inherited TODO (parity).
- Live's scroll-reveal breaks headless capture (site quirk, documented for tooling).
