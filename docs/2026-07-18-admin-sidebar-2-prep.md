# admin-sidebar-2 brainstorm prep

Prep brief for the next session's brainstorm on the admin sidebar (round 2). It distills
the current-state inventory and the cairn `navLayout` seam analysis so the brainstorm
starts from facts. Everything in sections 4 and 5 is an option, not a decision. The
brainstorm decides.

Prior same-day artifacts exist and count as input, not settled law: the ratified functional
spec `docs/2026-07-18-admin-sidebar-2-design.md` and the engine-facing
`docs/2026-07-18-cairn-sidebar-seams-consumer-brief.md`, both written 2026-07-18 beside the
waivers build. The ROADMAP still lists probe-round verdicts as owed (open/closed defaults,
icons, within-group order). Treat this brief as the deliberate re-open of those questions.

## 1. Why this pass exists

Round 1 shipped the split-desk tree on cairn's `navLayout` seam on 2026-07-15. Round 2 is a
brainstorm-first redesign on top of it. Geoff's direction notes (2026-07-18), quoted plainly:

- The current split-desk tree likely has too many groups.
- The sidebar should open with every group collapsed except one, probably the
  common-operations group. Which group stays open is a brainstorm question, not settled.
- Every item gets a unique icon.
- The "Site" group heading is misleading. In ASC usage "Site" means the physical club
  grounds, not the website, so it needs a different name.

## 2. Current-state inventory

Source: `src/theme/cairn.config.ts` (`navLayout`, lines ~45-127). Five declared top-level
groups plus role gating. `roles` on a group or entry gates visibility; `CLUB_ROLES` is
`['owner', 'club-admin']`.

### Custom groups (site-owned entries, drawn from cairn's 9-name Lucide allowlist)

| Group | Entry | Icon | Route |
|---|---|---|---|
| Club (`CLUB_ROLES`) | Overview | anchor | /admin/club |
| | Events | calendar | /admin/club/events |
| | Classes | clipboard-list | /admin/club/classes |
| | Signups | list | /admin/club/signups |
| | Members | users | /admin/club/members |
| | Money | table | /admin/club/money |
| | Committees | users (reused) | /admin/club/committees |
| | Waivers | list (reused) | /admin/club/documents |
| Outreach (`CLUB_ROLES`) | Email | inbox | /admin/club/email |
| | Announce | inbox (reused) | /admin/club/announce |
| Boats & Gear (`CLUB_ROLES`) | Assets | package | /admin/club/assets |
| | Requests | table (reused) | /admin/club/asset-requests |

### Engine-screen groups (cairn-provided, icon fixed by screen id or concept kind)

| Group | Screens (declaration order) | Icon story |
|---|---|---|
| Content | posts, bulletins, pages, fragments, notifications, documents | dated concepts (posts, bulletins) share Newspaper; undated (pages, fragments, notifications, documents) share FileText. Six screens, two glyphs. |
| Site | media, vocabulary, nav, Club settings (site entry, `wrench`, `CLUB_ROLES`), Site settings, editors, help | media Image, vocabulary Tag, nav Signpost, settings gear, editors Users, help HelpCircle. `editors` also collides with the custom `users` glyph. |

Two naming hazards the inventory surfaces. The Content group's `documents` screen (the
signable-document content model) and the Club group's Waivers rollup at
`/admin/club/documents` share the "documents" segment name for different things. The `editors`
engine screen and the custom Members/Committees entries both resolve to the Lucide Users
glyph from different tables.

### Icon uniqueness, current state

Uniqueness is broken in both vocabularies. Four of eight custom entries double up (users,
list, inbox, table each used twice). The six Content screens use two glyphs. Meeting "every
item gets a unique icon" needs work on both the custom side (9-name ceiling) and the
engine-screen side (concept-kind-only icons).

### Roles

Three declared roles: `owner` (capability owner), `club-admin` (capability editor),
`instructor` (capability none). owner sees everything. club-admin sees everything except the
Editors seat-management screen (owner-only). instructor has no reachable admin nav today.

## 3. cairn `navLayout` seam: supported today vs. gaps

Seam lives in cairn-cms `src/lib/sveltekit/admin-nav.ts` with rendering in
`CairnAdminShell.svelte`. Supported today: one-level groups mixing site entries and engine
refs, declared order preserved, `roles` gating on entries and groups, `Capability` gating on
engine screens, a trailing fallback group for unreferenced engine screens, `hidden` to drop a
sidebar door without dropping the route.

