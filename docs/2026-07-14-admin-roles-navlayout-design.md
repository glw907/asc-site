# Admin roles and navLayout: the initiative-5 design

Ratified by Geoff 2026-07-14, at the initiative-5 brainstorm. This spec covers the collapse of
the site's `club_roles` machinery onto cairn 0.86.0's roles seam, and the sidebar arrangement on
its navLayout seam, as one initiative in two phases (Geoff's sequencing ruling at this
brainstorm). The consumer contract behind phase 1 is
`docs/2026-07-13-cairn-editor-roles-consumer-brief.md`; the engine reference is cairn's
`docs/reference/core.md#roles` and `docs/guides/organize-your-admin-nav.md`. The dependency bump
`^0.84.4` → `^0.86.0` already landed (commit 6af3110) with the mechanical type fallout; this
initiative starts from that green state.

## Phase 1: the role vocabulary and the collapse

### Declare the vocabulary

`defineRoles` lands on the adapter in `src/theme/cairn.config.ts`, the brief's committed
vocabulary exactly:

- `owner` → `'owner'`. The board seat; manages the allowlist.
- `club-admin` → `'editor'`. Committee volunteers; run the club screens and may edit content.
- `instructor` → `{ capability: 'none' }`. Sign-in identity only. It declares no `home`:
  no instructor-reachable screen exists until class-management builds the roster, and the
  engine's signed-in welcome view is the correct landing until then (a `home` pointing at a
  route that answers 403 would be worse).

`src/app.d.ts` gains the `CairnRolesRegister` augmentation, so `locals.editor.role` narrows to
the three declared names everywhere the site reads it.

### Retire the parallel role system

The gate on `/admin/club/*` moves from the `club_roles` table to the typed session:

- The layout guard (`src/routes/admin/club/+layout.server.ts`) checks
  `locals.editor.role` against `'owner'` and `'club-admin'`, with no database read. The check
  names roles, not capability, so a future editor-level role does not silently inherit club
  access.
- `clubAdminAction` (`src/admin-club/lib/club-action.ts`) drops its role query; `ownerOnly`
  checks `editor.capability === 'owner'`. It keeps resolving `CLUB_DB`, which its handlers
  still need.
- `src/admin-club/lib/club-roles.ts` retires: `getClubRole`, `hasAnyClubRole`,
  `listClubRoles`, `setClubRole`, `removeClubRole`, `LastOwnerError`, and the atomic
  last-owner guard all delete (the engine's guard, which counts across `ownerLevelRoles`, is
  now the only one). `resolveClubDb` is shared plumbing (hooks.server.ts, the jobs runner,
  every club screen) and moves to a small `src/admin-club/lib/club-db.ts`.
- The Settings screen (`/admin/club/settings`) loses its grant/revoke section and actions;
  ManageEditors with the full declared vocabulary is the one role-management screen. The
  offer-window setting stays.
- `filterClubNav` and the `navFilter` wiring in `src/chassis/cairn.server.ts` delete in
  phase 2, which replaces them declaratively.

Tests for the guard, the action wrapper, and the settings actions rewrite against the typed
role; the nav-filter test retires with its subject.

### Data migration

Two databases, both changes small and proven on scratch copies first:

- `cairn-asc-auth` (AUTH_DB): apply cairn's `migrations/0001_roles.sql`, which lifts the
  role CHECK constraint to admit the declared names. Both live editor rows already carry
  `owner`; no row updates.
- `asc-club` (CLUB_DB): drop `club_roles` with a real migration (forward, rollback, verify),
  per the schema-evolvability rule. Its single live row (`geoff-login@907.life`, owner) is
  subsumed by that editor row's role.

One flagged behavior delta: `geoff@907.life` holds no `club_roles` grant today, so the collapse
grants it club access by virtue of its `owner` role. Both rows are Geoff's addresses; nothing
real widens. Flagged at the brainstorm and accepted.

## Phase 2: the navLayout tree

The ratified arrangement is the split desk (Geoff's pick from three candidate trees): the six
screens a committee volunteer works routinely lead, the lower-frequency pairs get their own
labeled groups, and configuration sinks to a trailing Site group.

```
CLUB           roles: owner, club-admin
  Overview     /admin/club
  Events       /admin/club/events
  Classes      /admin/club/classes
  Signups      /admin/club/signups
  Members      /admin/club/members
  Money        /admin/club/money
OUTREACH       roles: owner, club-admin
  Email        /admin/club/email
  Announce     /admin/club/announce
BOATS & GEAR   roles: owner, club-admin
  Assets       /admin/club/assets
  Requests     /admin/club/asset-requests
CONTENT
  Posts        { screen: 'posts' }
  Bulletins    { screen: 'bulletins' }
  Pages        { screen: 'pages' }
  Notifications { screen: 'notifications' }
SITE
  Library        { screen: 'media' }
  Tags           { screen: 'vocabulary' }
  Club settings  /admin/club/settings   roles: owner, club-admin
  Site settings  { screen: 'settings', label: 'Site settings' }
  Editors        { screen: 'editors' }
  Help           { screen: 'help' }
```

The tree replaces `adminNav: [clubAdminNav]` in the adapter's editor group. Site entries keep
their current icons; engine references keep engine-owned icons and hrefs. The two settings
screens carry distinct labels in one group, resolving the duplicate-Settings collision the
cairn guide names. Every engine screen is referenced (the site configures no navMenu, so there
is no `nav` screen), which keeps the fallback foot group empty today and makes any future
engine screen surface there visibly instead of vanishing.

Role visibility on the tree is courtesy, not authorization: the layout guard and action
wrapper from phase 1 remain the enforcement. An instructor session (none capability) sees no
engine entries (the shell drops them) and no club sections (the `roles` gates), which is the
correct empty sidebar until a roster screen exists.

## Verification and acceptance

- The full mechanical gate per task: `npm run check` at 0 errors and 0 warnings, `npm test`,
  `npm run build`. The e2e pixel suite covers the public site; the sidebar is admin-only, so
  no baseline churn is expected, and any baseline change is a stop-and-look signal.
- The collapse is auth-critical: the `web-auth-security-reviewer` agent reviews the phase-1
  diff, and cairn-doctor's role checks (`auth.role-vocabulary`, `auth.email-normalization`)
  run against the config.
- Migrations prove on scratch databases before either live apply.
- Live verification on dev follows cairn's guide: sign in and confirm each role sees exactly
  its sections in the declared order, and that a directly typed club URL still refuses a
  session without a club role.
- Geoff's dev walkthrough is the acceptance gate for the sidebar arrangement. The apex is
  untouched, per the deploy story.

Execution ruling (Geoff, 2026-07-14, at spec time): the full implementation and the dev
publish run by workflow in this session, and the pass keeps a running log of DX or
site-contract deficiencies met along the way, filed back to cairn per the harvest pattern.

## Non-goals

No per-screen permissions, no instructor surface (class-management's scope), no changes to
member-scale auth (`member_tokens`, `member_sessions`, `/my-account`), no EVENTS_DB reads
touched, and no role UI in this site (ManageEditors is the engine's).
