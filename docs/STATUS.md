# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**THE CLASSES PASS IS BUILT, RELEASED TO DEV, AND COHERENCE-PASSED ("designed, not
assembled", third cold read); GEOFF'S BEFORE/AFTER AND THE PROBE VERDICTS ARE THE
OPEN GATES (2026-07-21, crash-recovered session, Fable-conducted on Geoff's workflow
opt-in "continue with a workflow to release"; workflow wf_297581a0-a05 13 agents 0
errors + 5 direct dispatches; commits ecde24c..cbb79f5; cairn 0.89.1).** What shipped:

- **Tasks 1–5** (the crashed session had executed 1–4 and left Task 5 warm,
  complete, and gate-green — recovery lost nothing): cairn 0.89.1 (itemNoun/
  ItemLabel graduated), the toolkit subpath swap (five local copies deleted,
  ExpandableRow kept local), the season-scoped list rebuild (roster expand panels,
  offerNext with its three guards), the detail rebuild (roster, waitlist & offers,
  edit form on the event-detail idiom, instructors, demoted danger zone,
  recordPayment), and the transfer flow (transferEnrollment on the shared
  triggerFreedSpotOffer — same-price moves the payment, mismatch warns + explicit
  confirm, no Stripe surgery; the portal withdrawal path now shares the same
  freed-spot function).
- **The release round**: 13 findings, every medium adversarially verified (0
  refuted); 3 confirmed mediums fixed — the recordPayment DOUBLE-CHARGE race (now
  claimOffer's compare-and-set; accepted-at-club-scale residual: a D1 failure
  between the flip and the ledger batch leaves paid-without-ledger, the far-rarer
  inverse of the double-click it kills), the transfer picker offering
  already-enrolled destinations with the server refusal invisible behind the modal,
  and dead divide-y utilities (the silent-non-compile trap AGAIN — two more
  instances this pass, harvest finding 14). 7 lows fixed, 3 skipped with reasons.
  The cross-class waitlist's blank member names fixed (finding 11's follow-up).
- **Coherence: FAIL (4 tells) → fix → cold FAIL (2 tells) → fix → cold PASS** —
  full verdicts in the ledger. Carry-worthy root causes: ExpandableRow's
  panel-follows-summary-width contract recurred at its second consumer (harvest
  13); Svelte trims a literal leading space at an {#if} boundary (harvest 15).
- **Probes committed** (docs/design-benchmark/probes/2026-07-21-classes/): list row
  anatomy/density, the over-capacity voice x3, expand-panel composition, and the
  riders page carrying the three open Members items (StatusChip palette, the
  never-paid 'none' copy, the search focus ring). **GEOFF'S VERDICTS OWED.**
- **Gates**: check 0/0, 2000 tests, build green; design-probe clean (the same 5
  pre-existing site findings, none from this pass); CI green INCLUDING the visual
  suite against the EXISTING baselines — baselined rendering provably unchanged,
  so no update_snapshots dispatch (the regen rule binds only when rendering
  changes); deploy green, dev live.
- **Series ruling (Geoff, mid-pass)**: admin-screen-passes covers the ENTIRE admin
  surface until fully polished, order flexible — ROADMAP's entry now carries the
  remaining-screen map; season-rollover gained the sweep-the-ops-dashboard's-
  year-cycling-logic note.
- **Budgets**: ~1.9M subagent tokens (workflow 1.32M + five direct dispatches);
  conductor questions to Geoff: 0. Guard lesson reconfirmed: the bytes-based
  runaway alarm false-fired on the probe agent (embedded CSS + screenshots);
  stall-only detection is the right shape.
- **ON GEOFF'S QUEUE**: the Classes before/after on dev (/admin/club/classes — the
  list with a panel expanded, a detail page, the Move… dialog, at 390 and 1440)
  and the probe verdicts above.
- **NEXT PASS — ASSETS (first under the whole-surface series ruling)**: opens with
  the functional brainstorm. RESUME PROMPT: "Start the Assets pass: read
  ROADMAP.md's admin-screen-passes entry and docs/STATUS.md, then open the
  functional brainstorm with Geoff (superpowers:brainstorming) before any visual
  work. The asset_types underscore-vs-hyphen defect rides the pass; opening cairn
  task candidates: ExpandableRow's graduation (second consumer landed) and the
  destination-picker pattern." Launch from ~/Projects/aksailingclub-org.


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

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):**
the pass-B sidebar walkthrough per role (four-group tree, badges, the two class
surfaces, Help in the foot; full entry moved to the archive);
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
