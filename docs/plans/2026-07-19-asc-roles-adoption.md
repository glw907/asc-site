# ASC roles and access adoption — plan (2026-07-19, pass A)

Executes the roles and security half of `docs/2026-07-18-admin-sidebar-2-design.md` (read it
first; its **Roles matrix**, **Security model**, and decision 8 govern every task here) against
cairn `0.88.0`'s shipped access seam. This is **pass A of two** (Geoff's ruling 2026-07-19:
roles/security first, sidebar second). Pass A lands the five-role vocabulary with **real
enforcement**: the dependency bump, the renamed `defineRoles` vocabulary plus its grant-row
migration, the `defineAccess` permission map implementing the matrix exactly, `requireAccess`/
`canReach` adoption on the site's own `/admin/club` routes, the Publisher widening of the
Email/Announce send actions, and a test that reproduces the matrix from the map.

**Out of scope (pass B, `docs/2026-07-18-admin-sidebar-2-design.md` owns it):** any `navLayout`
tree change — regrouping, relabels, icon assignment, collapsed defaults, attention/badge wiring,
the Signups retirement, the bulletins re-unification, the two new class surfaces. Pass A leaves
the round-1 tree structurally as-is. **Pass B depends on pass A**: nav visibility derives from the
map this pass declares (`resolveNavLayout` reads `canReach`), so the map must exist and be correct
before the tree is rewritten.

Nothing in pass A changes what a rendered admin page looks like for the current sessions (the two
live grant rows are owner-capability, and owner passes every `canReach` check), so the visual e2e
suite and its baselines are untouched; pass B owns the nav's visual change.

## The three constraints 0.88.0 forces (verified against the shipped package, not assumed)

Each is cited to `@glw907/cairn-cms` `0.88.0` (`CHANGELOG.md`, the `0.88.0` entry) or to the
role/access source it ships. These shape the tasks; an implementer who skips them will write a map
that throws at composition or a rename that fails at construction.

1. **`defineRoles` reserves and hard-requires the `owner` key.** `defineRoles` throws
   `"the reserved 'owner' role must be declared"` when the vocabulary lacks an `owner` key, and
   `"'owner' must map to owner capability"` otherwise (`src/lib/auth/roles.ts`, the validation
   `defineRoles` has carried since the roles seam shipped, unchanged in `0.88.0`). So the spec's
   literal "rename `owner`" is **not** achievable — the vocabulary must keep an `owner: 'owner'`
   entry. The escape the engine documents: `ownerLevelRoles` "lists every name mapped to owner
   capability, the set the last-owner guard counts across instead of the literal `'owner'` string"
   (`docs/reference/core.md`), so a vocabulary with **two** owner-capability names (`owner` plus
   `Administrator`) is safe, and the migrated grant rows read `Administrator`. T2 resolves this; the
   phantom `owner` is a DX-harvest finding.
2. **The access map keys only concept ids and four fixed engine screens.**
   `ACCESS_FIXED_SCREENS = ['media', 'vocabulary', 'nav', 'settings']` (`src/lib/sveltekit/
   admin-nav.ts`), joined with the site's declared concept ids, are the only valid screen-id keys;
   any other screen-id key throws at composition. Consequences the map must respect: **`help`
   cannot be gated** (it is not a fixed screen and not a concept — it stays reachable by any
   editor-capability session, so the matrix's "Publisher excluded from Help" is not enforceable and
   is documented as such), and **`editors` (Admin access) is owner-only by engine floor** —
   `canReach` special-cases it (`target === 'editors'` stays owner-only regardless of the map,
   `src/lib/auth/access.ts`), which is exactly the matrix's "Administrator only / Club manager
   excluded," so it is never mapped.
3. **cairn's real default is "absent = open," the inverse of the spec's stated deny-by-default.**
   The `0.88.0` changelog is explicit: "A site that declares no map sees no behavior change," and
   `canReach` returns `true` for a screen or href target with no matching rule (any
   editor-capability session reaches it). The spec's security-model point 2 ("a function absent
   from the map is reachable by no one") is therefore realized only by **mapping every function
   comprehensively** so nothing is absent. T3 enumerates every engine screen and every club route;
   the plan's acceptance for T3 is that no reachable admin function is left unmapped.

## The 0.88.0 seams this pass leans on (each cited)

