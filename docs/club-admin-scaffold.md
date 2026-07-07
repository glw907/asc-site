# The Club admin scaffold

What this pass built, on the current cairn extension seam, ahead of the real Pass 2.1 build the
design suite specifies. Canonical plan: `~/Projects/cairn-cms/docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md`
(Parts A-2.1, B, and C). Read that spec first; this doc records the structure this pass produced
and the dependency map back to Part C's four engine gaps, corrected where the live code disagreed
with the spec's own phrasing.

## Why a scaffold, not the real pass

Part C's own sequencing note says the four engine gaps (admin field-renderer reuse, the
office-list primitive, admin-scoped server helpers, nav sections) land as a cairn engine pass
*before* Pass 2.1 builds on them. This scaffold does not wait: it builds the Club section on
today's seam (custom `/admin/` routes plus a flat `adminNav`, exactly as
`docs/guides/add-a-custom-admin-screen.md` and `docs/reference/admin-routes.md` describe it in
`@glw907/cairn-cms` as installed), with local stand-ins standing in for the four future engine
seams. Each stand-in carries a comment naming the Part C item it fills and the engine import that
replaces it. The real Pass 2.1 (event/class CRUD, the schema migration, the retired ops routes)
still needs the engine pass and its own execution; this scaffold only proves the section's shape
and wires the one screen (Events) that needed no new engine surface to do for real.

## The route tree

```
src/routes/admin/club/
  events/+page.server.ts   Real read-only load against EVENTS_DB (the events table)
  events/+page.svelte      Office-list-shaped table: date, title, type chip, visibility
  classes/+page.{server.ts,svelte}   Structural placeholder (see "Deliberate scope" below)
  members/+page.{server.ts,svelte}   Structural placeholder
  assets/+page.{server.ts,svelte}    Structural placeholder
  email/+page.{server.ts,svelte}     Structural placeholder
```

Every screen gates with `requireSession` (any signed-in editor), matching the guide's default for
a view every editor should reach; none of these screens are destructive yet, so none call
`requireOwner`. A future pass that adds a destructive Club action (a season rollover, a delete)
should gate that action with `requireOwner` or `adminAction(event, { ownerOnly: true })`.

Each entry carries a sidebar link (`adapter.editor.adminNav` in `src/theme/cairn.config.ts`), one
per screen, in the icon allowlist (`calendar`, `clipboard-list`, `users`, `package`, `inbox`). The
labels are prefixed `Club: ` (`Club: Events`, `Club: Classes`, ...) because `adminNav` is flat
today (see the nav-sections gap below); a real "Club" sidebar group waits for Part C item 4.

## The events screen: what "wired for real" means here

`events/+page.server.ts` reads the live `EVENTS_DB` binding directly (the same D1 the club's
ops stack owns, and the same binding `src/theme/season-data.ts` already reads for the public
Season section). The query selects only the `events` table (not `classes`); on any read failure
it degrades to an empty list with an honest `error` string, the same failure posture
`loadSeasonMonths` already uses for this binding. Verified locally against `wrangler dev` with the
repo's own `e2e/fixtures/events-seed.sql` fixture seeded into the local D1 replica: the three
`events` rows rendered with the correct date, title, type chip, and Visible badge, and the
fixture's one `classes` row did not appear (by design; see below).

## Deliberate scope: classes stay unwired this pass

`EVENTS_DB` already carries a `classes` table, and `season-data.ts` already reads it (unioned with
`events`) for the public Season list. This scaffold could have wired the Classes admin screen for
real with almost no new code. It does not, on purpose: the task scoped "the 2.1 pass's working
proof" to the Events screen alone, leaving Classes (and Members, Assets, Email) as structural
placeholders. The real Pass 2.1 build wires Classes for real, alongside whatever schema migration
it lands (the design suite's Part A calls out a `CHECK` constraint on `event_type` in that same
pass). Building Classes for real here would have blurred that boundary without the plan's own
verification of the migration behind it.

## The `src/admin-club/lib/` layer: local stand-ins for Part C

