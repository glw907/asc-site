# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**IMMEDIATE NEXT ACTION (2026-07-18): the `member-directory` pass is at T2b (committees +
people seeder), OPUS-CONDUCTED. T0, T1, T2 (boats), and T2c (addresses) ARE DONE + APPLIED
LIVE.** T0/T1 as before (Compact A composition; migration 0027 the directory domain). This
session landed the seed data and a boats-model reshape Geoff ratified mid-pass:
- **Migration 0028_boats_model** — boats reshaped to a single required `model` field (the
  Buccaneer 18/Laser/Other picker writes the model; Other means typing it), dropping 0027's
  `class` + conditional-`model` pair. Committed (**3c6a2ec**), scratch-proven, **APPLIED +
  VERIFIED live** (boats was empty).
- **T2 boat seed** — `scripts/import/boat-seed.mjs` seeded **29 boats** live from active
  boat asset-assignments, attached to owners, models normalized. Owners defaulted to the
  household primary; Geoff's review corrections are in the committed `boat-seed.resolutions.json`
  (Gabe/Darren Black owners; models Demon 16, Megabyte, Laser II, Powerboat; Bart Hawkins's
  duplicate assignment dropped; five names — Dionysus, Bat Boat, Spirit of 76, "Black, Nancy",
  Daydream Believer). 0 orphans, all models valid. Names otherwise NULL (members fill going forward).
- **T2c household address seed** — NEW `scripts/import/household-address-seed.mjs` filled
  `address_line1`/`state`/`postal_code` on **146 households** live from the MW export (each
  household's primary member's row), Title Cased; 2 street-less households skipped; `city` and
  `address_line2` untouched. Update-if-null, audited, rollback-able.
- **Members dedup** — the duplicate "Nancy Black" shadow row (a3c5ece1, contactless, second
  mw_account_id, zero dependents) archived (reversible, audited). Elayne Hunter's two rows are a
  legitimate membership history (individual→family), left as-is. Roster is 285 members / 148
  households; a table-wide exact-name scan found only the one dup.

Commits this session: 3c6a2ec (0028 + boat reshape), 4798cc1 (boat seeder), 5e355ea + 858ff3f +
250ae71 (address seeder + simplify + title-case/names), 1520405 (spec docs), plus the resolutions
commit. Spec docs (plan T1/T2/T2c/T4/T5 + design doc) updated in place to the name+model + address-seed model.

Resume prompt: "Resume the member-directory pass at T2b: read docs/plans/2026-07-17-member-directory.md
and docs/2026-07-17-roles-committees-design.md, then dispatch T2b (committees + people seeder) — the
seven committees plus officers/chairs from the published /committees At-a-Glance table, verified-import,
Geoff supplies plain-director rows at the dry-run review. Then T3 (directory query)." Launch from
~/Projects/aksailingclub-org, `/model opus`.

INDEPENDENTLY SCHEDULABLE, any time Geoff's review suits: the FABLE waivers sitting (waivers plan
T7 + the T4 signing-UX design; before the waivers BUILD reaches T4).

**ROLES & COMMITTEES BRAINSTORM: DONE 2026-07-17 (Fable-conducted, this sitting). Spec
docs/2026-07-17-roles-committees-design.md is committed and Geoff-approved; it SUPERSEDES the
directory spec's decision 6 (flat member_roles — never built), and the directory plan is
reshaped IN PLACE.** The model: `committees` (name, description, kind standing|established,
archive-not-delete), `committee_members` (chair|co-chair|member + pending|active; UNIQUE pair),
`member_positions` (kind officer|director|appointed — authorization hangs off kind, never
title-string matches). Ratified: request-then-approve joining (request notifies chairs via the
job-runner; decline/leave delete the row); chairs manage their own roster; board members
(kind officer/director) appoint chairs and create/edit/archive committees; site admin everything;
rosters show every active member's NAME regardless of directory_visibility (contact stays
dialed); chair titles DERIVE at render so surfaces cannot drift. Surfaces: /my-account/committees
(rights-derived affordances, probed and Geoff-verdicted before build), the probed directory
rendering (filled chip for positions/chair titles, outline for plain membership), and the public
/committees At-a-Glance table fed by a live directive (chairs/officers are public names, as the
hand table already is today). Seeds: the seven committees (five established + Finance and Board
Development standing, per bylaws) and people from the published At-a-Glance table,
verified-import, misses audited; Geoff supplies plain-director rows at import review. Plan
deltas: T1 grows to four tables, NEW T2b (committees+people seeder), T5 = boats + extended
preview only, T6 = whole-model admin CRUD, NEW T6b (portal committees page + delegation +
public directive; server-side predicate tests including denial cases), T7 adds
web-auth-security-reviewer on the new authz surface (the pass's riskiest). SITTING SCORE: 4
interaction points (committee list; bylaws redirect; one batched 4-question round; join-gate
correction + the board-powers addition folded into the same exchange) — the bylaws redirect
saved a question round that grounded three decisions. Tokens: not self-measurable; log from
/cost before clearing if the number should join the trend ledger.

**FRAGMENTS MIGRATION & DX/CONTRACT HARVEST: SHIPPED TO DEV 2026-07-17 (PR #2, Opus-conducted).
The site runs cairn ^0.87.0 with the fragments concept live. TWO THINGS ARE OPEN AND NEITHER IS
BLOCKING: Geoff's before/after on the one class-b page (/members), and the harvest is DRAFTED BUT
UNFILED (staged in docs/2026-07-17-fragments-harvest-findings.md; paste into cairn-cms's friction
log once its live branch merges, then delete the staging file). The editor seat (E1-E8) is
UNPROBED, NOT CLEAN — it runs when ASC moves to ^0.88.0. Full entry with the probe findings and
the pinned-test inventory: docs/status-archive.md.**

**STILL OPEN ON GEOFF'S QUEUE (pointers; full entries in docs/status-archive.md):** portal
redesign before/after against mock D (shipped to dev, merge 510b266, PR #1); the payments live
smoke (canonical steps docs/plans/2026-07-15-payments-live-smoke.md — before/after on four
public forms, real-browser Turnstile confirm, sandbox dry-smoke, go, key-swap, live smoke,
revert); the five-stop dev walkthrough; the 07-15 apology-send verification.