All from the `0.88.0` `CHANGELOG.md` "Added" entry, first bullet: `defineAccess(roles, map)`, the
`canReach`/`hasAccessRule` authority functions, the guard's `requireAccess` helper, the adapter's
`access` member and `createAuthGuard`'s `access` option (the two-places wiring), the
`resolveNavLayout` nav-visibility derivation from the same `canReach`, and the `auth.access.denied`
log event. `requireAccess(event, target?)` and `createAuthGuard({ roles?, access? })` signatures
are `docs/reference/sveltekit.md`; the guard attaches the resolved map to `locals.cairnAccess`, and
`canReach` is exported directly for conditional checks. `defineRoles`, `resolveCapability`, and
`ownerLevelRoles` are the **pre-existing** roles seam (already consumed by this site), not new
`0.88.0` surface. Pass A uses none of `NavLayoutSection.collapsed`, `NavLayoutEngineRef.icon`, the
widened icon allowlist, or the `attention` dependency — those are pass B.

## Reviewer gates

`web-auth-security-reviewer` is the named security gate and runs before the pass closes (T5). The
standard mechanical gate (`npm run check` 0/0, `npm test`, `npm run build`) runs per task. The
`code-simplifier` agent runs over the changed code before the commit, per the workstation git
convention. No visual/e2e gate applies (pass A alters no rendering).

---

## T1 — Bump the cairn dependency to `^0.88.0`

Outcome: `package.json` moves `@glw907/cairn-cms` from `^0.87.0` to `^0.88.0`, the lockfile
updates, and the tree is green on the bare bump with no roles work yet — the clean baseline every
later task builds on.

Constraints: `0.88.0` is additive (changelog: "every addition above is additive, and a site that
declares none of it sees no behavior change" and "No `Consumers must:` action"). The one behavior
change in the window that could bite, the `0.87.0` embedded-concept enforcement, is already
consumed by this site (its embedded concepts are declared deliberately). Do not touch any source
in this task; if `check`/`build` surfaces a real fallout, that is a finding to report, not to
paper over.

Acceptance: `npm install` clean; `npm run check` 0 errors / 0 warnings; `npm test` green;
`npm run build` green — all on the bump alone.

## T2 — The five-role vocabulary and the grant-row rename migration

Outcome: `src/theme/cairn.config.ts`'s `defineRoles` declares the plain-function vocabulary —
`Administrator` (owner capability), `Club manager` (editor), `Webmaster` (editor), `Publisher`
(editor), `Instructor` (`{ capability: 'none' }`) — **plus the reserved `owner: 'owner'` entry that
`defineRoles` requires** (constraint 1). An auth-store migration renames the live grant rows in the
`editor` table of `AUTH_DB` (`cairn-asc-auth`): `owner` → `Administrator`, and any `club-admin` →
`Club manager` (the live table today holds two `owner` rows and no `club-admin` rows, verified
2026-07-19; the migration is written general so a later `club-admin` grant would also carry
forward). `CLUB_ROLES` (`src/admin-club/lib/club-db.ts`) updates to `['Administrator', 'Club
manager']`. `src/app.d.ts`'s `CairnRolesRegister` augmentation follows `typeof roles`
automatically. The stale role-name references in comments/docstrings (`hooks.server.ts`,
`club-action.ts`, `cairn.config.ts`, `+layout.server.ts`) are swept to the new names.

Constraints:
- **The `owner` name stays declared and un-granted.** It is a phantom the engine forces; document
  why in the `defineRoles` block's comment, and file a DX-harvest finding (cairn `defineRoles`
  should let a site rename or display-label the reserved owner). The last-owner guard is safe:
  `ownerLevelRoles` = `{owner, Administrator}`, and the migrated `Administrator` rows are counted
  (constraint 1).
- **Verify the `ManageEditors` grant UI's treatment of the phantom `owner`.** If the engine's
  editors screen lists every vocabulary name as grantable, `owner` will appear alongside
  `Administrator` as a second owner-level option — a confusing-but-harmless wart. Record the
  observed behavior; if it is unacceptable in the roster UI, the fallback (keep `owner` as the role,
  document "Administrator" as its display name only, drop the owner-row migration) is the escape
  hatch, but T2's default path is the rename.
- **Deploy ordering is lockout-safe by construction and must stay that way.** Because `owner`
  remains declared, `resolveCapability('owner')` still returns `'owner'` after the code deploys, so
  the pre-migration live rows keep working; and `Administrator` is declared before any row reads it.
  The order is: land the code (both names valid), then apply the row migration. Never a window where
  a live row's role name is absent from the vocabulary (`resolveCapability` fails such a row closed
  to `'none'`).
