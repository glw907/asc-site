# Member directory — design probe arc log

In-flight arc log for the `member-directory` pass T0. One line per probe with Geoff's verdict;
distilled into `decisions.md` at settle, then this file is removed (per the STATUS/decisions
convention). The probe pages themselves live in the session scratchpad, not the repo: they render
real member names and household data, which never lands in git (member data is age-encrypted by
policy). Contact fields in the probe are placeholder.

## Round 1 — the composition (2026-07-17, Opus-conducted)

**Probe:** `scratchpad/directory-probe/index.html` (deck) over `frame.html` (the live, interactive
composition). Built from real asc-club rows; both themes; desktop 1440 and mobile 390; plus the
search-active, mooring-chip, board-chip, and empty states. The frame's search and chip filtering
are live so the "one smart search across name + boat + role" decision can be felt, not just seen.

**What the composition commits to (for Geoff to ratify or push):**

- **A hairline-separated list, no card chrome.** The directory is the de-carded direction the
  portal established — quiet rows separated by hairlines, generous vertical rhythm, recognition
  over recall. Not a wall of household cards (the screen it replaces).
- **Contained reading width, not full-bleed.** `max-width: 60rem`, centered. Logged justification
  (the plan requires it for anything not full-bleed-by-default): a directory is a scan-and-read
  task, so it earns a measure that keeps a name + its boats + contact on one legible line, never a
  1280px row that strands a short name against far-right contact. The portal masthead/rail are not
  borrowed; the directory has its own header (back link, title, intro, search, chips, count).
- **Person-first entry anatomy** (spec decision 1): name (display face, the loud element),
  household + city line (muted), role chips, boats (name/class + a neutral "on a mooring" marker),
  contact on the right (desktop) / as tappable rows (mobile).
- **The household line renders only when it carries information.** Solo member → city only (the
  common case, since most household names equal the member's own name). Multi-member → the
  household grouping and size, and never the person's own name back at them (the primary reads
  "Anchorage · household of N"; the others read "{household} household · city · N members"). This
  resolves the real-data redundancy where household names are just a person's name.
- **One smart search + three browse chips** (spec decision 2): search matches name, boat name, and
  role together; chips are Board & chairs, Instructors, On a mooring. Chips are navy outline pills,
  navy fill when active, 44px on mobile.
- **Mooring is a boat attribute, marked neutrally** (spec decision 5) — a small neutral chip "on a
  mooring", never gold (gold stays education/waypoints only per the palette contract).
- **Mobile is its own composition** — contact becomes full-width tappable rows (mailto/tel) with
  44px targets at the foot of each entry; chips wrap; no horizontal scroll; hands off from desktop
  at ~640px.
- **Roles are placeholder** — the one field with no real data anywhere (empty `class_instructors`,
  only Geoff in the auth `editor` table). A stress-range of plausible ASC titles stands in so the
  composition holds whatever the real first-seed titles turn out to be.

**Open questions posed to Geoff:** (1) couples with different surnames — the household line for a
member whose surname differs from the household name; (2) a fleet of near-identical boats (Nancy
Black's three Buccaneers) — per-line vs. collapse-duplicates; (3) density (calm vs. tighter);
(4) the "Contact private" marker wording — keep or drop.

**Verdicts:** _(pending Geoff's review of the non-roles composition — entry anatomy, header, mobile)_

**PAUSED for a roles/committees brainstorm (2026-07-17).** Reviewing the roles slice, Geoff grew
it into a structured roles-and-committees model (per-committee chairs, notable committee
membership, member self-service + admin management, a member-facing committees surface) and called
for a Fable-conducted brainstorm. The directory build (T1+) waits on that model; the composition
above stands. Seed: `docs/2026-07-17-roles-committees-brainstorm-seed.md`. The committee-membership
rendering (filled chip = held position, outline marker = plain membership) is a candidate carried
into the brainstorm, not a settled verdict.
