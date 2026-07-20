# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

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

**THE BOARD DEMO IS LIVE AND THE NEXT TWO PASSES ARE PLANNED (2026-07-19, the same
Fable session's second workflow, `wf_56eff27d-526`, 6 agents 0 errors, + a CI-green
fix round).** State at close:

- **The board demo is ready on dev.** All 8 documents are PUBLISHED for season 2026
  (Geoff's ruling: production go-live still gates on the attorney; dev is not
  member-facing; the 2027 drafts stay the untouched attorney packet; inline season
  lines corrected to 2026). The **[DEMO] Harbor family** is seeded live (two adults
  on geoff.wright+demo-alex/+demo-jordan plus-addresses — magic links and nudge
  emails land in Geoff's inbox — a minor, an unpaid 2026 family membership mid-join,
  a mooring) in the PRISTINE unsigned state; the full loop was verified live on dev
  end to end first (signing, per-child Part Two, waiting state, real nudge +
  resumption emails, payment unlock, contact-confirm, evidence rows incl. auth
  events, certificate) and then reset. Board handout shots:
  docs/board-demo/2026-07-19/ (8 PNGs, committed). **AFTER THE BOARD MEETING:
  `node scripts/import/demo-household.mjs --cleanup`** (removes every demo row and
  prints the zero-count proof). E2e fixture households were seeded with acceptance
  rows (portal-seed e985a72, signup-seed 1357881) so CI stays green with zero
  baseline churn.
- **KNOWN DEFECT, needs a small fix task:** live `asc-club` asset_types ids use
  underscores (`rv_parking`, `boat_parking`, `small_boat`) while the
  AssetKind/DocumentAudience vocabulary uses hyphens (`rv-parking`, `boat-parking`,
  `small-boat-rack`) — the three DRY-storage document audiences can never match a
  real holding, so those documents are silently never required (mooring matches and
  was verified live). Fix by aligning one side (schema-evolvability favors migrating
  the ids; check every FK/string reference). Minor note beside it: `documents.ts`'s
  resolveDocumentVersion/loadDocumentVersion match document+version without season
  (harmless while 2026/2027 bodies share titles).
- **Pass sequencing**: passes A (`asc-roles-adoption`, archived entry) and B
  (`asc-sidebar-build`, the entry above) both shipped 2026-07-19; `events-redesign` is
  next, its resume prompt in the pass-B entry.
- **On Geoff's queue:** the board demo itself (sign in as +demo-alex via magic link,
  or the shots); the attorney packet send (docs/waivers/, independent); the standing
  pointer queue below.

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
entry).
