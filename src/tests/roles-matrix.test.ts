import { describe, expect, it } from 'vitest';
import { canReach, resolveCapability, type Editor, type Role } from '@glw907/cairn-cms';
import { access, roles } from '$theme/cairn.config.js';

// The T5 drift guard (docs/plans/2026-07-19-asc-roles-adoption.md): reproduces the roles matrix
// (docs/2026-07-18-admin-sidebar-2-design.md "Roles matrix") from the real `access` map and
// `roles` vocabulary, not a hand-copied snapshot. The matrix cells are declared once below, then
// every (role, function) pair is asserted against the live map through `canReach`, so an
// access.ts edit that drifts from the matrix fails at a named cell instead of silently shipping.
// Action-level enforcement (the Email/Announce send-action widening, the Money denial at the
// action) is already covered by src/tests/club-action.test.ts; this file covers reachability of
// the engine screens and club routes themselves.

/** Resolve a role name to the `Editor` shape `canReach` reads, through the real capability lookup
 *  (`resolveCapability`), not a hand-picked capability string. */
function editorOf(role: Role): Editor {
  return { email: `${role}@example.com`, displayName: role, role, capability: resolveCapability(roles, role) };
}

const ADMINISTRATOR = 'Administrator';
const CLUB_MANAGER = 'Club manager';
const WEBMASTER = 'Webmaster';
const PUBLISHER = 'Publisher';
const INSTRUCTOR = 'Instructor';

const ROLES = [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER, PUBLISHER, INSTRUCTOR] as const satisfies readonly Role[];

// The engine screens and club routes pass A enforces (design spec's "Roles matrix", translated
// from its group rows to per-function cells; plan T3 names this exact map). `/admin/club` stands
// in for the section default (every unwidened club action); `/admin/club/email` and
// `/admin/club/announce` are the two deeper keys the Publisher widening overrides.
const FUNCTIONS = [
  'posts',
  'bulletins',
  'notifications',
  'pages',
  'fragments',
  'documents',
  'media',
  'vocabulary',
  'nav',
  'settings',
  '/admin/club',
  '/admin/club/email',
  '/admin/club/announce',
] as const;

// The matrix cell for each function: the roles the spec admits.
// - Administrator: all true (owner capability floor).
// - Club manager: all true (the spec's "all but Admin access" -- its one exclusion is the
//   `editors` engine floor below, not a map cell, so every mapped function here is true).
// - Webmaster: true only for the Website group's mapped functions.
// - Publisher: true only for the Communication group's mapped functions plus the two widened
//   club routes.
// - Instructor: false everywhere (`none` capability).
const ADMITTED: Record<(typeof FUNCTIONS)[number], readonly Role[]> = {
  posts: [ADMINISTRATOR, CLUB_MANAGER, PUBLISHER],
  bulletins: [ADMINISTRATOR, CLUB_MANAGER, PUBLISHER],
  notifications: [ADMINISTRATOR, CLUB_MANAGER, PUBLISHER],
  pages: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER],
  fragments: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER],
  documents: [ADMINISTRATOR, CLUB_MANAGER],
  media: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER, PUBLISHER],
  vocabulary: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER],
  nav: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER],
  settings: [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER],
  '/admin/club': [ADMINISTRATOR, CLUB_MANAGER],
  '/admin/club/email': [ADMINISTRATOR, CLUB_MANAGER, PUBLISHER],
  '/admin/club/announce': [ADMINISTRATOR, CLUB_MANAGER, PUBLISHER],
};

const CASES = FUNCTIONS.flatMap((target) =>
  ROLES.map((role) => ({ role, target, expected: ADMITTED[target].includes(role) })),
);

describe('the roles matrix (drift guard against the real access map)', () => {
  it.each(CASES)('$role reaching $target is $expected', ({ role, target, expected }) => {
    expect(canReach(access, editorOf(role), target)).toBe(expected);
  });

  // The two documented non-map cases (plan constraint 2): neither is a valid `defineAccess` key
  // (`help` is not one of the four fixed engine screens or a concept id; `editors` is the roster
  // screen's own owner-only floor), so neither can appear in the table above -- mapping either
  // would throw at construction. Asserted here so the test states the whole truth the matrix
  // implies, not just what the map itself can express.
  describe('the two non-map cases (engine floor, not map omission)', () => {
    it('admits every editor-capability role to help (unmappable, stays reachable by any editor)', () => {
      for (const role of [ADMINISTRATOR, CLUB_MANAGER, WEBMASTER, PUBLISHER] as const) {
        expect(canReach(access, editorOf(role), 'help')).toBe(true);
      }
    });

    it('denies Instructor (none capability) help too', () => {
      expect(canReach(access, editorOf(INSTRUCTOR), 'help')).toBe(false);
    });

    it('admits only Administrator to editors (canReach special-cases it to the owner-capability floor)', () => {
      expect(canReach(access, editorOf(ADMINISTRATOR), 'editors')).toBe(true);
      for (const role of [CLUB_MANAGER, WEBMASTER, PUBLISHER, INSTRUCTOR] as const) {
        expect(canReach(access, editorOf(role), 'editors')).toBe(false);
      }
    });
  });

  // The phantom `owner` role (T2's reserved-key constraint): never granted to a live session, but
  // still declared, and still resolves owner capability. Lockout-safety property: it passes every
  // check the same as Administrator, including the owner-only `editors` floor and the unmapped
  // `help` target.
  it('the phantom owner role passes every check (owner-capability floor, lockout safety)', () => {
    const owner = editorOf('owner');
    for (const target of [...FUNCTIONS, 'help', 'editors']) {
      expect(canReach(access, owner, target)).toBe(true);
    }
  });
});
