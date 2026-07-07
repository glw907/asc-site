import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { fakeD1 } from './_fake-d1';

const editor: Editor = { email: 'editor@example.com', displayName: 'Editor', role: 'editor' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

/** A fake POST event carrying exactly what `adminAction` reads, plus the `CLUB_DB` binding
 *  `clubAdminAction` resolves off `platform.env` (the same shape `events-actions.test.ts`
 *  established). */
function postEvent(opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void } = {}): AdminActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  const url = 'https://x.dev/admin/club/widgets';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink },
  } as unknown as AdminActionEvent;
}

describe('clubAdminAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 500 and never runs the handler when CLUB_DB is not bound', async () => {
    const handler = vi.fn();
    const sink = vi.fn();
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent({ auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'do', entity: 'widget', editor: editor.email }));
  });

  it('fails 403 and never runs the handler when the editor has no club role', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const handler = vi.fn();
    const sink = vi.fn();
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent({ db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'do', entity: 'widget', editor: editor.email }));
  });

  it('lets a plain admin through by default', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true };
    });
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent({ db }));
    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ownerOnly refuses a plain admin, never running the handler', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } });
    const handler = vi.fn();
    const action = clubAdminAction(handler, { ownerOnly: true, action: 'do', entity: 'widget' });
    const result = await action(postEvent({ db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ownerOnly lets an owner through, and hands the handler the resolved db and clubRole', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [{ role: 'owner' }] } });
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true, clubRole: ctx.clubRole, sameDb: ctx.db === db };
    });
    const action = clubAdminAction(handler, { ownerOnly: true, action: 'do', entity: 'widget' });
    const result = await action(postEvent({ db }));
    expect(result).toEqual({ ok: true, clubRole: 'owner', sameDb: true });
  });
});
