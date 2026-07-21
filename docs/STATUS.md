# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**THE MEMBERS PASS IS BUILT, COHERENCE-PASSED, AND LIVE ON DEV; GEOFF'S BEFORE/AFTER
AND THE TOOLKIT PROBE VERDICTS ARE THE OPEN GATES (2026-07-20, Fable-conducted on
Geoff's workflow opt-in "push all the way to release": workflow wf_4225bb28-e0f, 18
agents 0 errors, + a coherence fix round; site commits d1f5a0d..a9a2c8d; cairn 0.88.3
published).** What shipped:

- **The standing vocabulary is live end to end**: Current / Overdue / Former via the
  single classifier (`standing.ts`; Former RECORDED in `households.former_at` +
  `former_source`, never re-derived; payment clears it; the daily reminder sweep marks
  it at boundary+30 covering the unsent-touch/dormant case; the household desk has the
  audited manual set/clear, both directions, with reason). **Migration 0033 applied
  LIVE and verified: 149 households → 86 current / 3 overdue / 58 former / 2 none.**
  Grace and "renewal candidates" retired from src; the inert `renewal_grace_days`
  settings row was deliberately left (data staleness, not schema debt). The pre-apply
  review gate caught a real refund-filter divergence in the sweep (fixed 95c1042; every
  standing grounding now shares `AND refunded_at IS NULL`).
- **cairn 0.88.3** (patch, re-derived at the cut): the blessed daisy safelist as a
  documented source file (`admin-css-safelist.ts`) with a build test; ASC picked it up
  in-range (dc2360d).
- **The toolkit is born, general-contract** (`src/admin-club/toolkit/`): format.ts
  (money/civil-date/Anchorage-timestamp/age + `itemNoun`), StatusChip, Pagination,
  AdminTable, ExpandableRow, ListToolbar — contracts, daisy class inventories, and
  survey citations in the toolkit README; probe pages committed under
  docs/design-benchmark/probes/2026-07-20-members-toolkit/. **GEOFF'S PROBE VERDICTS
  OWED** (open probe items ride along: StatusChip palette mapping, the never-paid
  `'none'` display copy, the near-black search focus ring).
- **The screen** (spec executed): search-first household rows (autofocus, any-member
  match highlighted), expand-in-place panel (contacts, members with ages, holdings and
  enrollments with paid state, exactly Open household / Email household / Add member),
  default scope Current+Overdue, promoted filters standing/holdings/role/class
  (current-season), compact zebra rows, join pagination — verified against the
  live-data replica harness.
- **Coherence gate**: first fresh-context read FAIL (8 tells, headlined by the 390
  panel-in-scroll blocker), fix round 8bacfac (all 8 + the a11y reviewer's 4 warnings;
  root causes: same-route view-transitions leak ghost rows, and `bg-warning/15`/
  `text-warning` NEVER COMPILED in cairn-admin.css so the Overdue chip rendered as
  plain text with all gates green), then an Opus cold re-read **PASS "designed, not
  assembled"** — its one new tell ("1 households") fixed a9a2c8d (`itemLabel` is now an
  `{ one, many }` pair through `itemNoun`). Full verdicts in the ledger.
- **Gates**: check 0/0, 2015 tests, build; reviewers pass (auth-security, svelte,
  daisy-a11y); design-probe clean for this pass (5 pre-existing site findings traced
  and left); CI-canonical baselines regenerated via the ci.yml dispatch (bb56783, log
  read); all deploys green.
- **Records**: brainstorm rulings distilled into decisions.md (ef5c43a); the harvest
  note docs/2026-07-20-members-pass-harvest-findings.md carries the subpath-export,
  wave-by-graduation, and cairn-dogfoods rulings, the daisy absorption ritual, and 9
  build findings (biggest: the silent non-compiling-class failure mode wants a cairn
  detection gate); cairn's ROADMAP carries the queued toolkit-organization pass
  (ff0d3f34). No component graduates to cairn yet — the next screen pass is each
  component's second consumer.
- **Budgets**: ~3.4M subagent tokens (workflow 2.72M, fix round 0.36M, Opus re-read
  0.14M); conductor questions to Geoff: 0 (one coordination note he answered). One
  unintended Fable-priced agent: the workflow's first coherence read (the Opus repin
  missed because the default workflow subagent stamps its own agentType — watcher
  fingerprint lesson recorded here).
- **ON GEOFF'S QUEUE**: the Members before/after on dev (/admin/club/members — the
  search-first screen, an expanded panel, the 390 view) and the toolkit probe pages
  above.
- **NEXT PASS**: the second admin-screen pass — Classes or Assets, Geoff picks —
  opening with its own functional brainstorm. Resume prompt: "Start the next
  admin-screen pass: read ROADMAP's admin-screen-passes entry, docs/STATUS.md, and the
  Classes and Assets stops in docs/2026-07-20-admin-toolkit-catalog.md, then open the
  functional brainstorm with Geoff (superpowers:brainstorming) — first question: Classes
  or Assets." Launch fresh from ~/Projects/aksailingclub-org. Conductor seat is Geoff's
  call at session start (79% weekly spent as of this close; design brainstorms are
  Fable-priority in-window, Opus is the fallback).