Each gap below carries its smallest engine-seam candidate. Flag all five as DX-harvest items
for cairn. The first four already match the consumer brief's four seams; the fifth is an
addition from the engine-code read.

| Gap | Smallest engine-seam candidate |
|---|---|
| No site-declared default-collapsed state. Collapse is a per-user cookie only; a fresh session opens every group. | Add `defaultCollapsed?: boolean` to `NavLayoutSection`, thread into the resolved layout, and seed the shell's collapsed set from it per label when no cookie names that label. The cookie always wins once set. |
| Icon allowlist is 9 names, too small for a ~25-item unique-icon tree. | Widen `ADMIN_NAV_ICON_NAMES` / `ADMIN_NAV_ICONS` to a larger named Lucide set (mechanical, same pattern). |
| Engine-ref icon is fixed per screen id; dated concepts all share one glyph, undated another. No override. | Add `icon?: AdminNavIcon` to `NavLayoutEngineRef`, consumed in `engineEntry` ahead of the dated/fallback bucket lookup. |
| No per-item action-count badge or collapsed-header sum. | New seam: the site supplies per-href counts; the shell renders a pill per item and sums a group's children when collapsed. Zero renders nothing, announced accessibly. |
| Icon reuse is silently legal (`validateNavLayout` checks href uniqueness, not icon uniqueness). | Add a `checkIcon` uniqueness check alongside `checkHref`, folded into the allowlist-widening seam. Makes "every item unique" enforced rather than conventional. |

## 4. Candidate shapes for the brainstorm (options, not decisions)

### Which group opens by default, and how to shrink the group count

The inventory sorts screens by operating cadence:

- Weekly, volunteer-routine: Overview, Signups, Members, Money, Events, Email, Asset Requests.
- Slower operational cadence: Classes, Assets, Announce, Committees, Waivers.
- Rare, configuration-shaped: Club settings, the whole Site group, the whole Content group.

Option A: keep Club whole and open it by default. Simplest, but Club at eight items mixes
weekly screens with occasional ones (Committees, Waivers, arguably Classes).

Option B: carve an "everyday desk" group from the weekly tier (Overview, Signups, Members,
Money, maybe Email) that opens by default, with the rest collapsed. This is what the current
Club / Outreach / Boats & Gear split already gestures at, with Club overloaded.

Lever on the "too many groups" note: retiring or merging low-cadence screens (the spec
retired Signups and re-unified bulletins with notifications) lowers both the group count and
the item count, which also eases the icon-uniqueness math in section 4.3.

### Rename candidates for the "Site" heading

The group holds website configuration: media, vocabulary, nav editor, site settings, editor
seats, help. Names that unambiguously mean the website, with trade-offs:

- "Website": most literal, directly resolves the grounds collision. Slightly broad for a
  config group.
- "Web settings" or "Site config": reads as configuration, narrower. "Site" still appears in
  the second, which keeps a faint echo of the collision.
- "Configuration" or "System": function-first, no grounds overlap. Loses the website cue.
- "Publishing": fits media, vocabulary, and nav, less so editor seats and help.

The same collision check applies to any label using "site" elsewhere in the tree.

### Icon-assignment approach for uniqueness

Reaching a unique icon per item at ~25 items needs more than the current 9 glyphs, so a wider
allowlist is unavoidable if the item count stays high. Two levers combine:

- Reduce item count first (section 4.1's merges), lowering the number of distinct glyphs
  required.
- Widen the cairn allowlist and add the engine-ref icon override (seams 2 and 3), then assign
  each surviving item a distinct glyph. An enforced uniqueness check (seam 5) keeps future
  reuse from regressing silently.

An assignment pass should also break the two cross-vocabulary collisions from section 2
(editors vs. Members/Committees on Users, and the documents naming overlap).

## 5. Open questions for the brainstorm

1. Which single group opens by default, and is it an existing group or a new "everyday desk"?
2. What is the final group count and membership? Which round-1 groups merge or retire?
3. What replaces "Site" as the heading?
4. Does Signups retire and do bulletins and notifications re-unify, as the same-day spec had them?
5. What is the within-group item order for the group that opens by default?
6. Are action-count badges in scope for this pass, or a later one?
7. Sequencing: the cairn engine seams land first, then the ASC tree rides the bump. Does the
   static probe round run before the engine pass to lock open/closed defaults, icons, and order?
8. Should the instructor role gain an admin-nav home, or stay with no reachable sidebar?
