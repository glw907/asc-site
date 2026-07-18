# Member directory: functional design

> Spec for the `member-directory` initiative (ROADMAP). Brainstormed interactively with
> Geoff and approved 2026-07-17 in the combined directory + waivers sitting. This is the
> functional contract; the visual design pass and the build pass follow separately, in
> that order, per the pre-cutover pass sequence. The waivers spec from the same sitting
> is `docs/2026-07-17-member-waivers-design.md`.

## Revisions (Geoff, 2026-07-17, directory T0 design pass)

The T0 design pass ratified the visual composition and revised several decisions below. This
block governs where it conflicts with the original text; the arc log
(`docs/design-benchmark/member-directory-round-1-arc.md`) carries the reasoning, the plan
(`docs/plans/2026-07-17-member-directory.md`) the task-level shape.

- **Composition: compact-expand (Compact A).** A compact row per member that expands to the
  full person-first entry, not an always-inline list. Resting row: name; a filled top-title
  chip with a "+N" for multiple titles; a boats-else-city secondary (the model abbreviating to
  "Bucc 18" on narrow screens); and, for a visible member, the phone (muted text on desktop, a
  call icon on mobile) beside an email icon. A search or chip narrowing to ≤3 auto-expands.
- **Boats attach to a MEMBER, not a household** — SUPERSEDES decision 4. A boat shows on its
  owner's entry; families with several boats get per-owner clarity.
- **Boat capture is structured**: name REQUIRED going forward; a single `model` from a fixed
  picker (Buccaneer 18 / Laser / Other, where Other means typing the real model), stored as the
  resolved string (migration 0028 collapsed the old class-plus-conditional-model pair into one
  required `model`). The seed normalizes the model so like boats read alike and attaches boats
  to owners, with Geoff resolving initial ambiguity at import review.
- **Full address seeded and captured going forward**, on the household ("a group of people under
  one roof"), seeded from the MembershipWorks export (plan T2c) and shown in the expanded view
  at the **visible** contact tier — it rides the existing
  visibility dial (decision 7 stands: no new switch), joining email and phone as sensitive-tier
  fields.

## What the directory is for

The number-one member-requested feature: find people, boats, and roles inside the club,
and reach a member who has chosen to be reachable. It is a members-only surface behind
login at `/my-account/directory`, replacing the household-card screen that ships today.
The v1 job covers all four lookups Geoff ratified: people and their contact info, club
roles ("who do I ask about racing"), boats ("whose boat is Dionysus"), and whether a
boat lives on a mooring or a trailer.

## Ratified decisions (Geoff, 2026-07-17)

1. **Person-first entries.** One entry per listed member: name, household and city, role
   titles, the household's boats, and contact per visibility. Household reads as a line
   on the entry, not as the organizing card.
2. **One screen, one smart search (approach A).** A single route with one search box
   that matches across member name, boat name, and role title, plus a short chip row
   for browsing (Board & chairs, Instructors, On a mooring). Entries render fully
   inline. No detail pages at club scale (~210 members).
3. **Boats are member-entered, seeded.** New structured boat records that members add
   and edit themselves. The import seeds obvious ones from asset-assignment free text
   where parseable; members correct and fill in the rest over time.
4. **Boats hang off the household**, matching how the club holds boats and how
   assignments work. A boat shows on each listed member of its household.
5. **Mooring visibility is a boat attribute, not a holdings section.** Each boat carries
   `kept_on` ('trailer' or 'mooring', defaulting to trailer since most boats are
   trailered). Moorings are unnumbered and unlabeled, so there is no slot identity to
   show and the directory never reads ops assignment data. "Find moorings" means
   "which boats are on moorings".
6. **Roles are admin-maintained, many per member, with specific titles.** A structured
   roles table edited in the club admin: "Race Committee Chair", not a generic
   "Committee chair". A member can hold several roles at once.
7. **One privacy dial, extended.** The existing three-state `directory_visibility`
   keeps its values and gains meaning: hidden removes the entry entirely; partial (the
   default) shows name, household, roles, and boats but no contact info; visible adds
   email and phone. Contact info stays the only sensitive tier. No new switches.
8. **Listed while current or in grace.** Members in good standing plus those inside the
   renewal grace window stay listed; drop at lapse. This matches the MW behavior
   members know and keeps the directory honest as a current-members surface.

## Data model

All changes are asc-club migrations; the schema is fully evolvable (CLAUDE.md).

- `boats`: id, household_id, name, class or model, sail number (optional), `kept_on`
  ('trailer' | 'mooring', default 'trailer'), timestamps. Created and edited from the
  household screen (primary) and the member profile, with the same override precedence
  as visibility today. Seeded at build time from assignment free text where a boat is
  recognizably described; the seeder is a verified-import script (dry-run plan, audit
  trail, rollback) like every other member-data import.
- `member_roles`: id, member_id, title (free text, specific), sort order, timestamps.
  Maintained through a small club-admin screen. This is a deliberate down-payment on
  the queued `admin-nav-reorg` + `admin-roles` pass; the build keeps the screen minimal
  and the later pass absorbs it into the reorganized admin.
- `members.directory_visibility` is unchanged in schema. The directory query extends
  from "not archived, not hidden" to also require current-or-grace membership standing,
  joining whatever standing representation the renewal machinery carries. If grace
  needs an explicit setting, that is a settings row, not a schema workaround.
- No photo or avatar fields. Out of scope for v1.

## The finding experience

One screen. The search box filters as you type and matches name, boat name, and role
title together, so every ratified use case resolves by typing one thing. The chip row
covers the browse cases that are not name-shaped: Board & chairs, Instructors, On a
mooring. An entry shows name, household and city, role titles, boats (name, class,
kept-on), and, for visible members, email and phone.

Composition rules carried in from the portal redesign rulings (decisions.md is
canonical): recognition over recall, so one obvious thing to do on arrival; mobile is
its own composition with thumb-reach actions and 44px targets, verified at
320/390/768/1440; the portal masthead and rail are portal-licensed components and are
not borrowed, so the directory earns its own composition; full-bleed must be justified,
never assumed. The design pass runs the probe-iteration process, and probes are
grounded in real rows and both themes before ratification, per the standing STATUS
ruling from the portal pass.

## Member-facing edit surface

Boat add and edit joins the household screen and the profile screen beside the existing
visibility control. The profile's "what others see" preview extends to show roles and
boats under each visibility state, so the choice stays legible to an occasional user.

## Out of scope for v1

- Photos and avatars.
- Mooring identity or a browse-by-mooring view (moorings are unlabeled).
- The boat-first Fleet view. Logged as a natural later design round once member-entered
  boat coverage has grown; a fleet view over a handful of seeded boats would launch
  thin.
- Any public (logged-out) exposure. The privacy model presumes members-only.

## Seams and sequencing

- The roles admin screen precedes the `admin-nav-reorg` + `admin-roles` pass; that pass
  absorbs it rather than this one waiting for it.
- Directory drop-off depends on membership standing from the `unified-signup`
  machinery; the grace window is that system's definition, not a directory-local clock.
- The waivers initiative gates mooring fees on signatures but shares no schema with the
  directory beyond members and households.
