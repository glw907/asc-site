import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import { access } from '$theme/cairn.config.js';
import { editorWithRole } from './_editor';
import { load } from '../routes/admin/club/+layout.server';

/** The exact event type the guard's `load` expects, read off the function itself rather than
 *  hand-typed, so this stays correct if the route's generated types ever change. */
type LayoutEvent = Parameters<typeof load>[0];

// The roles-adoption pass's T4 (docs/2026-07-19-asc-roles-adoption.md): the guard now calls the
// engine's own `requireAccess`, which reads `event.url.pathname` and `event.locals.cairnAccess`
// (the site's real map, `src/theme/cairn.config.ts`'s `access`) instead of the retired
// `CLUB_ROLES.includes(editor.role)` check, so the fixture must carry both.
function eventFor(editor: Editor | null, pathname = '/admin/club'): LayoutEvent {
  return {
    url: new URL(`https://x.dev${pathname}`),
    locals: { editor, cairnAccess: access },
  } as unknown as LayoutEvent;
}

describe('/admin/club layout guard', () => {
  it('passes an Administrator through with no D1 read', async () => {
    await expect(load(eventFor(editorWithRole('Administrator')))).resolves.toEqual({});
  });

  it('passes a Club manager through', async () => {
    await expect(load(eventFor(editorWithRole('Club manager')))).resolves.toEqual({});
  });

  // FLIPPED by the roles-adoption pass's T4: under the old hardcoded `CLUB_ROLES.includes(...)`
  // check, the reserved `owner` role (never itself in `CLUB_ROLES`) was denied. Under
  // `requireAccess`/`canReach`, `owner` still resolves OWNER CAPABILITY (`resolveCapability`,
  // `cairn.config.ts`'s `roles` declaration), and `canReach` returns `true` for owner capability
  // before it ever consults the map (`node_modules/@glw907/cairn-cms/dist/auth/access.js`:
  // `if (editor.capability === 'owner') { return true; }`, checked ahead of every map lookup) --
  // so a phantom-owner session now reaches `/admin/club` same as any other owner-capability
  // session. This is also what keeps the deploy lockout-safe: the live `owner` rows (pre-row-
  // migration) keep full access, including this section, until T2's row migration renames them.
  it('passes the reserved owner role through: owner capability bypasses every canReach check', async () => {
    await expect(load(eventFor(editorWithRole('owner')))).resolves.toEqual({});
  });

  it('403s an Instructor session', async () => {
    await expect(load(eventFor(editorWithRole('Instructor')))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 403,
    );
  });

  // T4's map maps `/admin/club` to `[Administrator, Club manager]` only; Webmaster and Publisher
  // carry editor capability (they reach other engine screens) but neither is named for this
  // section's default, so a plain `/admin/club` path 403s them same as Instructor, even though
  // the deeper `/admin/club/email`/`/admin/club/announce` keys admit Publisher specifically
  // (exercised at the action level in club-action.test.ts, since the layout guard only ever sees
  // the section's own top-level path in this repo's route shape).
  it('403s a Webmaster session', async () => {
    await expect(load(eventFor(editorWithRole('Webmaster')))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 403,
    );
  });

  it('403s a Publisher session', async () => {
    await expect(load(eventFor(editorWithRole('Publisher')))).rejects.toSatisfy(
      (err: unknown) => isHttpError(err) && err.status === 403,
    );
  });

  it('403s an undeclared role name', async () => {
    const guest = { email: 'guest@example.com', displayName: 'Guest', role: 'guest', capability: 'none' } as unknown as Editor;
    await expect(load(eventFor(guest))).rejects.toSatisfy((err: unknown) => isHttpError(err) && err.status === 403);
  });
});
