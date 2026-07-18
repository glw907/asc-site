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

**Verdicts (Geoff, 2026-07-17, resumed session):** The non-roles composition is close but not
ratified — Geoff called for another round. Three details settled: (2) duplicate boats **collapse**
to a count (`2 × Buccaneer`), named/numbered boats still break out on their own line; (4) the
"Contact private" marker is **dropped** — a partial member shows no contact block, absence carries
the meaning. Density (3) was not answered directly: Geoff turned it into a design question —
"Does it make sense to have a compact list that expands, given that we're hanging more and more
off an entry?" — reflecting how much the roles/committees model now hangs off each entry. (1) the
different-surname household line is not yet verdicted; it rides into round 2. The filled-chip /
outline-marker roles rendering is now the roles spec's decision 6 and stands regardless.

## Round 2 — compact-expand vs. flat (2026-07-17, Fable-conducted design sitting)

**Launched.** Geoff chose to see a compact-row-that-expands variant beside the current flat list
(both carrying the two settled fixes) before ratifying either, and chose a Fable-conducted sitting
for the design (Opus conducts the pass; the plan's escape hatch fires because a new interaction
model is genuinely novel design work, not a tweak inside the ratified language). The round is an
async probe arc: one probe page, current-flat beside compact-expand candidate(s), real rows, both
themes, 390/1440, for Geoff's async verdict. Probe lives in the session scratchpad
(`directory-probe/round-2/`), never git.

**Verdicts + refinements (Geoff, 2026-07-17, round 2):** COMPOSITION RATIFIED as Compact A —
compact rows that expand to the ratified flat entry on a sage wash. Settled:
- **Compact A** over flat and over variant B (contact reachable at rest).
- **Auto-expand at ≤3 results**: kept (a narrow search lands on the full entry).
- **Phone at rest**: shown as muted tabular text on desktop, a 44px call icon on mobile (the
  most-wanted datum; the muted number forms a calm right-edge column, not clutter).
- **Multi-title indicator**: top-title chip + a quiet "+N" when a member holds more than one
  title (e.g. "Grounds Committee Chair +1"). Plain committee membership stays expand-tier.
- **Secondary datum at rest = boats when present, else city.** City is a weak signal (nearly
  everyone reads "Anchorage"); boats are distinctive and serve the boat-finding job. Named
  boats by name, unnamed collapse by class, first two + "+N" overflow. Class abbreviates on
  narrow screens (Buccaneer 18 → Bucc 18).
- Collapse-duplicate-boats and drop-private-marker carried in from round 1.

**DATA-MODEL DECISIONS (Geoff, 2026-07-17 — several SUPERSEDE the ratified directory spec;
fold into the spec + plan):**
1. **Boats attach to a MEMBER, not a household.** SUPERSEDES directory spec decision 4. A boat
   shows on its owner's entry only. Reason: families with multiple boats — the owner is explicit.
2. **Capture full address going forward**, shown in the expanded view at the **visible** contact
   tier. New data: the schema stores only `city` today (households). Address joins the sensitive
   visible tier (a privacy step past email/phone, decided deliberately).
3. **Boat class is a curated picker**: Buccaneer 18 / Laser / Lido / Other (→ specify model).
   Not free text (the committees curated-list lesson).
4. **Boat name required going forward** (capture requirement; legacy seed rows may stay nameless
   until a member fills them, matching "members correct over time").
5. **Normalize boat class in the seed** — all Buccaneer 18 read alike, all Laser alike.
6. **Seeder attaches boats to owners; Geoff resolves boat→owner ambiguity at import review**
   (dry-run plan is the prompt), same shape as the plan's Geoff-supplied director rows.

**Plan impact (formal spec + plan edits pending Geoff's ledger confirm):** T1 boats table gains
`member_id` FK (drops household_id), class picker + optional model, name; households gain address
fields. T2 seeds per-member boats with class normalization and owner-matching at review. T3/T4
join boats by member; composition is compact-expand + the refinements above. T5 boat capture
requires name + class picker, plus address capture and the extended preview.

**Status: composition CONVERGED pending Geoff's confirm of the full ledger; the data-model
decisions await the same confirm before the spec/plan are rewritten.**

**PAUSED for a roles/committees brainstorm (2026-07-17).** Reviewing the roles slice, Geoff grew
it into a structured roles-and-committees model (per-committee chairs, notable committee
membership, member self-service + admin management, a member-facing committees surface) and called
for a Fable-conducted brainstorm. The directory build (T1+) waits on that model; the composition
above stands. Seed: `docs/2026-07-17-roles-committees-brainstorm-seed.md`. The committee-membership
rendering (filled chip = held position, outline marker = plain membership) is a candidate carried
into the brainstorm, not a settled verdict.
