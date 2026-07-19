# Cairn consumer brief: the four sidebar seams (ASC admin-sidebar-2)

> The engine-facing contract for the `admin-sidebar-2` initiative's cairn pass,
> extracted from `docs/2026-07-18-admin-sidebar-2-design.md` (this repo; the ratified
> functional spec and the authority where the two disagree). Written 2026-07-18 from
> the live brainstorm with Geoff. ASC is the named first consumer, per the
> editor-roles precedent (`docs/2026-07-13-cairn-editor-roles-consumer-brief.md`).
> The cairn pass owns every API shape; this brief states consumer requirements and
> acceptance, not designs.

## Context

ASC is reorganizing its admin sidebar into a purpose-first tree (four groups,
collapsed by default, unique icons, action-count badges) over a five-role
plain-function vocabulary (Administrator, Club manager, Webmaster, Publisher,
Instructor). The ruling that shapes the engine work: **roles map to admin
functions; categories are cosmetic.** One permission declaration per function feeds
both enforcement and nav visibility, so the sidebar can never drift from the real
boundary. Four seams follow, sized for one cairn minor release.

Engine surfaces involved today: `src/lib/sveltekit/admin-nav.ts` (NavLayout types
and validation, the bundled icon allowlist re-exported from
`src/lib/components/admin-nav-icons.ts`), `src/lib/components/CairnAdminShell.svelte`
(group rendering, the collapse cookie `cairn-admin-nav-collapsed`), and the concept
editing routes gated today by the single editor capability.

## Seam 1: default-collapsed groups

- A `navLayout` section can declare its default collapsed state (ASC: Club open,
  the other three groups collapsed; possibly two open — still a probe verdict).
- The existing per-user cookie persistence is unchanged and always wins once the
  user has touched a header; the declaration replaces only the current all-open
  starting state, with no flash (the SSR-seeded rendering already in the shell).
- Acceptance: a fresh session (no cookie) renders the declared defaults; a session
  with a cookie renders the cookie's state regardless of declarations.

## Seam 2: icon vocabulary

- The custom-nav icon allowlist widens to cover ASC's 25-glyph assignment (spec,
  "The tree"): today's nine names plus at least `banknote`, `users-round`,
  `shield-check`, `key-round`, `graduation-cap`, `list-ordered`, `send`, `bell`,
  `mail`, `megaphone`, `files`, `image`, `puzzle`, `tags`, `menu`, `file-pen`,
  `settings`, `life-buoy` (all Lucide, already the bundled family).
- An engine screen ref (`{ screen: ... }`) accepts an icon override. Engine-owned
  icons otherwise collide: both dated concepts share `ENGINE_CONCEPT_DATED_ICON`
  (the newspaper), and ASC needs Posts and Bulletins distinct.
- Acceptance: ASC's full assignment validates; an overridden engine ref renders the
  override; an invalid name still fails validation with the allowlist named.

## Seam 3: pending-actions notifications

The outcome is ruled; the idiom is the cairn pass's design call (Geoff, 2026-07-18:
sidebar badges plus an in-admin notification surface, "or really, whatever idiom
works best").

- The site supplies pending-action items from its admin layout load — at minimum a
  count per admin function, ideally enough shape (label, href) for a unified
  surface (shape is the engine's call; ASC's data comes from the same queries as
  its needs-attention strip).
- Required outcome, whatever the idiom: pending actionable work is visible without
  opening anything. A quiet count pill on the matching sidebar item and a summed
  count on a collapsed group's header (a closed category never hides pending work —
  the ruling that motivated the seam); zero renders nothing; counts are announced
  accessibly, not just painted.
- In scope if the pass finds it the better idiom: a notification center in the
  admin shell — pending items across screens in one place, the sidebar pills one
  view of it. Read/unread semantics are the pass's call; ASC's items are
  queue-backed (they clear when the work clears), which may make read-state
  unnecessary.
- Notifications are role-scoped by construction (Geoff, 2026-07-18): the number and
  type of pending items varies with the session's roles, and the engine must
  support that, not assume one shared set. Items resolve per session against the
  permission map; an entry the session cannot reach contributes nothing to any
  count, sum, or list; and counts are treated as information in their own right — a
  role that cannot act on a queue must not learn its size. Nothing about counts may
  be computed once and shared across sessions with different reach, and the seam's
  shape should let the site scope items finer than role where its own model needs
  it (e.g., a committee chair seeing only their committee's pending requests).
- Acceptance: pill on item, summed on collapsed header, absent at zero, gone when
  the group opens (the item pill remains), screen-reader text present; if a
  notification surface ships, it lists exactly the reachable pending items.

## Seam 4: per-concept role gating and derived nav visibility

The load-bearing seam. Today one editor capability unlocks every concept's editing
routes, so ASC's Publisher (posts, bulletins) vs. Webmaster (pages, media, ...)
split — and its Waiver text carve-out to club roles only — cannot be enforced.

- A concept can restrict editing to named site roles, enforced at the engine's
  routes (deny, not hide). Capability remains the floor; the restriction narrows it.
- Nav visibility derives from reachability: an entry renders iff the session can
  reach its function, a group renders iff it has a visible child. This replaces
  declared `roles:` on nav groups and entries (ASC will delete its group-level
  `CLUB_ROLES` gates); site screens' reachability comes from the site's own
  permission map, so the seam needs a way for the site to answer "can this session
  reach this href" for its own entries.
- Deny by default for functions absent from any declaration.
- Acceptance: a Publisher session edits posts and bulletins, is denied pages at the
  route (not merely unlinked), and sees exactly two groups; the ASC roles matrix in
  the spec is reproduced by tests against the permission map.

## Sequencing and release

One cairn minor version carrying all four seams; ASC bumps once and consumes (the
0.86.0 pattern). ASC-side work that waits on it: the tree rewrite, the five-role
vocabulary with the grant-row rename migration, send-action gate widening, badges
wiring. ASC work that does not wait: the probe round (static HTML), the Signups
retirement, the bulletins restoration. DX-harvest note: these four seams ARE the
harvest filed from round 1's icon-reuse compromises, now with scope.
