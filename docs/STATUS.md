# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**THE FABLE WAIVERS SITTING IS DONE (2026-07-18): the T7 attorney-draft packet and the
T4 signing-experience design are both delivered.** What landed:

- **The draft packet, `docs/waivers/`** (all DRAFTs for the attorney; nothing in force):
  the 2027 general release (Donahue-shaped, cold-water immersion named, AS 09.65.292
  minors Part Two), rules acknowledgement, mooring agreement (tackle split at the ball,
  assumed ground-tackle failure, zero inspection language, insurance both ways), dry
  storage agreement (no-bailment, unsecured-lot statement, Borough 72-hour covenant,
  contractual lien/abandonment, insurance both ways), three per-asset acknowledgements
  (Trailer Row / boat parking / rack — Geoff's mid-sitting note "folks accept specific
  rules per asset" is exactly these), the youth medical field set, the signing framing
  copy (finished words for the build), the Donahue pre-publish checklist, and
  `board-packet.md` (inventory, board decisions, attorney questions, discrepancy memo).
- **Sources verified, not assumed:** the current MW join-form release captured live from
  the widget (it never says "negligence" — the core defect the redraft cures); the full
  MSB006789 text confirmed to carry NO 72-hour/RV language; the 72-hour clause traces to
  the pre-2022 Borough permit ("under Borough Permit since 2013" per the Borough
  manager's Apr–Jun 2022 report), which is NOT publicly posted — the board packet
  carries the records-request path (Land & Resource Mgmt Division).
- **Review gates run:** Vale (cairn slop styles clean), the register editor (findings
  applied, e.g. "named plainly" killed across three documents), an Opus facts pass
  (every citation/figure verified; 4 low findings applied), and an independent critic on
  the framing copy (5 high findings applied — framing lines no longer characterize legal
  effect).
- **The T4 probe deck** (scratchpad/signing-probe/, arc log
  `docs/design-benchmark/waivers-signing-round-1-arc.md`): the signing moment grounded
  in the real release draft at 1440/390 both themes — sheet vs inline candidates,
  collapsed-receipt progress, filled-navy Sign, contact-confirm glance card. **OPEN ON
  GEOFF'S QUEUE: the probe verdicts** (deck opened in the browser; six questions on it).

**IMMEDIATE NEXT ACTION: the waivers BUILD session (Opus-conducted), T1–T3 + T5–T6 now,
T4 once Geoff's probe verdicts ratify the signing design.** Resume prompt: "Start the
waivers build: read docs/plans/2026-07-17-member-waivers.md and docs/waivers/ (the
sitting's drafts + signing-framing-copy.md + the arc log's ratified verdicts), then
execute T1–T6 and T8 with Sonnet implementers per task." Launch from
~/Projects/aksailingclub-org. The attorney packet can go out on Geoff's go — it does not
wait for the build. After the build: events-redesign, then the review-queue clear and
mw-cutover per ROADMAP.

**THE MEMBER-DIRECTORY PASS IS BUILT AND PUBLISHED TO DEV (2026-07-18, Fable-conducted
finish on Geoff's "finish and publish with a workflow"). T0–T7 are all executed; what
remains is REVIEW, not build.** The session landed, in order:

- **T2b committees seed, APPLIED LIVE + VERIFIED** (d41c7a8): 7 committees (2 standing /
  5 established, published-table sort), 4 officer positions, 8 active chair/co-chair
  rows, 0 orphans/dupes. Name resolutions at import review: stored-name lookup keys
  ("David Johnson", "Matthew Flickinger"), and the word-reversed "Stanbro TL" member row
  FIXED LIVE to "TL Stanbro" (audit actor `admin:member-name-fix`). Geoff confirmed the
  committee name **"Membership & Events"** and an EMPTY plain-director list (the four
  officers are the whole board right now).
- **T3 directory query** (b831de9): one row per listed member; standing sourced from
  `standing.ts`'s new pure `standingWindowFromPaidAt` (four bounded queries + one
  grace-days read); chair titles derive at render; partial visibility nulls email+phone+
  address together; pending/archived-committee rows excluded in SQL.
- **T4 Compact A directory screen** (c2b9f27, Opus implementer): compact rows expanding on
  a sage wash, one filled top-title chip +N, boats-else-city secondary with width-aware
  abbreviation, honest carets, ≤3-result auto-expand, three chips + one smart search,
  mobile as its own composition. Pure view logic in `directory-view.ts` (27 tests).
- **T5 edit surfaces** (3177afc): profile boat CRUD (name+model REQUIRED, picker resolves
  to stored string), household address edit, extended "what others see" preview incl. the
  roster-names-always-show statement.
- **T6 admin CRUD** (5c3fde8): /admin/club/committees covering committees/memberships/
  positions, archive-not-delete, decline-deletes-row; the queued admin-nav pass absorbs it.
- **T6b portal committees page + delegation + public directive** (08728b1): probe built
  from live rows, **Geoff-RATIFIED same day** (arc log round 3: text-action register,
  comma-flow rosters, standing captions, chair names link to directory, zero fireweed);
  /my-account/committees with request/cancel/leave + chair pending-queues + board
  management, ALL predicates enforced server-side with denial tests; chair notification
  via sendClubEmail; public /committees At-a-Glance now renders LIVE data via the
  `committees-at-a-glance` directive (hand table deleted from committees.md).
- **Reviews via two workflows** (wf_9276f60c, wf_77d050e4; 12 agents, 0 errors): svelte +
  a11y on T4-T6 (8 findings fixed, 62256aa), then security + svelte + a11y on T6b
  (d217669): join-request email spam got an email_log-backed 15-min cooldown,
  archived-committee writes refused, duplicate add-member handled, board can never mint a
  "pending chair". Declines are evidence-backed (pre-existing sitewide idioms).
- **Gate at publish**: check 0/0 (916 files), 123 test files / 1614 tests, build green.
  Pushed to main → dev deploy. e2e baselines for the two new portal specs minted via the
  ci.yml update_snapshots dispatch (8 new: directory + committees × 390/1440 × both
  themes; committees baseline is the fixture empty state — fixtures carry no committee
  rows, noted in the spec).

**OPEN ON GEOFF'S QUEUE for this pass:** the before/after on dev — /my-account/directory
(Compact A vs the old household cards), /my-account/committees, the profile/household edit
surfaces, and the public /committees live table (now says "Membership & Events") — plus
the standing accumulated queue (pointers below).

**DX-harvest notes from this pass** (fold into the next harvest filing): a shared portal
section primitive (the quiet hairline list is hand-rolled per page, third occurrence); a
`--container-measure-list` token (60rem is a raw literal in directory + committees);
`.portal-text-action` LANDED as the named text-register tier (probe's harvest note,
shipped in T6b).

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):** portal
redesign before/after against mock D (PR #1, merge 510b266); the payments live smoke
(canonical steps docs/plans/2026-07-15-payments-live-smoke.md); the five-stop dev
walkthrough; the 07-15 apology-send verification; the fragments /members before/after and
the unfiled fragments harvest (staged in docs/2026-07-17-fragments-harvest-findings.md).
