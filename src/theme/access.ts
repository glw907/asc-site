// The site's access map (docs/plans/2026-07-19-asc-roles-adoption.md T3): which of the five
// plain-function roles (cairn.config.ts's own `roles` vocabulary) may reach each admin screen and
// site route. `canReach`/`hasAccessRule` are the one authority the guard, the nav resolver, and
// any custom route's `requireAccess` call all read; a target this map stays silent on falls back
// to cairn's zero-config default (any editor-capability session reaches it, per the `0.88.0`
// changelog: "a site that declares no map sees no behavior change"). The map below is written to
// leave nothing reachable silent (constraint 3 in the plan above), so that default never quietly
// governs a real ASC admin function.
//
// **Not mapped, by constraint 2 (the engine's own fixed floors):** `help` (not one of
// `ACCESS_FIXED_SCREENS`, so the map cannot key it; it stays reachable by any editor-capability
// session, undocumented in the matrix as unenforceable) and `editors` (`canReach` special-cases
// `target === 'editors'` to owner-capability only, regardless of the map, so mapping it would be
// dead code -- this already realizes the matrix's "Administrator only" cell for the Admin access
// screen).
//
// `buildAccess`, not a bare `export const access = defineAccess(roles, {...})`: the latter is the
// cairn access guide's own worked pattern (`roles` imported directly into this module from
// `cairn.config.ts`, the same file `roles` already flows out to its other consumers), and it
// deadlocks here. `roles` is declared inside `cairn.config.ts`, and this module's `access` value
// is in turn imported back into `cairn.config.ts` for `defineAdapter`'s `access` member -- a
// two-file import cycle where each side needs the other's live binding at its own module's top
// level. Confirmed with a minimal Node ESM reproduction of the exact two-file shape: it throws
// `ReferenceError: Cannot access 'roles' before initialization` at module load, not a
// `defineAccess:`-prefixed validation error, so the plan's "a throw is a finding to report, not a
// key to delete" (which covers a bad map) does not apply -- this is a structural cycle, not a
// validation failure. DX-harvest finding: the access guide's own `cairn.access.ts`/`cairn.config.ts`
// two-file snippet is exactly this shape, and crashes any site that declares `roles` inside
// `cairn.config.ts` (as the roles guide itself directs) and follows the access guide's snippet
// literally.
//
// The fix: this module exports a factory over the map instead of the map itself. `cairn.config.ts`
// calls it once, right after `roles` is declared there, so `defineAccess`'s own construction-time
// validation still runs against the real vocabulary -- just from that call site instead of this
// file's top level -- and `cairn.config.ts` re-exports the one resulting `access` value, the same
// "declared once in cairn.config.ts, consumed everywhere through it" path `roles` itself already
// takes to its other consumers (hooks.server.ts, app.d.ts, and the vitest files that import it).
import { defineAccess, type AccessMap, type RolesDeclaration } from '@glw907/cairn-cms';

/**
 * Build the site's access map against a live role vocabulary. Called once, from `cairn.config.ts`
 * (see the module comment above for why this is a factory rather than a top-level constant).
 */
export function buildAccess(roles: RolesDeclaration): AccessMap {
  return defineAccess(roles, {
    // Communication (roles matrix): publish-and-notify is Publisher's whole remit.
    posts: ['Administrator', 'Club manager', 'Publisher'],
    bulletins: ['Administrator', 'Club manager', 'Publisher'],
    // Website (roles matrix): Publisher gets no access to Pages -- an explicit exclusion, not an
    // oversight (design decision 8).
    pages: ['Administrator', 'Club manager', 'Webmaster'],
    fragments: ['Administrator', 'Club manager', 'Webmaster'],
    // The Waiver-text carve-out (roles matrix, and the security model's own worked example):
    // legal text is Administrator/Club manager only regardless of which nav group it sits in.
    documents: ['Administrator', 'Club manager'],
    // The media-picker landmine (the cairn access guide's own name for it): restricting `media`
    // restricts the routes the concept editor's own image picker calls too, so any role that edits
    // an image-bearing concept needs `media` reachable or its picker breaks. Publisher edits
    // `posts`, which carries an `image` field, so Publisher is admitted here for that reason alone
    // (Publisher cannot edit `pages`, the map's other image-bearing concept). Traced the plan's two
    // named cross-screen dependency candidates and found neither applies to this site (see the
    // header comment above the map for the evidence): posts' `tags` field is `taxonomy: true`, and
    // this site declares a tag vocabulary (site.config.yaml), so `closeTaxonomyField`
    // (content/taxonomy-enforce.js) always overrides it to a closed, non-creatable checkbox picker
    // built from `editFields`/`data` the edit load already returns -- there is no inline
    // tag-creation affordance, let alone a client call to `vocabulary` routes, so Publisher needs
    // no `vocabulary` grant. The fragment include-picker's `fragmentTargets` are likewise resolved
    // entirely inside the editing concept's own `editLoad` (content-routes-core.js reads the
    // fragment bodies straight off the backend), never through the `fragments` screen's own routes,
    // so Publisher needs no `fragments` grant either.
    media: ['Administrator', 'Club manager', 'Webmaster', 'Publisher'],
    vocabulary: ['Administrator', 'Club manager', 'Webmaster'],
    nav: ['Administrator', 'Club manager', 'Webmaster'],
    settings: ['Administrator', 'Club manager', 'Webmaster'],
    // Club (roles matrix): the section default every /admin/club/** path inherits unless a deeper
    // key overrides it, per `canReach`'s deepest-path-segment-prefix match.
    '/admin/club': ['Administrator', 'Club manager'],
    // The Publisher widening (roles matrix: Communication includes Email and Announce).
    '/admin/club/email': ['Administrator', 'Club manager', 'Publisher'],
    '/admin/club/announce': ['Administrator', 'Club manager', 'Publisher'],
  });
}
