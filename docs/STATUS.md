# asc-site status

> Rolling status for the Alaska Sailing Club's cairn rebuild: read this file first for
> where the work stands and the immediate next action. Only the CURRENT initiative's
> entries live here, plus the most recent completed initiative while its follow-ups stay
> open; everything older moves to `docs/status-archive.md` (history, never instructions).
> TRIM RULE (Geoff, 2026-07-14): at each session close, when a new entry lands, move
> entries beyond the top two or three to the archive — this file is @-imported into every
> session's context, so its length is a per-session token tax.

**PASS A `asc-roles-adoption` IS SHIPPED TO DEV, THE LIVE GRANT ROWS ARE MIGRATED,
AND MAIN IS GREEN (2026-07-19, Fable-conducted, 5 Sonnet implementer dispatches +
2 reviewers + simplifier + a CI round, commits 7a0f597..ae67e5d, CI run 29707448071
green).** What shipped:

- **cairn `^0.88.0` (installed 0.88.1)**; the bump forced one adaptation (0.88's
  `ResolveNavLayoutOptions.editor` replaced the loose capability/role pair — a breaking
  type change inside an "additive" release, harvested).
- **The five-role vocabulary**: Administrator (owner capability), Club manager,
  Webmaster, Publisher (editor), Instructor (none), plus the engine-forced phantom
  `owner` (declared, never granted; documented on the `defineRoles` block).
  **Migration `migrations/asc-auth/0001_role_rename` APPLIED LIVE post-deploy and
  verified**: both grant rows now read `Administrator`, verify-forward zero rows,
  re-run proven idempotent. Lockout-safe by the canReach owner bypass (owner capability
  short-circuits true), verified against the shipped engine, not assumed.
- **The access map** (`src/theme/access.ts`, a `buildAccess(roles)` factory — the
  guide's two-file pattern is a real ES-module cycle, harvested) implementing the
  spec's roles matrix comprehensively; wired into BOTH `createAuthGuard` and the
  adapter. Publisher picker-trace: no vocabulary/fragments grants needed (closed
  taxonomy, SSR-only pickers — evidence in the map's comments).
- **Enforcement reads the map**: `/admin/club` layout guard adopts `requireAccess`;
  `clubAdminAction` composes `canReach` on the request path (Email/Announce admit
  Publisher via deeper keys, no bespoke branch) and now FAILS CLOSED (audited 500) if
  the map is ever unattached — both reviewers' one substantive finding; ten
  route-action test fixtures had silently exercised canReach's permissive no-map
  fallback and now inject the real map.
- **The matrix drift-guard** (`src/tests/roles-matrix.test.ts`): the spec's matrix
  reproduced from the composed map via one declarative table, mutation-proven
  (a removed cell fails by name). 145 files / 1894 tests, check 0/0, build green.
- **Security gate**: web-auth-security-reviewer — no exploitable defect; path-trick
  sweep of the Publisher widening clean (trailing/dot/percent/case all verified
  against the shipped matcher); phantom-owner grant confers nothing (editors screen
  is owner-gated). cloudflare-workers-reviewer: SQL safe/idempotent, bindings clean.
- **DX harvest**: docs/2026-07-19-roles-adoption-harvest-findings.md (4 findings:
  reserved-owner rename + ManageEditors phantom listing, the access-guide import
  cycle, the changelog's missing `Consumers must:`, the canReach permissive-fallback
  trap for site-side action gates).
- **The CI round (the plan's "baselines untouched" claim was wrong twice, both
  fixed by evidence, not guesswork):** (1) the e2e admin-session helper minted role
  `'owner'` — post-rename that phantom resolves no club nav groups, so the sidebar
  test and rollup baselines broke; it now mints `Administrator` and converges the
  local AUTH_DB replica onto the live shape (cairn's 0001_roles.sql CHECK drop —
  the frozen 0000_auth.sql seed still carries it). (2) The 0.88 engine's own admin
  chrome changed: group headers took the collapse-seam button form (label a few px
  left) and Fragments gained its layers glyph from the widened icon set (it had
  shared the document glyph — the exact collision the seam fixes). Diagnosed from
  CI's own PNGs via the NEW failure-artifact upload in ci.yml (added this round —
  pixel diffs are now diagnosable with evidence); the two 1440 rollup baselines
  re-minted via the update_snapshots dispatch (ae67e5d, exactly 2 files), read and
  verified by the conductor's eyes. Admin chrome only; no member-facing surface
  changed.
- **NEXT: `asc-sidebar-build` (pass B)** — plan docs/plans/2026-07-19-asc-sidebar-build.md;
  OPENS with the probe round for Geoff's still-owed verdicts (open/closed defaults,
  25-icon assignment, within-group order). Resume prompt: "Start pass B: read
  docs/plans/2026-07-19-asc-sidebar-build.md; run its T1 probe round with Geoff first,
  then execute T2–T8." Launch from ~/Projects/aksailingclub-org, fresh session. Pass B
  consumes this pass's map (deletes the round-1 `roles:` nav hints, retires
  `notifications` and its map key). After B: events-redesign, then the review-queue
  clear and mw-cutover per ROADMAP.

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
- **Pass sequencing**: pass A (`asc-roles-adoption`) shipped — the entry above; pass B
  (`asc-sidebar-build`) is next, its resume prompt in that entry.
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
