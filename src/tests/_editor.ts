// A test-only `Editor` builder for the roles/access suites (access, roles-matrix,
// club-layout-guard). It derives `capability` through the site's real declared vocabulary
// (`resolveCapability` over `cairn.config.ts`'s `roles`, the same resolution the auth guard
// performs), not a hand-picked string, so a fixture never claims a capability its role does not
// actually carry -- e.g. an Instructor session reading as editor capability rather than `none`.
import { resolveCapability, type Editor, type Role } from '@glw907/cairn-cms';
import { roles } from '$theme/cairn.config.js';

/** Build the `Editor` shape `canReach`/`requireAccess` read, with the capability the site's own
 *  vocabulary resolves for `role`. */
export function editorWithRole(role: Role): Editor {
  return { email: `${role}@example.com`, displayName: role, role, capability: resolveCapability(roles, role) };
}
