# Roles and committees: functional design

> Spec for the roles-and-committees model, brainstormed with Geoff and approved
> 2026-07-17 in a Fable-conducted sitting. It supersedes decision 6 of
> `docs/2026-07-17-member-directory-design.md` (flat admin-maintained `member_roles`)
> and reshapes the directory plan's T1, T5, and T6. The seed it grew from is
> `docs/2026-07-17-roles-committees-brainstorm-seed.md`; the directory composition
> ratified in that pass's T0 probe is inherited, not reopened.

## What this is for

The directory needs to render who holds which role. Behind the titles sits real
structure: per-committee chairs, rosters members can see and ask to join, and a
delegation chain where chairs manage their own rosters and the board manages chairs
and the committee list. The bylaws set this shape. Officers are board-elected from
among directors (Article VI). A chair is a member of the committee appointed to lead
it (Article VII, Section 4). Committee members serve at the chair's discretion
(Article VII, Section 1). Practice adds co-chairs (Membership has one today).

## Ratified decisions (Geoff, 2026-07-17)

1. **Committees are a curated reference table.** Members pick from a list; nobody
   free-types a committee name (the boat free-text lesson). Each committee carries a
   name, a description, and a `kind`: `standing` (Finance, Board Development, with
   bylaws-defined authority) or `established` (Fleet, Site, Program, Membership &
   Events, Harbor). Seven committees seed the table.
2. **Chair is a committee membership with a role, and chair titles derive at
   render.** A `committee_members` row carries `chair`, `co-chair`, or `member`.
   "Site Committee Chair" is computed from the chair row and the committee name,
   never stored, so the directory, the portal, and the public page cannot drift.
3. **Positions cover the titles committees cannot derive.** A `member_positions` row
   carries a title and a `kind`: `officer` (Commodore, Vice Commodore, Secretary,
   Treasurer), `director` (a board seat without an office), or `appointed`
   (Instructor, and whatever the board invents). The kind column exists because
   authorization hangs off it: "is a board member" must be a query
   (`kind IN ('officer','director')`), never a title-string match.
4. **Joining is request-then-approve.** A member requests to join a committee; the
   request notifies the chair(s); a chair approves or declines. Chairs add and remove
   plain members of their own committee directly. Board members appoint and remove
   chairs and co-chairs, and create, edit, and archive committees. Leaving is always
   self-serve. The site club-admin can do everything.
5. **Rosters show names.** The roster shows every active member's name, regardless
   of `directory_visibility`, because serving on a committee is a voluntary, visible
   act. Contact info stays governed by the visibility dial everywhere. Pending
   requests render only to the requester and the committee's managers.
6. **Three surfaces.** A portal committees page (purpose, chairs, roster, the join
   action, management affordances by right), the directory rendering already probed
   (filled chip for positions and derived chair titles, outline marker for plain
   membership), and the public `/committees` page's At-a-Glance table fed from live
   data via a directive. The public page's governance prose stays hand-written.
7. **The model builds inside the directory pass.** T1, T5, and T6 grow to carry it;
   the queued `admin-nav-reorg` + `admin-roles` pass absorbs the admin screens later,
   as already planned.
8. **The first seed is the published committees page.** A verified-import script
   reads the At-a-Glance table on `/committees` (officers and chairs by name),
   matches names against `members`, and audits misses. No other role or committee
   data exists anywhere in the system.

## Data model

Three asc-club migrations, forward/rollback/verify, scratch-proven then applied live.

- `committees`: id, slug, name, description, `kind` CHECK (`standing` |
  `established`), sort_order, archived_at, timestamps. Removal archives; an archived
  committee disappears from every member surface but keeps its roster history.
- `committee_members`: id, committee_id (FK), member_id (FK), `role` CHECK (`chair` |
  `co-chair` | `member`) DEFAULT `member`, `status` CHECK (`pending` | `active`)
  DEFAULT `pending`, timestamps, UNIQUE (committee_id, member_id). A member request
  inserts `pending`; chair-add, chair approval, and board appointments write
  `active`. Decline and leave delete the row.
