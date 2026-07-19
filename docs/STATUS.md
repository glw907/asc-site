# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**THE BOARD DEMO IS LIVE AND THE NEXT TWO PASSES ARE PLANNED (2026-07-19, the same
Fable session's second workflow, `wf_56eff27d-526`, 6 agents 0 errors, + a CI-green
fix round). MAIN IS GREEN (CI run 29700305089).** State at close:

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
- **NEXT PASS: `asc-roles-adoption` (pass A)** — plan
  docs/plans/2026-07-19-asc-roles-adoption.md (reviewed by the conductor; grounded
  in cairn 0.88.0's shipped access seam: defineAccess/canReach/requireAccess, the
  reserved-owner constraint, comprehensive-map deny-by-default). Resume prompt:
  "Start pass A: read docs/plans/2026-07-19-asc-roles-adoption.md and
  docs/2026-07-18-admin-sidebar-2-design.md, then invoke site-pass and execute T1–T5
  with Sonnet implementers per task." **THEN: `asc-sidebar-build` (pass B)** — plan
  docs/plans/2026-07-19-asc-sidebar-build.md; OPENS with the probe round for Geoff's
  still-owed verdicts (open/closed defaults, 25-icon assignment, within-group
  order). Resume prompt: "Start pass B: read
  docs/plans/2026-07-19-asc-sidebar-build.md; run its T1 probe round with Geoff
  first, then execute T2–T8." Both launch from ~/Projects/aksailingclub-org, fresh
  sessions. After B: events-redesign, then the review-queue clear and mw-cutover per
  ROADMAP.
- **On Geoff's queue:** the board demo itself (sign in as +demo-alex via magic link,
  or the shots); the attorney packet send (docs/waivers/, independent); the standing
  pointer queue below.

**THE WAIVERS BUILD IS LANDED AND RELEASED TO DEV (2026-07-19, Fable-conducted, Geoff's
"proceed with a workflow to release"). Workflow `wf_07d3ab70-09b`: 37 agents + a lows
fix round, 0 errors, ~5.1M subagent tokens.** What shipped (e1555f1..b21038d):

- **T1 document model**: the `documents` cairn concept (routing embedded), all 8
  attorney drafts copied in byte-verified with normalized audiences (asset-kind ids +
  dry-storage + all-members + youth-class), the published-version loader, and the
  freeze guard with a proven-failing negative fixture. **Every document is
  status:DRAFT, so the live behavior everywhere is the no-published-documents
  pass-through — flows run exactly as before until the attorney's sign-off publishes
  versions (that publish is a separate, later act recorded here when it happens).**
- **T2 migration 0029 (LIVE)**: waiver_acceptances evolved to the full evidence record
  (snapshot + SHA-256, auth event, build hash, AS 09.65.292 minors fields, context
  widened; legacy rows lossless). **T4's 0030 (LIVE)**: contact confirmations.
  **T5a's 0031 (LIVE)**: waiver_text_version retired.
- **T3 requirement engine** (pure, household-scoped, per-minor Part Two, dry-storage
  mapping) + **T5a householdSignatureGate** + old checkbox machinery retired.
- **T4 signing flow** at /my-account/sign per the ratified probe design (inline text,
  accordion-as-progress, filled-navy Sign, per-child Part Two, type-once-sign-each,
  attestation radios, waiting state, contact-confirm glance card; copy verbatim from
  signing-framing-copy.md). Design verdicts distilled into
  docs/design-benchmark/decisions.md (arc log removed).
