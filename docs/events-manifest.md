# The events page mini-manifest: aksailingclub.org/events, exhaustively

The completion pass's events deep-look (Geoff: "look carefully at the events page"). This
re-enumerates the live page directly (`https://aksailingclub.org/events/`, Playwright,
2026-07-06) and cross-checks every feature against its source (`~/Projects/aksailingclub-org`:
`src/lib/events-page.js`, `src/lib/calendar.js`, `src/lib/ics.js`, `src/lib/injection.js`,
`assets/css/custom.css`) and the live `asc-ops` D1 schema (`wrangler d1 execute asc-ops --remote`).
The walk's 8-feature list is the floor; everything below is the ceiling this pass builds against.
Not a redesign brief: cairn's rebuild is licensed to re-skin (the site rebuild fidelity tier is
"quite-close-and-improved," not glance-indistinguishable), but every feature and data field below
is in scope.

## Page shape

A hero (title + lede + calendar-subscribe bar), a calendar TOC (jump links to each populated
section), then the full calendar: month sections (May through September, only the populated
ones), an Off-Season section, and a Meetings & Governance section. Two data sources feed every
section: the `events` table and the `classes` table, unioned (a `classes` row is tagged with the
synthesized category `'class'`, since it carries no `event_type` column of its own).

## 1. Calendar subscribe bar (`.calendar-subscribe`)

Two links, both derived from one base URL:

- **iCal / Apple**: `webcal://<host>/events/calendar.ics` (a `webcal:` URL, which the OS routes to
  the default calendar app).
- **Google Calendar**: `https://www.google.com/calendar/render?cid=<url-encoded webcal URL>`.

Both read the same real `.ics` feed; there is no separate Google-specific export.

## 2. The calendar TOC (`.calendar-toc`)

A row of jump links, one per section that actually has events: `May`, `Jun`, `Jul`, `Aug`, `Sep`
(only the populated months), `Off-Season`, `Meetings`. Each links to `#section-<id>` on the same
page (an anchor scroll, not a client-side filter or a separate route). This is the "filters" the
walk noted: a wayfinding strip, not a query.

## 3. Month sections (`.events-section`, id `section-<month>`)

One section per populated month, May through September, in an alternating gray/white band
rhythm. Each holds one full **event block** per event or class landing in that month (by
`start_date`, or the most recent `date_history` year when `start_date` is unset). A block never
splits across a layout column; the site's own "groups never split" rule (already followed by the
compact Season teaser) applies here too.

### The event block, full detail (`.event-block`)

- **Image or type-colored placeholder.** A real photo (`hero_image`, alt from `hero_image_alt`)
  when the row has one; otherwise a type-colored placeholder panel with a Phosphor glyph (a
  sailboat for `regatta`, a graduation cap for `class`, two linked rings for `work_party`, a
  balloon for `social`; `meeting` rows show no image slot at all, full-detail or compact).
- **Title.**
- **Type badge**, always shown: `Regatta`, `Class`, `Work Party`, `Social Event`, or `Meeting`
  (the exact label map; `event_type` is the raw DB value, the badge text is the human label).
