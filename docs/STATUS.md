# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

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

**THE FABLE WAIVERS SITTING IS DONE (2026-07-18): the T7 attorney-draft packet and the
T4 signing-experience design both delivered.** The packet (docs/waivers/, all DRAFTs):
the 2027 general release (Donahue-shaped, cold-water immersion named, AS 09.65.292
Part Two), rules acknowledgement, mooring + dry-storage agreements (tackle split at
the ball, assumed ground-tackle failure, no inspection language, no-bailment,
unsecured-lot, Borough 72-hour covenant, contractual lien/abandonment, insurance both
ways), three per-asset acknowledgements, youth medical field set, the signing framing
copy, the Donahue pre-publish checklist, and board-packet.md (inventory, board
decisions, attorney questions, discrepancy memo). Sources verified live: the MW
join-form release never says "negligence" (the core defect cured); MSB006789 carries
NO 72-hour language — it traces to the pre-2022 Borough permit, not publicly posted;
the records-request path is in the board packet. All register/fact gates ran and
folded. The probe rounds' verdicts now live in decisions.md (see the build entry).

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):**
member-directory before/afters (/my-account/directory, /my-account/committees, edit
surfaces, public /committees); portal redesign before/after against mock D (PR #1,
merge 510b266); the payments live smoke (docs/plans/2026-07-15-payments-live-smoke.md);
the five-stop dev walkthrough; the 07-15 apology-send verification; the fragments
/members before/after and the unfiled fragments harvest
(docs/2026-07-17-fragments-harvest-findings.md); the directory pass's DX-harvest notes
(shared portal section primitive, --container-measure-list token — in the archive
entry).
