# Events integration: the schema verification and its findings

Plan Task 4 (`2026-07-06-asc-phase-1-build.md`) asks that the D1 events integration verify the
prior migration's schema against the live database (read-only) before wiring the Season section
and `/events`. This is that verification record: what was checked, what it found, and the one
schema gap it surfaces for the phase-2 ops absorption.

## The schema, verified against the live database, not the prior migration's `db/`

The prior migration repo (`~/Projects/aksailingclub-sveltekit`) carries a `db/` directory, but it
holds no schema file at all, only a `backups/.gitkeep`. The real schema lives in the live `asc-ops`
D1 the ops stack (`ops.aksailingclub.org`) owns, introspected directly (`wrangler d1 execute
asc-ops --remote`, and the handbook's own live schema page at `/api/schema`), and cross-checked
against the retiring main-site Worker's own queries
(`~/Projects/aksailingclub-org/src/lib/injection.js`, `events-page.js`, `calendar.js`), which are
the actual, tested, production consumer of this schema.

**`events`**: `title`, `slug`, `event_type` (NOT NULL, freeform TEXT: confirmed live values
`regatta`, `work_party`, `meeting`, `social`), `start_date`/`end_date` (nullable, for a TBD event),
`date_history` (a JSON fallback for a recurring event's prior-year date), `visible`. **`classes`**:
a wholly separate table (`name`, `slug`, `registration_status`, its own `start_date`/`end_date`/
`date_history`, `visible`), with no category column of its own.

## Schema finding: `classes` has no stored category, for the ops absorption

A unified query across both tables (what the Season section and `/events` both need) has no single
stored category to group on: `events.event_type` is real, but a `classes` row carries no
equivalent field, since classes are a distinct entity from events (per the ops stack's own data
model doc, `classes` "are their own top-level records," not `events` rows with
`event_type='class'`). The retiring main-site Worker's own queries already solved this by
synthesizing the tag at the SQL layer (`SELECT ..., 'class' AS event_type FROM classes`), and
`src/theme/season-data.ts` ports that exact pattern rather than inventing a new one. **Recorded for
the phase-2 ops absorption:** a future pass that wants to query "every class or clinic" without a
UNION, or that wants a category finer than the current bucket (a real "clinic" distinction, for
instance, separate from a beginner class), would need `classes` to carry its own category column.
This is ops's schema to extend, not a change this read-only integration can or should make.

## Taxonomy finding: the C7-gold rule resolves to "racing and education stay plain/gold, everything
## else mutes", not literally "work parties and meetings"

Task 3's static stub (`season-2026.ts`, now replaced) carried a doc comment paraphrasing the muted
flag as "a routine, non-racing entry (a work party, a meeting)". Its own data contradicted that
literal reading: `End-of-Season Celebration` (an event_type `social`, not a work party or a
meeting) was already marked `muted: true`, matching the ratified north star's actual rendered
color for that row (`#5C6B72`, the same muted ink as `Annual Meeting`, while `BNAC`, a `regatta`, in
the same off-season group stays full ink `#16222E`). The rule the pixels actually encode is: `dot`
for a class or clinic (mission-first, since the club is an educational 501(c)(3)), plain ink for a
regatta (the other headline activity), and muted for everything else (`work_party`, `meeting`,
`social`), not an enumerated pair. `season-data.ts`'s `categorize()` implements this resolved rule
and the module's own header comment carries the reasoning.

## Data-quality note, observed not fixed

One live `classes` row (`2nd Adult Intro Class`) carries `end_date: '2016-07-12'`, eighteen years
off its `start_date`'s year (`2026-07-09`). This is ops's own data, out of this integration's
read-only mandate to correct. It happens to render correctly regardless: the Season listing's date
format never shows a year (`formatDateRange` in `season-data.ts`), so the malformed year is inert
for display purposes (the day-of-month, `12`, is right either way). Left as an observation for
whoever next edits that class in the ops dashboard.

## MembershipWorks: reintroduced on `class-registration`, the one page in Task 4's own scope

The content-migration findings (Task 2) deferred every MembershipWorks embed to phase 2 as
"coming soon," except: "Task 4's own acceptance criterion (MembershipWorks pages embed as-is) may
reintroduce the embed directly on a page in its own scope (event registration)." `class-registration`
is that page: it is class/event registration, not membership signup or account management (the
surfaces the phase-1 spec explicitly defers), so its coming-soon placeholder is replaced with the
live site's real embed (`{{< mw open="!event-list" >}}` in the old Hugo shortcode), now a
`:::membershipworks{open="!event-list"}` directive (`src/theme/markdown/components.ts`). The
directive's `build()` emits the exact `<script src="https://cdn.membershipworks.com/mfm.js">` plus
`<div id="SFctr" data-org="32205" data-ini="...">` the live site uses, verbatim; component build()
output runs after cairn's sanitize floor (never through it), which is the sanctioned seam for a
trusted third-party embed a page genuinely needs, not a workaround. `join` and `my-account` (real
membership signup and account management) are untouched, staying deferred to phase 2 as Task 2
left them.
