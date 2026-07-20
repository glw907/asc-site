# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**THE ADMIN TOOLKIT WALKTHROUGH IS DONE AND THE INITIATIVE SHAPE IS SETTLED
(2026-07-20, Fable-conducted "I drive, you react" walk with Geoff over a live-data
local replica).** The settle: the admin screens get redesigned **one by one, each a
full pass opening with its own functional brainstorm**, components and standards
harvested into cairn as passes land (ROADMAP `admin-screen-passes`, inserted ahead of
`events-redesign`). Ordering: **Members first, then Classes or Assets**; Money
deliberately later. Evidence base: `docs/2026-07-20-admin-toolkit-catalog.md` — five
reacted stops (Members, Money, Classes+waitlist, class detail, Assets, Committees,
Asset requests) plus assistant-filed sweep inventories of every remaining screen;
cross-cutting themes (density, one chip system, per-row action discipline,
function-first resets) and Geoff's methodology ruling (recipes grounded in published
UX research, not impressions — a research survey rides the first pass). Notables: the
class-detail roster renders raw UUIDs (data intact, UI never joins members); reusable
walkthrough harness (real `asc-club` copied into the local replica via
`wrangler d1 export` + direct sqlite import; `scratchpad/walk.mjs`); fixture fix
committed (signup-seed clear list missed the 0027–0030 children — warm replicas
crashed bootstrap). **Flag for the existing apology-send queue item: the live
`email_log` holds 471 failed vs 279 sent, latest failures 2026-07-14 08:15 UTC** —
real rows, seen during the walk. A rough starting component collection is drafted
from the walk (`docs/2026-07-20-admin-toolkit-starting-collection.md`) — explicitly
pre-research hypotheses.

**THE DESIGN-RESEARCH SURVEY IS DONE AND THE COLLECTION IS GRADED (2026-07-20, same
day, Fable-conducted: a 106-agent deep-research workflow with adversarial source
verification + two component-inventory sweeps across eight design systems + a daisy
availability audit).** The deliverable is
`docs/2026-07-20-admin-toolkit-research-survey.md` (verdicts on every collection
entry, E/C/G evidence tiers, daisy assembly per component; inventory appendices
beside it). Headlines: verified evidence exists in exactly three areas (zebra =
preference-only, no performance harm; infinite scroll banned for admin lists with
bounded-default-plus-explicit-action the winner; top-aligned form labels at medium
confidence) — everything else is labeled convention from the eight-system convergent
core. The Chip entry split in three (StatusChip/TagChip/CountBadge per the
Polaris/Atlassian/Spectrum status-vs-category discipline); additions: EmptyState,
ConfirmDialog, Toast+Alert feedback tiers, CapacityMeter. Two Geoff rulings folded
in: daisyUI-first assembly, avoid building new things — audit confirmed zero new CSS
systems needed; first engine change is a blessed-set daisy safelist in cairn's admin
CSS build (stats/table-zebra/table-xs/toast are currently tree-shaken out).
**THE MEMBERS BRAINSTORM IS DONE (same session): spec
docs/2026-07-20-members-pass-design.md (c07d3a3), plan
docs/plans/2026-07-20-members-pass.md.** The rulings: search-first household rows
with expand-in-place panel (contacts, members with ages, holdings, classes, paid
states; actions Open household / Email household / Add member — money stays on the
desk); standing collapses to **Current / Overdue / Former** with the reminder
sequence's +30 stated-final touch as the Former boundary (rolling paid_at+1yr,
never season), grace RETIRED (Overdue keeps full member benefits until Former),
"renewal candidates" retired as a concept; kit-first toolkit build to GENERAL
contracts (Geoff: this is a general-purpose admin toolkit, ASC is first consumer —
generality shapes the contract, a consumer gates publication into cairn); roster
ages filed as Classes evidence. **NEXT: execute the plan, T1 first (cairn daisy
safelist, one-executor check on cairn-cms before touching it).** Resume prompt:
"Execute docs/plans/2026-07-20-members-pass.md task by task via site-implementer
dispatches; T1 is the cairn safelist." Launch from ~/Projects/aksailingclub-org.

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
