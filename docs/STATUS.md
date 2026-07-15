# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**OVERNIGHT AUTHORING RUN COMPLETE (2026-07-15, the ruled Fable-altitude session: Opus
agents researched, drafted, and adversarially verified; Fable briefed, reviewed line-level,
triaged). FOUR COMMITS, DELIBERATELY UNPUSHED (push=dev-deploy and the run was ruled
no-deploys; push them at next session start): 5abff25 the payments-live-smoke spec
(docs/2026-07-15-payments-live-smoke-design.md) + plan
(docs/plans/2026-07-15-payments-live-smoke.md) + the mw-cutover runbook
(docs/2026-07-15-mw-cutover-runbook.md) + ROADMAP pointers; 4fc774e the polish backlog
triaged into the six design groups (docs/design-benchmark/polish-triage.md); 7598470 the
admin e2e login helper (e2e/helpers/admin-session.ts + admin-login.spec.ts, full gate +
28-spec e2e green, recipe per the corrected session-mint facts); f920d2f the claims-check
corrections. THE ADVERSARIAL VERIFY ROUND PAID (enabled by Geoff's non-Fable-credits note;
all findings confirmed against source before editing): (1) the cutover flip is ROUTE
reassignment, not custom domains — a custom domain refuses the existing proxied records
and its rollback strands the apex recordless; runbook rewritten, routes primary; (2) the
pre-flip permalink crawl was legacy-against-legacy false green — now the legacy URL list
against the dev build; (3) requestLink (/my-account signed-out sign-in) is a FIFTH ungated
public magic-link sender both researcher and drafter missed — added to spec+plan per the
every-public-POST ruling; (4) refunds live on the household desk
(admin/club/members/[id] ?/refund), not the money screen — all references fixed; (5) the
Workers ratelimit binding went GA 2025-09 — the plan declares [[ratelimits]], not
unsafe.bindings. FINDINGS FOR GEOFF'S MORNING: (a) dev.aksailingclub.org is NOT behind
Access (verified live: 200 tokenless; project CLAUDE.md's Access section is STALE — left
unedited pending the ruling; the asc-cloudflare-access memory is updated) — decision held
in spec §6: re-protect dev (webhook then needs a bypass app; estate precedent "ASC Ops
Schema API") vs accept-public until cutover; until the hardening lands the ungated
magic-link/money endpoints face the open internet against real member data; (b) THREE
Turnstile widgets cover the site — code + the ASC secret registry agree on
0x4AAAAAACaRcPmackdot0hZ; two orphans routed to the infra tidy (polish-triage.md); (c) the
smoke will be the FIRST-EVER webhook-reconcile execution (processed_stripe_sessions=0
live) — the spec adds a sandbox dry-smoke before any live-key swap; (d) held decisions:
smoke product ($1 donation default vs $100 domain-unwind alternative), memo vs
marker-column smoke marking. QUEUED (unchanged): Geoff's five-stop dev walkthrough; the
07-15 apology-send verification. HARDENING GO GRANTED (Geoff, 2026-07-15 at this close,
before bed): the payments-hardening half (plan Tasks 1-6 + conductor steps 1-2) runs
OVERNIGHT in a fresh OPUS-conducted session — code-only, local gates, NO deploys, no
live keys, the smoke untouched; the RESUME PROMPT: "Execute the hardening half of
docs/plans/2026-07-15-payments-live-smoke.md (Tasks 1-6 plus conductor steps 1-2 only),
per the overnight go in docs/STATUS.md's top entry. Read STATUS and the plan first, spec
docs/2026-07-15-payments-live-smoke-design.md beside it. Sequence: Tasks 1→3→4
sequentially via site-implementer (they share files; review each diff + full gate
between dispatches), Task 2 read-only in parallel, Task 5 is a design-doc appendix, then
the Task 6 review fan-out (prose reports, direct dispatch), fix triage, code-simplifier,
re-gate, STATUS close. Do NOT deploy, do NOT push (push=dev-deploy; five commits are
already waiting unpushed — leave them), no live D1 writes, no Stripe keys. Task 4 is the
memo path only (marker column is Geoff's held decision). Stop after consolidation; the
dry-smoke, deploy, and Geoff's before/after run on his morning go."**

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
overnight run — CONDUCTOR MODE RULED (Geoff, at this close, with 75% weekly Fable
spent): FABLE CONDUCTS AT VERY HIGH ALTITUDE — judgment, dispatch, and triage only,
near-zero main-loop drafting or bulk reading — and DISPATCHES OPUS AGENTS for the
research and spec drafting. Resume prompt: "Author the payments-live-smoke spec and
the mw-cutover runbook per their ROADMAP entries' pre-spec rulings (settled
2026-07-14; no questions — default conservatively and flag in the doc). Operating
mode per Geoff's ruling: Fable stays at very high altitude and dispatches Opus agents
for research and drafting; the main loop only briefs, reviews, and triages. Read
docs/STATUS.md first. No deploys, no live D1 writes, no design rounds. Riders if
budget allows: the admin e2e login helper (use the corrected session recipe) and the
polish-backlog triage into design groups."**

