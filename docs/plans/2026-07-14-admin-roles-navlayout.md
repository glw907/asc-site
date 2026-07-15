# Admin roles + navLayout implementation plan (initiative 5)

> Executes `docs/2026-07-14-admin-roles-navlayout-design.md`. Per the workstation doctrine,
> tasks specify outcomes, constraints, and acceptance criteria, not implementation code.
> Execution: by workflow this session (Geoff's ruling at spec time), sequential implementer
> dispatches (tasks 1-5 share files; one executor in the repo at a time), then the review
> fan-out. Live database applies, the dev deploy, and verification stay with the conductor
> (the "Conductor-owned close" section), never inside the workflow.

**Goal:** collapse `club_roles` onto cairn 0.86.0's roles seam and declare the split-desk
navLayout sidebar, leaving the engine as the only role system.

**Stack:** SvelteKit 2 + Svelte 5, cairn-cms 0.86.0, Cloudflare Workers + D1, vitest.

## Global constraints

- Gate for every task: `npm run check` at 0 errors / 0 warnings, `npm test` all green,
  `npm run build` green. Run all three before reporting done; paste output tails.
- Each task commits its own diff (imperative conventional-commit subject,
  `Co-Authored-By: Claude <noreply@anthropic.com>` footer), specific files only.
- TSDoc/svelte comment standards apply (ts-conventions); no em dashes in comments.
- Behavior parity except where the spec names a change. The spec's flagged delta
  (geoff@907.life gains club access via its owner role) is accepted; introduce no other.
- Report any DX or contract friction met in cairn 0.86.0's seams (unclear docs, missing
  types, awkward APIs) in a **DX notes** section of your final report, even when empty.
- Never touch `EVENTS_DB`, member auth (`member_tokens`/`member_sessions`), or live D1.

---

### Task 1: declare the role vocabulary

**Files:**
- Modify: `src/theme/cairn.config.ts` (the adapter), `src/app.d.ts`
- Test: create `src/tests/roles-vocabulary.test.ts`

**Outcome:** the adapter declares the brief's vocabulary via `defineRoles`, exported as
`roles` from `cairn.config.ts` and wired as the adapter's `roles` member:
`owner: 'owner'`, `'club-admin': 'editor'`, `instructor: { capability: 'none' }` — instructor
declares **no `home`** (design §phase 1). `src/app.d.ts` augments `CairnRolesRegister` with
`typeof roles` (cairn's `docs/guides/give-a-role-its-own-admin-area.md` shows the exact
augmentation), so `Role` narrows to the three names.

**Produces (later tasks rely on):** `import { roles } from '$theme/cairn.config.js'`;
`locals.editor.role` typed `'owner' | 'club-admin' | 'instructor'`;
`locals.editor.capability` resolving owner/editor/none respectively.

**Acceptance:** the new test asserts, via cairn's `resolveCapability`, that the three names
map to owner/editor/none and that an undeclared name maps to none. `npm run check` proves the
augmentation (no widening back to `'owner' | 'editor'`). Full gate green. Commit.

### Task 2: collapse the club gate onto the typed session

**Files:**
- Create: `src/admin-club/lib/club-db.ts`
- Modify: `src/admin-club/lib/club-roles.ts`, `src/admin-club/lib/club-action.ts`,
  `src/routes/admin/club/+layout.server.ts`, `src/hooks.server.ts`, `src/jobs/runner.ts`,
  plus every file importing `resolveClubDb` from `club-roles` (grep for it; the club route
  `+page.server.ts` files and `club-email.ts` reference it in comments or imports)
- Test: `src/tests/club-layout-guard.test.ts`, `src/tests/club-action.test.ts`

**Outcome:** `resolveClubDb` moves verbatim (doc comment included) to the new `club-db.ts`;
every importer points there; `club-roles.ts` no longer exports it. The layout guard drops its
D1 read: it 403s unless `locals.editor.role` is `'owner'` or `'club-admin'` (explicit role
names per the design, not capability), and returns `{}` — the `clubRole` layout data retires
(no consumer outside tests). `clubAdminAction` drops its role query and the `clubRole` field
from `ClubActionContext` (only a test consumed it): the precondition becomes role in
(`'owner'`, `'club-admin'`) for routine actions and `editor.capability === 'owner'` for
`ownerOnly`, read from the engine-verified `ctx.editor`; `CLUB_DB` resolution and the audited
fail-closed paths (500 on missing binding, 403 on refused role) stay exactly as they are.

**Interfaces produced:** `club-db.ts` exports
`resolveClubDb(env: unknown): D1Database | undefined`. `ClubActionContext` is
`AdminActionContext & { db: D1Database }`.

