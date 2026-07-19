import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { resolveCapability, type Editor, type Role } from '@glw907/cairn-cms';
import { roles } from '$theme/cairn.config.js';
import { load } from '../routes/admin/club/+layout.server';

/** The exact event type the guard's `load` expects, read off the function itself rather than
 *  hand-typed, so this stays correct if the route's generated types ever change. */
type LayoutEvent = Parameters<typeof load>[0];

function eventFor(editor: Editor | null): LayoutEvent {
  return { locals: { editor } } as unknown as LayoutEvent;
}

// The layout guard reads `editor.role`, not `editor.capability`, so a hardcoded capability would
// not itself break these assertions; deriving it for real (via the site's declared vocabulary,
// the same resolution the auth guard performs) keeps this fixture from reading as a claim that an
// instructor session carries editor capability, which it does not.
function editorWithRole(role: Role): Editor {
  return { email: `${role}@example.com`, displayName: role, role, capability: resolveCapability(roles, role) };
}

describe('/admin/club layout guard', () => {
  it('passes an Administrator through with no D1 read', async () => {
    await expect(load(eventFor(editorWithRole('Administrator')))).resolves.toEqual({});
  });

  it('passes a Club manager through', async () => {
    await expect(load(eventFor(editorWithRole('Club manager')))).resolves.toEqual({});
  });

  // The roles-adoption pass's T2 (docs/2026-07-19-asc-roles-adoption.md): the reserved `owner`
  // role stays declared (`defineRoles` requires it) but is never granted club access -- only
  // `Administrator` is. A session still reading the pre-migration `owner` role (the narrow window
  // between the code deploying and the row migration applying) gets a clean 403 here, same as any
  // other session with no club role; it keeps every other engine capability `resolveCapability`
  // grants it, just not this section.
  it('403s the reserved owner role: it carries no club access', async () => {
    await expect(load(eventFor(editorWithRole('owner')))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 403,
    );
  });

  it('403s an Instructor session', async () => {
    await expect(load(eventFor(editorWithRole('Instructor')))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 403,
    );
  });

  it('403s an undeclared role name', async () => {
    const guest = { email: 'guest@example.com', displayName: 'Guest', role: 'guest', capability: 'none' } as unknown as Editor;
    await expect(load(eventFor(guest))).rejects.toSatisfy((err: unknown) => isHttpError(err) && err.status === 403);
  });
});