- `member_positions`: id, member_id (FK), `kind` CHECK (`officer` | `director` |
  `appointed`), title TEXT NOT NULL, sort_order, timestamps. Replaces the planned
  `member_roles` table, which is never built.

Standing, listing, and visibility rules come from the directory spec unchanged: the
directory lists current-or-grace, non-archived, non-hidden members. Committee rosters
list active rows whose member is current-or-grace and non-archived; the roster
ignores `directory_visibility` for names (decision 5).

## Permissions

Authorization derives from the model, not from cairn's editor roles. The portal
resolves the logged-in member and evaluates rights per request.

| Actor | Can |
|---|---|
| Any listed member | Request to join a committee; leave a committee; see rosters |
| Chair or co-chair | Approve or decline requests, add and remove plain members, on their own committee |
| Board member (`kind` officer or director) | Appoint and remove chairs and co-chairs; create, edit, and archive committees |
| Site club-admin | Everything above, from the admin screen |

The chair-notification email rides the existing job-runner and email machinery; it is
a plain notification, not an approval token (the chair acts in the portal).

## Surfaces

- **Portal committees page** (`/my-account/committees`): every active committee with
  its description, chair(s), and roster. A member sees a request-to-join button (or
  their pending state) per committee, and a leave action on their own memberships.
  Management affordances render per the permissions table above: a chair sees the
  pending queue and add/remove on their committee; a board member additionally sees
  appoint-chair and the committee create/edit/archive actions.
- **Directory**: as probed in the round-1 composition. Positions and derived chair
  titles render as filled navy-tint chips; plain committee membership renders as the
  quieter outline marker. Search extends to match committee names alongside member
  name, boat name, and title. The three chips stand (Board & chairs, Instructors, On
  a mooring); Board & chairs reads from positions kinds and chair rows, Instructors
  from the appointed "Instructor" title.
- **Public `/committees` page**: the At-a-Glance table renders from live data via a
  content directive (the join-page price-directive pattern), listing officers and
  committee chairs by name. Taking a chair seat or an officer position publishes
  that name on the open web, exactly as the hand-maintained table does today. The
  rest of the page stays authored prose.
- **Profile preview** (directory T5): the "what others see" preview shows positions
  and committee memberships under each visibility state.

## Seeding

Two seeds, both verified-import scripts (dry-run plan, audit trail, verify.sql,
rollback):

1. Committee rows for the seven named committees, kinds per the bylaws, descriptions
   drawn from the committees page's own summaries.
2. People: officers and chairs from the published At-a-Glance table, positions with
   the right kinds. All four officers also hold board seats by construction; a plain
   director row is added for any current director without an office, supplied by
   Geoff at import review. Names match against `members`; misses land in the audit,
   never guessed.

## Out of scope for v1

- Committee terms and annual rollover. The bylaws refresh committees at the annual
  board meeting; election-time updates stay a one-sitting admin task, not schema.
- Deriving Instructor from `class_instructors`. The table is empty; the title is an
  appointed position until class-instructor data is real.
- Meeting minutes, budgets, or any committee workspace. The surface is identity and
  reachability, not committee operations.
- Public rosters. Only chairs and officers appear on the public page; full rosters
  stay behind login.

## Seams and sequencing

- The directory plan's T1 grows to three tables, T5 gains request/leave and the
  extended preview, T6 becomes admin CRUD for committees, memberships, and
  positions, and a new task carries the portal committees page and the public
  directive. The plan file is updated in place; this spec governs.
- The `admin-nav-reorg` + `admin-roles` pass absorbs the admin screens later
  (unchanged seam).
- cairn's editor roles (migration 0026's collapse) stay untouched: site authorship
  and club governance remain separate vocabularies on separate seams.