- **Registration-status badge**, shown ONLY when the row's synthesized type is `'class'` (never
  on a real `events` row, even one that carries its own `registration_url`): `Not Scheduled`,
  `Coming Soon`, `Open`, `Full`, or `Closed — Waitlist Open` (the events page's own longer form
  for `closed`, distinct from the ops dashboard's plain `Closed`).
- **Date + location line.** A formatted range (`"May 16"` or `"Jun 12–14"`, never a year, so a
  malformed `end_date` year in the data cannot surface as a visibly broken range) or `"Date TBD"`
  when the row has no current-year `start_date`; a `·` separator plus `location` when present.
- **Short description** (`short_description`): one plain-text sentence, the lede.
- **Long description** (`long_description`): markdown, rendered to HTML (headings, lists, bold,
  links). Absent on some rows; the short description alone is a complete, valid state.
- **Register link** (`registration_url`): an outbound link, `Register →`, shown only when present.
  In the live data this is always a `class` row's link into the MembershipWorks
  `class-registration` embed; a plain `events` row currently never carries one, but the field is
  independent of type and the block renders it wherever it exists.

## 4. Off-Season section (`.compact-list`, id `section-off-season`)

Every event or class whose month falls outside May-September, still sorted chronologically
(carrying the real month number so, e.g., an October event sorts before a November one). Rendered
as **compact items**: no image, but the type badge, date/location line, short and long
description, and register link all still appear (`.compact-item`). Only omitted section-wide if
no event lands outside the season.

## 5. Meetings & Governance section (`.compact-list`, id `section-meetings`)

Every row whose type is `meeting`, pulled out of the month/off-season buckets entirely regardless
of its date (a meeting in June still lands here, not in the June section). Compact items, same as
Off-Season, but with **no type badge** (the section heading itself is the type). Visually
subordinate to the rest of the page (a plain, smaller heading) in the source; still functionally a
full compact item otherwise (date/location, descriptions).

## 6. Empty-state behavior

The live page has no explicit "no events" message anywhere: a month with zero events is simply
absent from both the calendar and its TOC link, and the same holds for Off-Season and Meetings.
There is no visible degrade for the page having zero events at all (an untested state on the live
site; the two tables have never been empty in production). The rebuild's own D1 read already
degrades to an empty list on any read failure without throwing (matching the existing home-page
Season section's safe-failure precedent); this pass adds one small, honest addition the original
lacks: a plain empty-state line when the whole calendar is empty, rather than a silent blank page.

## 7. Calendar-subscribe feed: the real `.ics` file

`GET /events/calendar.ics` returns `Content-Type: text/calendar; charset=utf-8` and
`Content-Disposition: attachment; filename="asc-events.ics"`, built fresh per request from every
`visible = 1` row (both tables) that has a `start_date` (a TBD event is excluded from the feed
entirely, since it has no date to schedule against). One `VEVENT` per row:

```
BEGIN:VEVENT
UID:<slug>@aksailingclub.org
DTSTART;VALUE=DATE:<start, YYYYMMDD>
DTEND;VALUE=DATE:<end + 1 day, YYYYMMDD>       (DTEND is exclusive for an all-day event)
SUMMARY:<title>
DESCRIPTION:<short_description>                 (omitted when absent)
URL:<origin>/events/#<slug>
END:VEVENT
```

Wrapped in a standard `VCALENDAR` header (`PRODID`, `X-WR-CALNAME: Alaska Sailing Club Events`,
`X-WR-TIMEZONE: America/Anchorage`, `X-PUBLISHED-TTL: PT24H`). Verified live: `curl`/Playwright
fetch of the real feed returns exactly this shape with real event data.

## 8. Per-event images

14 of the 22 visible rows (12 events + 5 classes, excluding `annual-meeting` and
`pre-spring-work-party`, which have none, and `fleet-tune-up-weekend`, a class with none) carry a
real `hero_image` filename plus `hero_image_alt` text. The source bytes live in the Hugo repo at
`~/Projects/aksailingclub-org/static/events/images/<hero_image>`, one file per row, matching the
`hero_image` column exactly. This pass pulls all 14 into cairn's media library (content-hashed,
alt text preserved verbatim from the D1 column) the same way Task 3 pulled the home and post
photography.

## 9. Date-history (`date_history`)

A JSON object keyed by year (`"2024"`, `"2025"`, ...), each holding that year's `start_date` (and
sometimes `start_time`/`end_date`/`end_time`). Used only as a fallback for month-bucketing and
sort order when the current year's `start_date` is unset (an event not yet scheduled for this
season still sorts into its usual month by its most recent prior year, e.g. Icebreaker Regatta's
history places it in May even with no current-year date). Never surfaced as display text: the date
format never prints a year, so this field is entirely a sort/bucket input, invisible in the
rendered page. Confirmed present on 11 of 12 `events` rows (absent only on the newest,
`pre-spring-work-party`, added without history).

## Data model, the full row shape (both tables, unioned)

| Field | `events` | `classes` | Notes |
|---|---|---|---|
| `title` | `title` | `name AS title` | |
| `slug` | `slug` | `slug` | anchor id and ICS `UID` |
| `event_type` | `event_type` (NOT NULL) | synthesized `'class'` | `regatta` / `work_party` / `meeting` / `social` / `class` |
| `start_date` / `end_date` | yes | yes | nullable (TBD) |
| `date_history` | yes | yes | JSON, sort/bucket fallback only |
| `location` | yes | yes | free text |
| `short_description` | yes | yes | plain text, one sentence |
| `long_description` | yes | yes | markdown |
| `hero_image` / `hero_image_alt` | yes | yes | filename + alt text |
| `registration_url` | yes | yes | outbound link |
| `registration_status` | — | yes (`class` only) | `not_scheduled` / `upcoming` / `open` / `full` / `closed` |
| `visible` | yes | yes | the public read's only filter |

## What this pass does NOT touch

Event/class administration (create, edit, delete) stays on the existing ops stack
(`ops.aksailingclub.org`), per the design spec's coexistence strategy; this is a read-only public
listing. The `class-schedule` shortcode gap (a separate, not-yet-built widget on `/education`) and
the ops `classes`-has-no-category schema gap are both out of this pass's scope, already recorded
in `docs/events-integration-findings.md`.
