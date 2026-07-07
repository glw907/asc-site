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
2. **Contact + Donate forms are placeholders** — the two conversion paths dead (donate:
   presets + custom + Turnstile; contact: routed message form). Donate also lost its
   hero photo.
3. **The notifications concept does not render** — the home banner strip absent; the
   concept's display path is unwired.
4. **THE LOGO IS WRONG** — an invented navy badge replaces the club's crescent-and-star-
   trail mark, sitewide. Identity item; restore the real mark everywhere.
5. **News feature images missing on the home cards** (posts render them fine — the home
   card image path is the gap); read-times dropped too.
6. **The bulletins concept is missing** — two live URLs 404 with no redirect.
7. **News index lost its wayfinding** — the stats bar and the eight-topic Browse grid.

### Must-fix before "done"
8. Header feature gaps: **site search absent** (/search 404s), the **Donate heart
   shortcut** gone, live's **Members dropdown** flattened to a link.
9. **The packing-checklist table overflows at 390** on visiting-the-club (the one hard
   responsive break; the family standard fails there).
10. **In-page TOCs missing on the longest pages** — spec B1 calls for them; the 18k-px
    bylaws and the new-member guide need them most (breadcrumbs + subtitles dropped on
    governance subpages too).
11. **Legacy /index.xml RSS** needs a redirect to /feed.xml (existing subscribers 404).
12. Facilities renders prose where live has the 9-item amenity list; the Season legend
    dot jams mid-sentence; footer missing Discord + Contact links.

### Sanctions RESOLVED (Geoff, 2026-07-06)
13. The "What do we do?" band: **RESTORE** (with its three icon images).
14. The home hero: **RESTORE** live's photo and treatment. **BROADENED (Geoff): cropping
    was wrong on ALL front-page images** — every home image (hero, fleet, facilities,
    news cards when they land) gets the live site's asset AND crop/focal treatment
    verified individually, not just "a photo loads."
15. Guide/hub heroes: **RESTORE** (the members group photo, the kayak hero, the Discord
    images).
16. Post hero treatment: **KEEP dev's** (contained rounded image — the one sanctioned
    improvement).

### The events deep-look (Geoff: "look carefully at the events page")
The completion pass treats live /events/ as its own mini-manifest: re-enumerate the page
directly and exhaustively (the walk's 8-feature list is the floor, not the ceiling —
filters, badges, statuses, descriptions, locations, register links, calendar-subscribe,
the meetings section, plus anything the walk missed: per-event images? recurring-date
history? empty-state behavior between seasons?) before building the listing.

### Noted, no action
- The pirate post's empty gallery is live's own inherited TODO (parity).
- Live's scroll-reveal breaks headless capture (site quirk, documented for tooling).