```
src/admin-club/lib/
  adminAction.ts        Stand-in for Part C item 3 (admin-scoped server helpers)
  fields.ts              Stand-in for Part C item 1 (admin field-renderer reuse)
  fields/SelectField.svelte
  OfficeList.svelte       Stand-in for Part C item 2 (the office-list primitive)
```

Each file carries a header comment naming the exact Part C item and spec quote it fills, and the
engine import that is meant to replace it. There is no stand-in for Part C item 4 (nav sections):
`adminNav` has no grouping seam to stand in for locally, since a flat sidebar with prefixed labels
(`Club: Events`, ...) is the whole workaround available today. That gap is recorded here, not
coded around.

### Item 1: `fields.ts` (admin field-renderer reuse)

The barrel exports exactly one field kind today, `SelectField` (the events screen's type filter),
not the five the spec's Part C item 1 lists (text/date/select/image-picker/markdown). This
scaffold pass has no real create/edit form yet to consume the other four; padding the barrel with
unused stand-ins would be dead code, not a faithful stand-in. Passes 2.2-2.4 grow this file as
their real forms land (a text field for the members search, a date field for a season boundary,
an image-picker for an asset photo), the same way the engine's own field vocabulary would, until
Part C ships `@glw907/cairn-cms/admin-fields` and this whole file's exports get re-pointed there.

### Item 2: `OfficeList.svelte` (the office-list primitive)

Not explicitly named in the task's own file list, but added because Part C item 2 describes
exactly the recipe all five Club screens need (the office header: eyebrow, display-face heading,
subtitle, an optional header action, over a card-shell table), and hand-rolling it five times
would be the "every Club screen hand-rolls it" outcome the spec's own item 2 names as the
alternative to a real primitive. This stand-in only extracts the header-plus-card shell from
`ConceptList.svelte`'s established recipe; it carries no filters, sort, or row actions (Part C's
real primitive is expected to). Each Club screen still writes its own `<table>`.

### Item 3: `adminAction.ts` (admin-scoped server helpers) and a correction to the spec

The stand-in wraps `requireSession`/`requireOwner` plus a typed `audit` emitter. It has no
consumer yet in this scaffold (none of the five screens has a write action), so it is verified by
a direct unit test (`src/tests/admin-action.test.ts`), not by a live route.

One thing this stand-in surfaces worth correcting in Part C's own text before the engine pass
starts: the spec describes the wrapper as "verifies CSRF + editor", implying CSRF is a gap. It is
not. `createAuthGuard()` (wired in every cairn site's `hooks.server.ts`) already validates the
double-submit token for every unsafe POST under `/admin/**`, custom Club routes included, before
any route's own load or action runs (`@glw907/cairn-cms`'s `guard.ts`). A Club action that renders
`<CsrfField />` and posts through the ordinary admin form path is already CSRF-safe with no extra
call. The real remaining gap is narrower than the spec's phrasing: the editor-identity convenience
and a typed audit emit, since cairn has no audit-log hook of its own yet. `adminAction.ts`'s own
header comment carries this correction in full; worth folding into Part C's spec text itself
before the engine pass scopes item 3's real implementation.

### Item 4: nav sections (no stand-in)

`adminNav` (`AdminNavEntry[]`) is flat; there is no grouping key to declare. The five Club entries
render as five ungrouped sidebar links, distinguished only by the `Club: ` label prefix. A real
"Club" section (one collapsible group, five children) waits for Part C's engine change.

## What a future pass should not have to rediscover

- `EVENTS_DB`'s two tables carry no primary key column; `rowid` (SQLite's implicit one) stands in
  for the admin list's row id, matching the same gap `season-data.ts` never needed to solve (it
  groups by month, not by row identity).
- There is no `edited-by` column on either ops table, so the Events screen's row shape is date,
  title, type, visibility, not the full five-column triage table Part B's prose describes. An
  audit trail for this data arrives only once the real admin-owned domain (Pass 2.1's migration,
  or later) gives it one.
- The `$admin-club` SvelteKit alias (`svelte.config.js`, `vitest.config.ts`) resolves
  `src/admin-club/`, mirroring the site's existing `$chassis`/`$theme` convention.