- **The migration follows the repo's scratch-proven discipline** (`migrations/asc-club/`'s
  forward/rollback/verify-forward/verify-rollback pattern, applied to the live database, per
  `CLAUDE.md`'s "`AUTH_DB` … takes migrations normally"). It is a data `UPDATE`, not a schema
  change: the live `editor` table carries **no** role `CHECK` constraint (verified 2026-07-19 —
  cairn's `0001_roles.sql` dropped it; the repo's stale `migrations/0000_auth.sql` still shows the
  old `CHECK (role IN ('owner','editor'))` and is a frozen seed, not the live shape). Place the
  migration consistent with the repo's conventions and leave the `0000_auth.sql` seed untouched.

Acceptance: `roles-vocabulary.test.ts` updated to the new vocabulary and green (each name resolves
to its declared capability; `Administrator` and the reserved `owner` both resolve owner capability;
`Instructor` resolves `none`); the live `editor` rows read `Administrator` after apply; sign-in
still resolves for a migrated row (verify against the live row or a seeded fixture); the migration's
verify-forward and verify-rollback both pass on scratch before live apply; `npm run check`/`test`/
`build` green.

## T3 — The `defineAccess` permission map and its two-places wiring

Outcome: a single site-side access module (its own file, imported twice, the pattern `roles`
follows) declaring `defineAccess(roles, map)` — the comprehensive map that implements the roles
matrix exactly — wired onto **both** `createAuthGuard({ roles, access })` in `src/hooks.server.ts`
and the `access` member of `defineAdapter` in `src/theme/cairn.config.ts`. Wiring it into the guard
enforces every engine content screen immediately and makes `resolveNavLayout` derive nav visibility
from the same `canReach`, with no nav-tree edit.