- **T5b/T5c gates**: renewal + asset fees + class signup hard-gate through the engine;
  join is signature-gated through ONE shared checkout builder (conductor ruling after
  a correct T5 escalation: recompute-at-unlock, nothing money-derived stored,
  metadata-equality proven both ways); household-complete waiting state + cooldown
  nudge + resumption email; public class-signup pivots to a sign-in link when the
  release is outstanding. **T6 admin rollup** at /admin/club/documents ("is the club
  protected"): per-season counts, drill-throughs, signature history, frozen text,
  print-friendly certificate view.
- **Review gate**: 4 lenses → 22 findings; 8 verified mediums fixed (6a1a03e: primary-
  only contact gates, public class-signup gate, signature UNIQUE constraint, atomic
  contact writes, contrast/announce fixes); a lows round fixed 6 more (b21038d: ?next
  carried through confirm resend, per-form pending state, live-region existence,
  aria-describedby, certificate print title, comment truth; 2 refuted with evidence).
  **Accepted at club scale (recorded, not built)**: email send de-dup is
  check-then-send (narrow race), no hot-path signature index (tiny table), archived-
  primary resumption edge.
- **T8**: 4 functional e2e (sign-to-completion with DB assert, household gate
  lock/unlock + resumption, season boundary, minors path) on published FIXTURE
  documents at past seasons; waivers-visual.spec.ts authored UNRUN locally —
  baselines minted via the ci.yml update_snapshots dispatch at release (below).
- **Gate re-verified by the conductor**: check 0/0 (972 files), 141 files / 1777
  tests, build green, no workstation snapshots.
- **The coherence gate EARNED ITS KEEP (2026-07-19): first read FAILED the member
  surfaces while every mechanical gate was green.** Root causes, both one-cause
  families: (1) `@layer components` rules can never restyle a daisyUI `.btn` — the
  later layer wins regardless of specificity, so the ratified filled-navy Sign never
  rendered anywhere (and had already silently defeated one earlier shipped fix);
  (2) dark overrides keyed only on `[data-theme='asc-dark']`, so system-dark members
  got an illegible light strip. Fixes 4a420f9 (unlayered signing rules proven in the
  built CSS; sage→base-200 with the dual dark-selector idiom; admin 390 column
  reorder; family-scenario visual coverage added — the ratified household device had
  shipped with zero visual coverage) and 2450cff (the waiting card's own filled/quiet
  action pair, card and household block re-separated). Baselines re-minted twice via
  the ci.yml dispatch (now 20 waivers baselines incl. family × 4); every surface
  verified by the conductor's own eyes at 390/1440 both themes: midflow, family,
  waiting, contact-confirm, admin rollup all match the ratified probe design. The
  layer-cascade gotcha is banked as project memory (layer-cascade-gotcha). One
  verifier over-call corrected by eye: contact-confirm's filled button was always
  fine (daisy's own primary).

**OPEN ON GEOFF'S QUEUE:** the signing-moment before/after (dev renders the no-docs
state; the moment itself is visible in the CI-minted baselines and locally via the e2e
fixtures); the attorney packet send (docs/waivers/, independent of the build); then the
standing queue pointers below.

**ADMIN-SIDEBAR-2 (next pass, brainstormed 2026-07-18 live with Geoff; spec DRAFT
committed docs/2026-07-18-admin-sidebar-2-design.md).** Ratified: purpose-first
4-group tree; Signups screen retires fully; bulletins/notifications re-unified to the
production bulletins model; relabel sweep; five plain-function roles (Administrator /
Club manager / Webmaster / Publisher / Instructor); function-first security (one
permission map, categories cosmetic); role-scoped pending-actions notifications.
BRAINSTORM STILL OPEN: probe verdicts owed (open/closed defaults, 25-icon assignment,
within-group order) + Geoff's remaining topics. SEQUENCING: the cairn engine pass runs
FIRST from docs/2026-07-18-cairn-sidebar-seams-consumer-brief.md (four seams, one
minor release; Geoff runs it in ~/Projects/cairn-cms — resume prompt: "Start the
sidebar-seams engine pass: read ~/Projects/aksailingclub-org/docs/2026-07-18-cairn-
sidebar-seams-consumer-brief.md, then invoke cairn-pass to brainstorm the API shapes
and plan the four seams as one minor release, ASC the named first consumer."), then
the ASC pass rides the bump. ASC resume prompt (post-clear): "Continue the
admin-sidebar-2 brainstorm: read docs/2026-07-18-admin-sidebar-2-design.md (DRAFT) and
ROADMAP's admin-sidebar-2 entry; owed: probe-round verdicts (defaults/icons/order) and
Geoff's remaining topics; then finalize the spec and plan the ASC pass (waits on the
cairn seams release)." After sidebar-2: events-redesign, then the review-queue clear
and mw-cutover per ROADMAP.

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):**
the attorney packet send (docs/waivers/, all DRAFTs; the sitting's full entry is in
the archive — sources verified live, register/fact gates run, board-packet.md carries
the Borough records-request path);
member-directory before/afters (/my-account/directory, /my-account/committees, edit
surfaces, public /committees); portal redesign before/after against mock D (PR #1,
merge 510b266); the payments live smoke (docs/plans/2026-07-15-payments-live-smoke.md);
the five-stop dev walkthrough; the 07-15 apology-send verification; the fragments
/members before/after and the unfiled fragments harvest
(docs/2026-07-17-fragments-harvest-findings.md); the directory pass's DX-harvest notes
(shared portal section primitive, --container-measure-list token — in the archive
entry).