**Acceptance:** guard tests cover all three roles plus an undeclared-role session (owner and
club-admin pass; instructor and unknown 403). Action-wrapper tests cover routine and
`ownerOnly` paths per role, and the missing-binding 500. No file imports `getClubRole`
outside `club-roles.ts` and the Settings screen (Task 3's surface). Full gate green. Commit.

### Task 3: retire the Settings role management

**Files:**
- Modify: `src/routes/admin/club/settings/+page.server.ts`, its `+page.svelte`
- Test: `src/tests/club-settings-actions.test.ts`

**Outcome:** the grant/revoke section and its actions delete — ManageEditors with the
declared vocabulary is the one role-management screen. The offer-window setting and its
owner-only action stay. The screen's load no longer calls `listClubRoles`/`getClubRole`; its
remaining owner-only affordance keys off `locals.editor.capability`. Point the person at the
engine: where the removed section sat, a single sentence links role management to
`/admin/editors` (Microsoft-style editor copy, one line, no ceremony).

**Acceptance:** settings tests keep covering the offer-window action (owner passes,
club-admin refused) and drop the grant/revoke suites. No file outside `club-roles.ts` imports
`listClubRoles`, `setClubRole`, `removeClubRole`, or `LastOwnerError`. Full gate green. Commit.

### Task 4: the navLayout tree

**Files:**
- Modify: `src/theme/cairn.config.ts`, `src/chassis/cairn.server.ts`
- Delete: `src/admin-club/lib/club-roles.ts`, `src/tests/club-nav-filter.test.ts`
- Test: create `src/tests/nav-layout.test.ts`

**Outcome:** the adapter's editor group replaces `adminNav: [clubAdminNav]` (and the
`clubAdminNav` export) with the spec's split-desk `navLayout` tree, verbatim from design
§phase 2: Club (Overview, Events, Classes, Signups, Members, Money), Outreach (Email,
Announce), Boats & Gear (Assets, Requests) — each `roles: ['owner', 'club-admin']` — then
Content (`posts`, `bulletins`, `pages`, `notifications` engine refs), then Site (`media`,
`vocabulary`, the Club-settings site entry labeled `Club settings` gated to the same two
roles, `{ screen: 'settings', label: 'Site settings' }`, `editors`, `help`). Site entries
keep their current icons from `clubAdminNav`. `cairn.server.ts` drops the `navFilter` option
and the `filterClubNav` import; `club-roles.ts` (by now holding only dead exports) deletes
with its test.

**Acceptance:** `nav-layout.test.ts` proves the tree through cairn's own `resolveNavLayout`:
an owner resolves all five groups; a club-admin the same; an instructor resolves no club
groups and no engine screens; every engine screen is referenced so `fallback` is empty. Build
green proves construction-time validation passes. No `filterClubNav`/`navFilter`/
`clubAdminNav` references remain anywhere. Full gate green. Commit.

### Task 5: the club_roles drop migration, scratch-proven

**Files:**
- Create: `migrations/asc-club/0026_drop_club_roles/{forward,rollback,verify}.sql`

**Outcome:** the directory follows the repo's migration pattern (0025 is the exemplar).
Forward drops `club_roles`; rollback recreates it exactly as migration 0001_substrate
declared it (schema copied from that migration, not from memory) and restores the single
live row, whose values the conductor read live at plan time: email `geoff-login@907.life`,
role `owner`, granted_by `system`, granted_at `2026-07-07 08:29:01`; verify proves the
table's absence (forward) and its exact row (rollback). Prove the full cycle on a local D1
copy (`npx wrangler d1 execute asc-club --local`): apply 0001_substrate's club_roles DDL plus
the seed row, run forward, verify, rollback, verify, forward again. Also prove cairn's
`node_modules/@glw907/cairn-cms/migrations/0001_roles.sql` applies cleanly to a local copy of
the auth schema (`0000_auth.sql` then `0001_roles.sql`) and that an `INSERT` of a
`club-admin` row succeeds after it. Do NOT touch either remote database.

**Acceptance:** the scratch transcript (commands and outputs) in the report; both cycles
clean. Full gate green (unchanged code, but run it). Commit the migration directory.

### Task 6: review fan-out (workflow, parallel, prose reports)

Three reviewers over the whole pass diff (`git diff <pre-pass-commit>..HEAD`), each returning
a prose findings report (never structured-output schemas — the initiative-4 lesson):
`web-auth-security-reviewer` (mandated by the spec: the collapse is auth-critical; special
attention to the guard's fail-closed paths, the ownerOnly capability check, and the retirement
of the site-side last-owner guard in favor of the engine's), `svelte-reviewer` (the settings
screen edit, the config changes), `cloudflare-workers-reviewer` (the migration SQL, D1 usage,
bindings). The conductor triages findings and dispatches fixes before the close.

## Conductor-owned close (never in the workflow)

1. Triage review findings; dispatch fixes; re-gate.
2. `code-simplifier` over the pass diff; apply; re-gate.
3. Push. Deploy to dev manually (`npx wrangler deploy`), smoke: home 200, `/admin` 303.
4. Live D1, in this order: apply cairn's `0001_roles.sql` to `cairn-asc-auth` (additive,
   safe while the old code path is gone from the deployed worker); verify with a
   `club-admin` insert + delete round-trip. Only after the new deploy is verified serving,
   apply `0026_drop_club_roles` forward to `asc-club`; run its verify.
5. Render read of the dev admin sidebar with a minted session (the STATUS session-recipe),
   confirming the guide's verify steps per role. cairn-doctor role checks.
6. STATUS + ROADMAP + effort-memory updates; the DX-notes aggregation (all tasks' reports)
   into the close entry, filed for the cairn harvest.
7. Geoff's walkthrough remains the sidebar acceptance gate; the apex is untouched.
