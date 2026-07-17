# Roles &amp; committees — brainstorm seed (2026-07-17)

> Seed for a **Fable-conducted brainstorm** (Geoff's call, 2026-07-17). The `member-directory`
> pass T0 surfaced that "roles" is really a roles-and-committees domain model, big enough to
> step back and design deliberately rather than absorb inline. This file is the base the
> brainstorm inherits so it does not re-derive; it is not a spec. Run `superpowers:brainstorming`.

## What triggered the pivot

Building the directory composition (round-1 probe, below) needed a roles model. The ratified
directory spec (`docs/2026-07-17-member-directory-design.md`, decision 6) had it as
*admin-maintained free-text titles, many per member*. In review Geoff expanded it, in order:

1. **Committee chairs are per-committee** — "Site Committee Chair" and "Race Committee Chair"
   are distinct titles; there are several committees.
2. **Note when a member is on a committee** — plain membership matters, not only chairing.
3. **Both members and admins manage committee membership** — members self-serve (join/leave a
   committee); appointed positions stay admin-set.
4. **Show committees to members** — a member-facing committees surface (what committees exist,
   who is on them). Geoff: "super helpful."

Together these turn a flat roles list into a structured roles + committees feature area that also
overlaps the queued `admin-nav-reorg` + `admin-roles` pass.

## What is already solid — inherit, do not redo

The **directory composition** is built and largely settled visually, pending Geoff's verdict. It
should survive the brainstorm; only the roles/committees *slice* of it is open.

- Probe: `scratchpad/directory-probe/` (deck `index.html` over live `frame.html`), built from
  **real asc-club rows**, both themes, desktop 1440 + mobile 390, search/chip/empty states.
- Committed: hairline-separated list (de-carded), person-first entries, contained reading width
  (not full-bleed; masthead/rail unborrowed), one smart search across name + boat + role, three
  chips (Board &amp; chairs / Instructors / On a mooring), mooring marked neutrally (never gold),
  mobile as its own composition with 44px tappable contact rows.
- The **roles rendering** is a candidate the brainstorm can keep or change: a held position
  (officer, committee chair, instructor) renders as a filled navy-tint chip; plain committee
  membership renders as a quieter outline marker ("Site Committee"), so "on a committee" reads
  lighter than "Committee Chair" beside it.

## Real-data findings the brainstorm should hold

- **No role or committee data exists anywhere** in the system: `class_instructors` is empty, and
  the cairn auth `editor` table holds only Geoff (owner). The first roles/committees seed is
  Geoff-supplied, not migrated.
- The directory otherwise reads ~161 listed members (124 hidden / 39 partial / 122 visible),
  household names that are usually a person's own name, and messy free-text boat data.
- `asc-club` is fully evolvable (CLAUDE.md): model committees honestly with real migrations,
  never write around a thin schema.

## Seams the outcome reshapes

- **Directory plan** (`docs/plans/2026-07-17-member-directory.md`): T1 (schema — `member_roles`
  as specced is too flat), T5 (member edit surface — now gains member self-service committee
  membership), T6 (admin roles screen — now manages committees + memberships + chairs).
- **The queued `admin-nav-reorg` + `admin-roles` pass** — decide the boundary: does this
  brainstorm's outcome build here as the directory's dependency, or move into that pass?
- **cairn editor roles** — the club_roles collapse (migration 0026) already put editor/admin
  identity on cairn's seam; club committees/positions are a separate, member-scale concept.

## Open questions to explore (not to decide here)

- Committees as a **reference table** (Race, Site, Grounds, Education, …) admins curate, so
  members pick from a list rather than free-typing? (The boat free-text mess argues yes.)
- **Positions vs committee-membership**: one `member_roles` table with a kind, or split appointed
  positions (officer/instructor, admin-only) from committee memberships (member-editable)?
- **Member self-service scope + permissions**: what can a member set on themselves, and does
  joining a committee need any gate (approval, or open)?
- **The member-facing committees surface**: a standalone page, a directory tab/filter, or both?
  What does a committee's own view show (roster, chair, purpose)?
- How it all renders back in the **directory** (chips, per-committee browse, "who's on X").

## The directory pass, meanwhile

T0's composition probe is delivered and awaiting Geoff's visual verdict on the non-roles parts
(entry anatomy, header, mobile). The build (T1+) is paused until this brainstorm settles the
roles/committees model, since T1/T5/T6 all depend on it. Round-1 arc log:
`docs/design-benchmark/member-directory-round-1-arc.md`.
