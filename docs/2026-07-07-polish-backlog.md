# Polish backlog (beta → 1.0)

Assembled 2026-07-07 from the day's own findings, the parity audit, the requirements
review, and the design-panel triage. Each item is small-to-medium, well-scoped, and
independent, so it executes in any order. Ranked within each group by leverage. Anything
not done today Geoff tackles on Opus tomorrow; hand this file to that session.

## Geoff's design calls (from the gestalt panel — decisions, not tasks I execute alone)

- **Repalette the accent off the photography?** The panel reads the fireweed-magenta CTA as
  generic consumer-SaaS, not Alaska-sailing; it suggests a lake-blue / hull-orange / muted-green
  accent pulled from the club's own photos. This is a real identity choice (and the north star
  chose the magenta), so it's yours to rule, not mine to swap. If yes: a token change +
  contrast recheck, low-medium effort.
- **Education's genre.** The panel says the docs-style sticky-TOC frame makes the club's flagship
  persuasion page (get a parent to register a kid) read like a software help center. Options: keep
  the sidebar for the reference tables lower down but let the top of the page breathe as a normal
  page; or drop the docs frame entirely. A genre decision, yours.
- **Let the photography breathe** (needs your photos): the hero + the What-do-we-do trio boxed
  small caps every page's ceiling; larger, ideally full-bleed-within-column crops. The facilities
  block is the panel's cited template for how the rest should look.

## From the gestalt panel (polish-tier, executable)

- **The "Welcome to the New Website" news thumbnail** (the green Matrix-code image) reads as
  broken/AI and clashes with the real photography — replace with a real photo or a clean graphic.
- **Education visual pacing**: a photo every 2-3 sections + a type distinction between the ~20%
  that matters to a first-time parent (tracks, pricing, how-to-register) and the reference detail
  (refund policy, wishlist), so the page stops reading as one flat manual.

## Design / front-end (feeds the design-panel round; some may already be in-flight)

- **Photos Geoff supplies** (blocking only visual completeness, not function): the three
  What-do-we-do Learn/Race/Relax tiles (currently sanctioned "photo coming"); a PORTRAIT
  facilities photo (the slot force-crops a landscape today, `data-crop` marks it
  deliberate); any hero the panel flags as under-using the club's photo archive.
- **The image-orientation pass** sitewide: apply the orientation rule (landscape/square/
  portrait per slot; docs/2026-07-06-asc-phase-1-design.md) to every image slot, with a
  photo-request list where the library lacks a fitting asset.
- **The rest-of-site craft pass**: once home + education pass Geoff's read, apply the same
  treatment (type scale already sitewide; section rhythm, hero presence, panel system) to
  racing, join, governance, visiting-the-club, the storage pages, the member guides.
- **Section-panel measure**: education's panels narrow the reading measure to ~50ch (the
  boxed-panel-plus-sidebar cost); revisit padding/gutter to reclaim toward 60-65ch if the
  panel round wants it.
- **Design-panel survivors**: whatever the three-lens panel + refuter confirm on home +
  education that isn't fixed in today's wave.
- **404 / error pages, empty states**: audit every empty/error surface for the club-grounds
  voice + treatment (the events empty-state, a signed-out portal deep link, a 500).
- **Dark mode**: the theme carries a full dark system but it's unaudited against the new
  type scale, panels, and heroes; a dark-mode read pass.
- **Five-viewport CI baselines**: regenerate + confirm the width-matrix baselines after the
  wave settles (the portal + panel pages are new to the suite).

## The tool / functionality (from the parity audit + requirements review)

- **Discord notifications** (parity GAP): the committee loses real-time visibility ops had
  — wire payment-request-sent and waitlist events to the Discord webhooks (they exist:
  DISCORD_WEBHOOK_ASSETS/CLASSES on the ops worker; the estate doc lists them).
- **Boson Bot cutover** (a silent trap): the Discord announce bot watches the OLD site's
  feed; repoint it to the new feed.xml at cutover or new-post announcements stop.
- **Asset-type fee editing** (parity GAP): no writer exists; add an owner-only settings
  action (mirrors tier prices).
- **Class-waitlist manual reorder + waitlist admin notes** (parity GAP): ops had both;
  the asset side kept move-to-end, the class side has neither.
- **Post-create assignment note editing** (minor parity GAP).
- **The cancellation/refund voucher type** (requirements review): the education page
  publishes a carry-to-next-year voucher on in-window cancellation; a distinct credit-grant
  source tag + the deadline math (rides the payment/refund build).
- **Boat qualifications** (requirements review): class completion "checks you out" on the
  boats sailed — a per-member qualification record; a natural post-2.2 portal surface.
- **Race registration** (requirements review): member/non-member differential pricing +
  registration deadlines (the NOR bulletin's own promise); the per-event pages are its home.
- **The support / reimbursement / IT-request forms** (2.3): category routing + receipt
  upload, per the Issues & Support page's own promises.
- **Email-preferences opt-out surface** (the symmetry rule's inverse of bulk sends).

## Correctness / hygiene (fast wins)

- **Migration renumbering**: the four parallel worktrees collided on numbers (0011/0014/…);
  after the merge, confirm the sequence is clean and contiguous on main.
- **The email sends promoted to templates**: the portal capstone used `raw` unstored
  content for its admin-notify sends to sidestep a collision; promote them to editable
  `email_templates` rows now that the editor exists.
- **The directory-listing-confirm nudge**: the portal deferred it for lack of a dismissal
  column; add the column + the dismissible nudge.
- **Turnstile**: provision the widget + secret (I can do this via the CF API) so the public
  forms gate spam rather than degrading open.
- **CONTACT_EMAIL / sender onboarding**: confirm the EMAIL sender domain is onboarded for
  all the new transactional sends (the durable Cloudflare-email gotcha).
- **The `/images` 410-rationale refresh**: the parity audit found the ops `/images` route
  has no live consumer anymore; document before a later retirement wave.

## Human / cutover checklist (Geoff's, not code)

- Stripe: swap sandbox → live keys at real cutover (never before).
- The magic-link smoke clicks (member + admin sign-in from Geoff's inbox).
- The ops events/classes 410 flip (parity audit says GO; Geoff's word).
- The apex DNS cutover (aksailingclub.org → asc-site) after the before/after review.
- MembershipWorks subscription cancel (after 2.4, the last ops domain).
