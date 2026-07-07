import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions as newActions } from '../routes/admin/club/classes/new/+page.server';
import { actions as detailActions } from '../routes/admin/club/classes/[id]/+page.server';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'editor' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

const VALID_FIELDS = {
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: '12',
  fee: '100',
};

type NewActionEvent = Parameters<typeof newActions.create>[0];
type DetailActionEvent = Parameters<typeof detailActions.update>[0];

/** A fake POST event carrying exactly what `clubAdminAction` and these handlers read: an https
 *  URL, a matching CSRF cookie/field pair, `locals.editor`, the `CLUB_DB` binding under
 *  `platform.env`, and (for the `[id]` route) a `params.id`. Mirrors
 *  `events-actions.test.ts`'s own `postEvent`. */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; id?: string; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/classes';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id: opts.id ?? 'fleet-tune-up-weekend' },
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink },
  } as unknown as NewActionEvent & DetailActionEvent;
}

async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

describe('classes actions: club-role gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('create refuses an editor with no club role (403), auditing the rejected attempt', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const sink = vi.fn();
    const result = await newActions.create(postEvent(noRole, VALID_FIELDS, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'class', editor: noRole.email }),
    );
  });

  it('a club admin (not owner) suffices for create: classes are the routine domain', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM club_roles': [{ role: 'club-admin' }] },
      firstResults: { 'FROM classes WHERE id': null, "'current_season'": { value: '2026' } },
    });
    const sink = vi.fn();
    const caught = await catchThrown(newActions.create(postEvent(admin, VALID_FIELDS, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'class', entityId: 'fleet-tune-up-weekend' }),
    );
  });
});

describe('classes actions: create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };

  it('fails 400 on a missing name, auditing the rejected attempt', async () => {
    const { db } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await newActions.create(
      postEvent(admin, { ...VALID_FIELDS, name: '' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'class' }));
  });

  it('fails 400 when the slug is already taken', async () => {
    const { db } = fakeD1({
      ...asAdmin,
      firstResults: { 'FROM classes WHERE id': { id: 'fleet-tune-up-weekend' } },
    });
    const result = await newActions.create(postEvent(admin, VALID_FIELDS, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('creates the row (in the current season), redirects, and audits the id', async () => {
    const { db, calls } = fakeD1({
      ...asAdmin,
      firstResults: { 'FROM classes WHERE id': null, "'current_season'": { value: '2026' } },
    });
    const sink = vi.fn();
    const caught = await catchThrown(newActions.create(postEvent(admin, VALID_FIELDS, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('/admin/club/classes/fleet-tune-up-weekend');
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO classes'));
    expect(insert?.args[1]).toBe(2026);
    expect(sink).toHaveBeenCalledWith({
      action: 'create',
      entity: 'class',
      entityId: 'fleet-tune-up-weekend',
      editor: admin.email,
    });
  });
});

describe('classes actions: update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };
  const existingRow = { ...VALID_FIELDS, id: 'fleet-tune-up-weekend', capacity: 12, fee: 100, visible: 1 };

  it('fails 404 when the class does not exist', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM classes WHERE id': null } });
    const result = await detailActions.update(postEvent(admin, VALID_FIELDS, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('fails 400 on an invalid track, auditing the rejected attempt', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM classes WHERE id': existingRow } });
    const sink = vi.fn();
    const result = await detailActions.update(
      postEvent(admin, { ...VALID_FIELDS, track: 'not-a-track' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entity: 'class', entityId: 'fleet-tune-up-weekend' }),
    );
  });

  it('updates the row and audits the id', async () => {
    const { db, calls } = fakeD1({ ...asAdmin, firstResults: { 'FROM classes WHERE id': existingRow } });
    const sink = vi.fn();
    const result = await detailActions.update(postEvent(admin, VALID_FIELDS, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE classes SET'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'update',
      entity: 'class',
      entityId: 'fleet-tune-up-weekend',
      editor: admin.email,
    });
  });
});

describe('classes actions: delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };
  const existingRow = { ...VALID_FIELDS, id: 'fleet-tune-up-weekend', visible: 1 };

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const result = await detailActions.delete(postEvent(noRole, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 404 when the class does not exist', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM classes WHERE id': null } });
    const result = await detailActions.delete(postEvent(admin, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('deletes the row, redirects to the list, and audits the id', async () => {
    const { db, calls } = fakeD1({ ...asAdmin, firstResults: { 'FROM classes WHERE id': existingRow } });
    const sink = vi.fn();
    const caught = await catchThrown(detailActions.delete(postEvent(admin, {}, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('/admin/club/classes');
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM classes'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'delete',
      entity: 'class',
      entityId: 'fleet-tune-up-weekend',
      editor: admin.email,
    });
  });
});

describe('classes actions: instructor assignment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };

  it('assignInstructor inserts only the assignment row and audits it', async () => {
    const { db, calls } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await detailActions.assignInstructor(
      postEvent(admin, { email: 'coach@example.com', name: 'Coach' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(2); // the role check, then the one insert
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_instructors'))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('DELETE'))).toBe(false);
    expect(sink).toHaveBeenCalledWith({
      action: 'assign',
      entity: 'assignment',
      entityId: 'fleet-tune-up-weekend:coach@example.com',
      editor: admin.email,
    });
  });

  it('fails 400 when the email is missing, auditing the rejected attempt', async () => {
    const { db } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await detailActions.assignInstructor(postEvent(admin, { email: '' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'assign', entity: 'assignment' }));
  });

  it('unassignInstructor deletes only the one assignment row and audits it', async () => {
    const { db, calls } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await detailActions.unassignInstructor(
      postEvent(admin, { email: 'coach@example.com' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      expect.objectContaining({ sql: expect.stringContaining('FROM club_roles') }),
      { sql: 'DELETE FROM class_instructors WHERE class_id = ?1 AND member_id = ?2', args: ['fleet-tune-up-weekend', 'coach@example.com'] },
    ]);
    expect(sink).toHaveBeenCalledWith({
      action: 'unassign',
      entity: 'assignment',
      entityId: 'fleet-tune-up-weekend:coach@example.com',
      editor: admin.email,
    });
  });

  it('refuses an editor with no club role (403), never touching class_instructors', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const result = await detailActions.assignInstructor(postEvent(noRole, { email: 'coach@example.com' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(calls.some((c) => c.sql.includes('class_instructors'))).toBe(false);
  });
});
