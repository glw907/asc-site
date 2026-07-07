import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions as newActions } from '../routes/admin/club/events/new/+page.server';
import { actions as detailActions } from '../routes/admin/club/events/[id]/+page.server';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'editor' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

const VALID_FIELDS = {
  title: 'Board Meeting',
  slug: 'board-meeting-2026-08',
  category: 'governance',
  startDate: '2026-08-11',
};

type NewActionEvent = Parameters<typeof newActions.create>[0];
type DetailActionEvent = Parameters<typeof detailActions.update>[0];

/** A fake POST event carrying exactly what `adminAction` and these handlers read: an https URL,
 *  a matching CSRF cookie/field pair, `locals.editor`, the `CLUB_DB` binding under
 *  `platform.env`, and (for the `[id]` route) a `params.id`. Mirrors the shape
 *  `club-settings-actions.test.ts` already established for this site's own D1-backed actions. */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; id?: string; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/events';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id: opts.id ?? 'board-meeting-2026-08' },
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

describe('events actions: club-role gate', () => {
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
      expect.objectContaining({ action: 'create', entity: 'event', editor: noRole.email }),
    );
  });

  it('a club admin (not owner) suffices for create: events are the routine domain', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] }, firstResults: { 'FROM events WHERE id': null } });
    const sink = vi.fn();
    const caught = await catchThrown(newActions.create(postEvent(admin, VALID_FIELDS, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'event', entityId: 'board-meeting-2026-08' }),
    );
  });
});

describe('events actions: create', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };

  it('fails 400 on a missing title, auditing the rejected attempt', async () => {
    const { db } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await newActions.create(
      postEvent(admin, { ...VALID_FIELDS, title: '' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'event' }));
  });

  it('fails 400 when the slug is already taken', async () => {
    const { db } = fakeD1({
      ...asAdmin,
      firstResults: { 'FROM events WHERE id': { ...VALID_FIELDS, id: 'board-meeting-2026-08' } },
    });
    const result = await newActions.create(postEvent(admin, VALID_FIELDS, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('creates the row, redirects to the detail screen, and audits the id', async () => {
    const { db, calls } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': null } });
    const sink = vi.fn();
    const caught = await catchThrown(newActions.create(postEvent(admin, VALID_FIELDS, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('/admin/club/events/board-meeting-2026-08');
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO events'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'create',
      entity: 'event',
      entityId: 'board-meeting-2026-08',
      editor: admin.email,
    });
  });
});

describe('events actions: update', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };
  const existingRow = { ...VALID_FIELDS, id: 'board-meeting-2026-08', visible: 1 };

  it('fails 404 when the event does not exist', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': null } });
    const result = await detailActions.update(postEvent(admin, VALID_FIELDS, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('fails 400 on an invalid category, auditing the rejected attempt', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': existingRow } });
    const sink = vi.fn();
    const result = await detailActions.update(
      postEvent(admin, { ...VALID_FIELDS, category: 'not-a-category' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entity: 'event', entityId: 'board-meeting-2026-08' }),
    );
  });

  it('updates the row and audits the id', async () => {
    const { db, calls } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': existingRow } });
    const sink = vi.fn();
    const result = await detailActions.update(postEvent(admin, VALID_FIELDS, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE events SET'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'update',
      entity: 'event',
      entityId: 'board-meeting-2026-08',
      editor: admin.email,
    });
  });
});

describe('events actions: delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };
  const existingRow = { ...VALID_FIELDS, id: 'board-meeting-2026-08', visible: 1 };

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const result = await detailActions.delete(postEvent(noRole, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 404 when the event does not exist', async () => {
    const { db } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': null } });
    const result = await detailActions.delete(postEvent(admin, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('deletes the row, redirects to the list, and audits the id', async () => {
    const { db, calls } = fakeD1({ ...asAdmin, firstResults: { 'FROM events WHERE id': existingRow } });
    const sink = vi.fn();
    const caught = await catchThrown(detailActions.delete(postEvent(admin, {}, { db, auditSink: sink })));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('/admin/club/events');
    expect(calls.some((c) => c.sql.startsWith('DELETE FROM events'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'delete',
      entity: 'event',
      entityId: 'board-meeting-2026-08',
      editor: admin.email,
    });
  });
});
