# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**INITIATIVE 5 (admin-roles + admin-nav-reorg) EXECUTED, CLOSED, AND LIVE ON DEV
(2026-07-15 early, the session that watched 0.86.0 land and ran the whole pass on
Geoff's "full implementation and publish with a workflow" ruling). Bump ^0.84.4 →
^0.86.0 (6af3110, mechanical fallout only); spec
docs/2026-07-14-admin-roles-navlayout-design.md (9e88752, brainstormed live: one
initiative two phases, the split-desk tree ratified from three candidates); plan
docs/plans/2026-07-14-admin-roles-navlayout.md (e45a4e2). Executed by workflow
wf_77a5e053 (5 sequential Sonnet implementer tasks + 3 prose review lenses, ~735k
subagent tokens, 0 agent errors) + a 5-item fix round (~101k) + simplifier (~200k).
Commits 0e3c5fc..0a329b3. WHAT LANDED: defineRoles vocabulary
(owner/club-admin/instructor; instructor declares NO home until class-management) +
the CairnRolesRegister augmentation; the club gate collapsed onto the typed session
(layout guard + clubAdminAction read editor.role/capability, zero D1 role reads; the
shared CLUB_ROLES pair lives in club-db.ts beside resolveClubDb); Settings grant/revoke
retired for ManageEditors; the split-desk navLayout tree (Club/Outreach/Boats &
Gear/Content/Site — including the nav screen the spec wrongly said didn't exist);
club-roles.ts deleted (engine's atomic last-owner guard is now the only one);
migration 0026. THE REVIEW HIGH THAT MATTERED (auth lens): createAuthGuard() was
constructed WITHOUT the vocabulary, so a real club-admin would have resolved to none
capability at first grant — fixed in fc0865c with a module-mock regression test.
Deployed manually (version bffd4249), smoke green. LIVE MIGRATIONS APPLIED AND
VERIFIED in the safe order: cairn's 0001_roles.sql on cairn-asc-auth (CHECK lifted,
club-admin insert/delete round-trip proven, both owner rows intact), then — only after
the new deploy verified serving — 0026 on asc-club (club_roles GONE, sqlite_master
proof). Render read via minted session: the live sidebar renders the ratified tree
exactly, owner lands on Posts. SESSION-MINT RECIPE CORRECTIONS (supersedes the
initiative-4 note): on https the cookie is __Host-cairn_session (bare cairn_session is
local-http only) and session.expires_at is MILLISECONDS. cairn-doctor: 12 pass
including both role checks; the 2 zone-read FAILs (Always-Use-HTTPS/HSTS reads 403d)
deferred to the mw-cutover runbook's zone-posture step. DX HARVEST for cairn (per the
standing mandate, now in project memory): (1) the npm package ships NO migrations/
directory (files=[dist,CHANGELOG]) — a consumer cannot apply 0001_roles.sql without a
repo checkout; (2) the vocabulary must be wired TWICE (adapter roles + createAuthGuard
opts) and missing the guard fails silently while all rows are owner — wants a doctor
check or single-source wiring; (3) the session-mint gotchas above; (4) positive:
defineRoles/CairnRolesRegister/navLayout/resolveNavLayout all typed clean first-try
per their guides. Spec-authoring lesson (mine): the "no navMenu" claim was wrong —
verify adapter-config claims, don't reason from memory. SETTLE-IN-ADVANCE RULINGS all
recorded on ROADMAP entries (797c163 + follow-ups): payments smoke = real charge
refunded through the ledger path, Turnstile on every public unauth POST; cutover = two
weeks quiet; season-rollover = board-run guarded admin op (INTERACTIVE brainstorm, not
overnight); class-management frame settled (all four capabilities v1, instructor
check-in writes, club-admin audited refunds PER THE ASC REFUND POLICY — the spec reads
the club's real policy, never invents; 2027 readiness) with the design brainstorm
INTERACTIVE per Geoff ("especially the class stuff"). QUEUED: Geoff's dev walkthrough,
now FIVE stops (Members, household desk, Money & Renewals, Compose with the announce
grace widening, and the NEW SIDEBAR + ManageEditors as the one role screen); the 07-15
apology-send verification (check the JSONL beside
~/.local/asc-data/send-apology-2026-07-15.mjs if that session died). NEXT SESSION, the
overnight run — CONDUCTOR CHOICE PENDING GEOFF (he flagged 75% weekly Fable spend):
recommendation is OPUS-conducted against the settled rulings, reserving Fable for the
interactive brainstorms and design rounds where his ruling says the edge lives. Resume
prompt: "Author the payments-live-smoke spec and the mw-cutover runbook per their
ROADMAP entries' pre-spec rulings (settled 2026-07-14; no questions — default
conservatively and flag in the doc). Read docs/STATUS.md first. No deploys, no live D1
writes, no design rounds. Riders if budget allows: the admin e2e login helper (use the
corrected session recipe) and the polish-backlog triage into design groups."**

**SESSION 5 CLOSED PRE-BRAINSTORM (2026-07-14 night, deliberate clear on Geoff's call —
the session ran long and noisy: the cairn double-execution below, the calendar fix, the
docs archival). NEXT SESSION = INITIATIVE 5 EXECUTION, fresh context, launch in THIS
repo. Resume prompt: "Start initiative 5 (admin-roles + admin-nav-reorg): verify cairn
0.86.0 is on the registry (npm view @glw907/cairn-cms version — Geoff's other session
was cutting it at close), bump ^0.84.4 → ^0.86.0, then brainstorm the club_roles
collapse + sidebar arrangement. Read docs/STATUS.md, ROADMAP's admin-roles +
admin-nav-reorg entries, docs/2026-07-13-cairn-editor-roles-consumer-brief.md, and
cairn's docs/guides/organize-your-admin-nav.md + docs/reference/core.md#roles first."
The collapse surface and seam facts are in the entry below; the ledgered rulings from
this session (Fable-window spec queue, design-session series + page-confirmation ledger,
opportunistic template migration, mw-cutover in-window-if-budget) are on ROADMAP entries.
Session riders landed: the calendar season-filter fix (live on dev, verified), STATUS
archived to docs/status-archive.md with the trim rule in the preamble, the global
CLAUDE.md compressed ~25%, the one-executor-per-worktree rule globalized. Geoff's dev
walkthrough (four screens) and the 07-15 apology-send verification remain queued.**