The map (role names are T2's; `[…]` is the admitted set):
- Engine concept screens: `posts`, `bulletins`, `notifications` → `[Administrator, Club manager,
  Publisher]` (Communication); `pages`, `fragments` → `[Administrator, Club manager, Webmaster]`
  (Website); `documents` → `[Administrator, Club manager]` (**the Waiver-text carve-out**).
- Fixed engine screens: `media` → `[Administrator, Club manager, Webmaster, Publisher]` (Publisher
  is admitted for the **media-picker landmine** — Publisher edits `posts`, which carry an `image`
  field, and the concept editor's own picker calls the `media` routes; the cairn access guide names
  this exact case); `vocabulary`, `nav`, `settings` → `[Administrator, Club manager, Webmaster]`.
- Site routes (deepest-path-segment-prefix matching): `/admin/club` → `[Administrator, Club
  manager]` (covers the whole club section including its dynamic children); `/admin/club/email` and
  `/admin/club/announce` → `[Administrator, Club manager, Publisher]` (**the Publisher widening**,
  deeper keys overriding the section default).
- **Not mapped, by constraint 2:** `help` (unmappable; stays reachable by any editor — documented),
  `editors` (owner-only engine floor = Administrator).

Constraints:
- **Comprehensiveness is the acceptance bar** (constraint 3): every engine screen keyable and every
  reachable club function appears, so cairn's "absent = open" default never silently governs a real
  ASC function. `notifications` is mapped for the pass-A window even though pass B retires it, so
  Webmaster never transiently reaches it.
- **Verify the picker/inline-create cross-screen dependencies for Publisher**, the generalization of
  the media landmine. `posts` uses a `creatable`, `taxonomy` `tags` multiselect and can `::include`
  fragments; confirm at the running editor whether inline tag creation calls `vocabulary` routes and
  whether the include-picker calls `fragments` routes for a Publisher session. Where a picker
  actually breaks, grant Publisher read-access to that screen and document it as a deliberate
  exception (the guide's pattern); where it does not, leave the screen Webmaster-only. Record the
  verified outcome either way — do not grant speculatively.
- **The map is the single source of role truth from here.** `defineAccess` validates at
  construction (bad role name, empty list, malformed key) and again at composition (screen-id
  existence, href collision with a built-in route); a throw is a finding, not a key to delete.

Acceptance: the adapter composes and the guard loads (both wirings present — a map on only one is a
silent misconfiguration the cairn guide warns of); `npm run check`/`test`/`build` green; `canReach`
spot-checks in a unit test confirm the carve-out (`documents` denies Publisher/Webmaster) and the
widening (`/admin/club/email` admits Publisher, `/admin/club` denies it). Full matrix coverage is
T5.

## T4 — Adopt `requireAccess`/`canReach` on the site's `/admin/club` routes

Outcome: the site's own club surface reads the map instead of the hardcoded `CLUB_ROLES` array, so
enforcement and the map cannot drift. Two edits:
- **The section layout guard** (`src/routes/admin/club/+layout.server.ts`) adopts `requireAccess`,
  which reads `locals.cairnAccess` for the request path and 403s a session the map does not name.
  Because `/admin/club` is mapped (T3), `hasAccessRule` is satisfied for every child path (including
  the Email/Announce children whose deeper keys admit Publisher), so no club path hits
  `requireAccess`'s fail-closed unmatched-path branch.
- **`clubAdminAction`** (`src/admin-club/lib/club-action.ts`) **composes** `canReach`, it does not
  collapse into `requireAccess`. Decision and why: `clubAdminAction` carries responsibilities
  `requireAccess` has no notion of — resolving the `CLUB_DB` binding, the per-editor admin
  rate-limit, an audited denial that reads the same as the write it refused, and injecting the `db`
  handle into the handler `ctx`; and it runs inside a form action (POST), not a load. So it keeps
  that machinery and swaps only its **role decision**: `CLUB_ROLES.includes(ctx.editor.role)`
  becomes `canReach(event.locals.cairnAccess, ctx.editor, event.url.pathname)`. This makes the map
  the single source: a POST to `/admin/club/email/*` or `/admin/club/announce/*` now admits
  Publisher through the deeper map keys with no per-action role list, while every other club POST
  stays `[Administrator, Club manager]` through the `/admin/club` key. `opts.ownerOnly` is
  unchanged — it remains the owner-**capability** floor (`ctx.editor.capability === 'owner'`), which
  after T2 means Administrator, and it stacks on top of the `canReach` role check for the few
  owner-only club actions (Settings' role-management and offer-window writes).

Constraints: the Email and Announce screens' send actions must admit Publisher and only Publisher
among the new roles (Webmaster/Instructor stay denied); this falls out of the map + composed
`canReach` with no bespoke branch, which is the point. Deny at the route, never merely hide: the
denial is a real 403 from the layout/action, not an unlinked nav item. `CLUB_ROLES` stays exported
from `club-db.ts` for the round-1 `navLayout`'s remaining `roles:` visibility hints (pass B removes
those and may retire the constant); after this task its only readers are those nav hints — the
enforcement paths read the map.

Acceptance: denial tests (vitest, the `club-action.test.ts` pattern) prove a Publisher session
reaches the Email and Announce send actions and is **denied** a representative other club action
(e.g. Money) at the action, not merely unlinked; a Club manager and Administrator reach all;
Webmaster and Instructor are denied the send actions; the layout guard 403s a mapped-out session
for a club path. `npm run check`/`test`/`build` green.

## T5 — The roles-matrix test and the security gate

Outcome: a test that **reproduces the spec's roles matrix from the map** so the spec's summary and
the deployed truth stay identical (the spec's own requirement: "the pass should generate or test it
against the map"). For each role × each admin function the matrix names, the test asserts
`canReach(access, editorOf(role), target)` equals the matrix cell — driven off the one `access`
value, not a hand-copied second table. The two documented non-map cases are asserted explicitly so
the test states the whole truth: `help` is reachable by every editor-capability role (ungated,
constraint 2), and `editors` is reachable only by Administrator (owner-only floor). Then
`web-auth-security-reviewer` runs over the roles/access surface before the pass closes.

Constraints: the matrix test reads the real `access` map and the real `roles` vocabulary, so a
future map edit that drifts from the matrix fails the test — the drift guard is the deliverable, not
a snapshot. Fold in (or reference) T4's denial tests so the send-action widening is covered by the
same gate. `web-auth-security-reviewer`'s findings are triaged and applied (or explicitly declined
with reasoning) before commit; the security review is the named gate, not advisory.

Acceptance: the matrix test green and demonstrably tied to the map (mutating a map cell flips the
matching assertion — prove it once before trusting it); `web-auth-security-reviewer` run and its
findings resolved; `code-simplifier` run over the changed code; the full mechanical gate (`check`
0/0, `test`, `build`) green; the pass ships to dev on push to `main` (a dev deploy, not the apex).

## Sequencing note for pass B

Pass B (`docs/2026-07-18-admin-sidebar-2-design.md`, the nav tree) consumes this map: it deletes the
round-1 group-level `roles:` hints, lets `resolveNavLayout` derive visibility from `canReach`, and
wires the `attention` badges — all against the `access` value this pass declares. It also owns the
`notifications` retirement, at which point that map key is removed.
