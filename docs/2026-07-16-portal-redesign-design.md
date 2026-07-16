# Member portal redesign — design spec (2026-07-16)

The portal graduates from vocabulary conformance to a designed member home. Geoff's ruling
from the probe arc (docs/design-benchmark/template-round-1-arc.md holds the verbatim
verdicts): the landing was "better than before, but not by much" after the round-3 first
pass; it is a key page and may carry its own components. The ratified direction is mock D on
the probe page (session scratchpad `portal-directions/portal-directions.html`, the durable
record is this spec): **C's function in A's body**.

## Binding rulings (Geoff, 2026-07-16, all live-session)

- **Dose:** "We want an attractive design, but we also want something that is highly usable,
  with a focus on making it effective for members who are only using it occasionally."
  Governing principle: recognition over recall. Zero-click answers, plain-language
  self-labeling, full dates, one obvious action, no memory-dependent cleverness.
- **Layout:** the desktop version uses real desktop width (not the prose measure; full-bleed
  masthead, working area ~1200-1280px at 1440, rail 320-360px). The mobile design is its own
  composition, not a collapse — and **mobile is co-primary** (phones are a very common access
  point): full usability bar, thumb-reach action placement, 44px targets.
- **Copy:** no em dashes in member-facing UI text. The round-3 "name — detail" asset grammar
  retires for structural label/value slots or middot separation.
- **Color:** fireweed is NOT spent on the routine landing. It is reserved for the
  renewal-season CTA (see States). Money actions in routine states are navy.

## Research grounding (Geoff-licensed; synthesis in the session transcript, devices ranked)

Standing always visible kills the forgot-to-renew lapse (~32% of small-org churn); ONE
weighted next action beats a menu of equals; equal-weight tile walls are the named
anti-pattern (also the phase-1 spec's own enemy); empty states are teachable moments;
a seasonal club's off-season portal job is reassure-and-anticipate.

## The composition (desktop)

1. **The member masthead** (bespoke component, the page signature): a full-bleed band in the
   lightest sage tint. Eyebrow MEMBER HOME; "Welcome back, {firstName}." in the display face;
   the standing sentence in plain words ("You're current through May 17, 2027."); the season
   chip. The standing line lives here permanently — the band is the renewal surface.
2. **The value mirror**: one muted middot-joined line under the band ("This season: mooring
   B-Dock 12 · 2 household members · 1 class credit available"). Derived from household size,
   asset assignments, available class credits. Omit any segment with nothing to say; omit the
   whole line only if every segment is empty.
3. **The working area** (two columns): MAIN — "Needs your attention" (weighted action rows,
   rendered only when real: unpaid fees, waitlist offers, expiring standing) then "Recent
   receipts" (flat rows, long-form dates via the shared formatter, tabular amounts). RAIL
   (subordinate by construction: one type step down, muted eyebrow labels, fainter hairline,
   links only, never a button) — Household / Your gear & moorings (stacked two-line rows:
   name, then detail + chip) / Classes.
4. **The doors**: one quiet dash-marker link row (Profile, Household, Classes, Directory,
   Discord, Events).

## The composition (mobile, its own screen)

Compact masthead (greeting + standing sentence; chip optional) → the one weighted action
directly beneath, STACKED anatomy (label line, then amount + button on their own line —
the probe's three-line wrap is the named defect to avoid; button full thumb width is
acceptable) → full-width reference sections in recognition order: gear & moorings, household,
receipts, doors. Classes rides the doors row (ruled acceptable on the probe). No tiles, no
two-line buttons, no horizontal scrolling anywhere.

## States (all four are first-class; each gets a render check)

- **In-season, needs-you:** as above.
- **In-season, all clear:** the action section renders the warmth moment — burgee mark in
  muted gold, "Nothing needs you. See you at the lake." plus one pointer at what's next
  (upcoming event or class).
- **Off-season** (no live season events; derive from season/event data, not a hardcoded
  date): reassure-and-anticipate — the all-clear moment plus the anticipation line
  ("Class registration opens in mid-March · see the {year} schedule →" — the
  class_registration_opens setting from migration 0018 is the data seam).
- **Renewal season** (standing within ~60 days of expiry, or lapsed): the masthead carries
  the pass's ONE fireweed action ("Renew for {season}"), and the standing sentence states
  the date plainly without alarm color. Lapsed standing keeps the same shape with adjusted
  copy. This is the only fireweed on the page, ever.

## Scope and seams

- Landing (`/my-account/+page.svelte`) rebuilt to this spec; the masthead and rail tiles are
  portal-scoped components (they are licensed one-time features, not sitewide vocabulary —
  do NOT add them to the markdown component registry).
- Child pages (profile, classes, household, directory) keep their round-3 state but pick up:
  the em-dash delimiter retirement, the compact mobile header pattern, and any shared label
  class adjustments. No child-page recomposition this pass.
- Data: standing/formatter seams exist (member-auth/lib). New derivations needed: value
  mirror inputs, off-season detection, renewal-window detection. Any schema want follows the
  asc-club evolvability rule (real migrations); none is expected.
- Auth and session logic untouched. Turnstile paths untouched.

## Acceptance

- Seeded-session render verification of ALL FOUR states, light AND dark, at 390 and 1440
  (the e2e session-seeding pattern; the round-2/portal-directions observers' method).
- Signed-in visual baselines join the e2e suite (extend the admin-login.spec.ts session
  precedent): landing needs-you + all-clear at 390/1440 light, minimum.
- The five-viewport bar for the landing's responsive integrity (320 must not break).
- Review fan-out before push: svelte-reviewer + daisyui-a11y (the page is form-adjacent and
  member-facing); web-auth only if any auth-adjacent file is touched.
- Geoff's before/after: the probe page's mock D is the reference; the built landing reads
  against it (visual-fidelity discipline, fresh-eyes verification, not the builder grading
  itself).