**PASS B `asc-sidebar-build` IS BUILD-COMPLETE AND SHIPPED TO DEV; GEOFF'S WALKTHROUGH
IS THE OPEN GATE (2026-07-19, Fable-conducted: T1 probe round settled in-session, 5
Sonnet implementer dispatches + simplifier + 2 reviewers + a fresh-context coherence
read, commits 68a656f..1fe85db + the CI baseline-regen commit).** What shipped:

- **The ratified four-group tree** (Club, Events & Classes, Communication, Website) with
  the T1-probe verdicts: 25 distinct glyphs (Fragments keeps engine `layers`; overrides
  bell/key-round/file-pen), Club order with Money sixth, Help UNREFERENCED so it lives
  in the engine's fallback foot ("foot is perfect"), role-dependent open defaults via
  `navFilter` (`src/theme/nav-defaults.ts`: Admin/CM open Club+Communication; Publisher
  Communication; Webmaster Communication+Website). All verdicts distilled into
  docs/design-benchmark/decisions.md ("Admin sidebar round 2").
- **Every `roles:` nav gate deleted** — visibility derives from the access map alone.
  **The Webmaster widening (Geoff-ruled 2026-07-19)**: Webmaster gained the whole
  Communication group (posts/bulletins/Email/Announce, sends included) in access.ts,
  the matrix drift-guard, and the design doc's matrix. The Email-class-members deep
  link spills to Publisher/Webmaster (a collapsed one-door E&C group) — ruled KEEP.
- **Retirements**: Signups screen fully gone (route/store/tests/strip card; DB rows
  kept); `notifications` concept retired — bulletins re-unified to production's shape
  (detail + expires fields; home banner reads latest unexpired bulletin).
- **New surfaces**: the cross-class Class waitlist screen (/admin/club/classes/waitlist,
  read-only, `listOutstandingOffers`); compose deep link ?segment=class (sentinel
  preselects first class segment; two-step server re-resolve untouched).
- **Attention badges** on the three ruled queues (asset requests, committees, class
  waitlist) via the 0.88 `attention` dep; the Overview strip reads the SAME
  `$theme/admin-attention.ts` counts (never-disagree test). Strip restyled with scoped
  CSS: the daisy stats classes NEVER existed in cairn-admin.css (harvest finding 5).
- **Gates**: security reviewer CLEAN (enforcement verified map-based with nav gates
  gone; counts provably role-filtered; two Low invariant notes, one now a comment);
  svelte-reviewer CLEAN (5 minor notes); coherence read PASS "designed, not assembled"
  (ledger entry; 2 engine-chrome nits harvested). check 0/0, 1900 tests, build green.
- **DX harvest**: docs/2026-07-19-sidebar-build-harvest-findings.md — 7 cairn findings
  (Help-foot idiom docs, navFilter collapsed-rewrite blessing, dangling-href gap,
  icon-name testability, the admin-CSS class-inventory gap (major), shell collapsed-
  group spacing, "New Posts" plural copy).
- **ON GEOFF'S QUEUE: the pass-B walkthrough on dev** — per role (Administrator sees
  Club+Communication open with badge pills; Publisher/Webmaster the reduced trees),
  the two new class surfaces, one Bulletins, no Signups, Help in the foot. Two
  ratified-but-flagged nits to eyeball: Members/Committees glyph twinning at 16px,
  "Announce" the lone verb (both stand unless reopened).
- **NEXT PASS: `events-redesign`** (ROADMAP: from-scratch events page, its own
  template). OPENS WITH A FUNCTIONAL BRAINSTORM with Geoff (what the page must do for
  members and visitors) before any visual work; probe-iteration process governs; the
  current page's timeline/chips/season machinery is requirements evidence, not a design
  to preserve. Resume prompt: "Start the events-redesign pass: read ROADMAP.md's
  events-redesign entry and docs/STATUS.md, then open the functional brainstorm with
  Geoff (superpowers:brainstorming) before any visual work." Launch fresh from
  ~/Projects/aksailingclub-org.

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):**
the attorney packet send (docs/waivers/, all DRAFTs; the sitting's full entry is in
the archive — sources verified live, register/fact gates run, board-packet.md carries
the Borough records-request path);
the waivers signing-moment before/after (dev renders the no-docs state; the moment is
visible in the CI-minted baselines and locally via the e2e fixtures — full build entry
in the archive);
member-directory before/afters (/my-account/directory, /my-account/committees, edit
surfaces, public /committees); portal redesign before/after against mock D (PR #1,
merge 510b266); the payments live smoke (docs/plans/2026-07-15-payments-live-smoke.md);
the five-stop dev walkthrough; the 07-15 apology-send verification; the fragments
/members before/after and the unfiled fragments harvest
(docs/2026-07-17-fragments-harvest-findings.md); the directory pass's DX-harvest notes
(shared portal section primitive, --container-measure-list token — in the archive
entry);
the board-demo cleanup after the board meeting (`node scripts/import/demo-household.mjs --cleanup`; full entry in the archive);
the asset_types underscore-vs-hyphen id defect (dry-storage document audiences never match; small fix task; full entry in the archive).
