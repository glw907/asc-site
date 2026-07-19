import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { RateLimit } from '@cloudflare/workers-types';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { clubAdminAction } from '$admin-club/lib/club-action';

const clubAdmin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Administrator' is the granted owner-capability name from the roles-adoption pass's T2
// (docs/2026-07-19-asc-roles-adoption.md); the reserved `owner` role stays declared but is never
// granted club access, so a fixture exercising the granted owner-capability path uses this name.
const administrator: Editor = { email: 'admin-owner@example.com', displayName: 'Administrator', role: 'Administrator', capability: 'owner' };
const instructor: Editor = { email: 'instructor@example.com', displayName: 'Instructor', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

/** A fake POST event carrying exactly what `adminAction` reads, plus the `CLUB_DB` binding
 *  `clubAdminAction` resolves off `platform.env` (the same shape `events-actions.test.ts`
 *  established). */
function postEvent(
  editor: Editor,
  opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void; rateLimit?: RateLimit } = {},
): AdminActionEvent {
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
    platform: { env: { CLUB_DB: opts.db, RATE_LIMIT_ADMIN: opts.rateLimit } },
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
    const result = await action(postEvent(clubAdmin, { auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'do', entity: 'widget', editor: clubAdmin.email }));
  });

  it('fails 403 and never runs the handler when the editor has no club role', async () => {
    const handler = vi.fn();
    const sink = vi.fn();
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(instructor, { db: {}, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'do', entity: 'widget', editor: instructor.email }));
  });

  it('lets a club admin through by default', async () => {
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true };
    });
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(clubAdmin, { db: {} }));
    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lets an Administrator through the routine (non-ownerOnly) gate too', async () => {
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true };
    });
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(administrator, { db: {} }));
    expect(result).toEqual({ ok: true });
  });

  it('ownerOnly refuses a plain club admin, never running the handler', async () => {
    const handler = vi.fn();
    const action = clubAdminAction(handler, { ownerOnly: true, action: 'do', entity: 'widget' });
    const result = await action(postEvent(clubAdmin, { db: {} }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails 429 and never runs the handler when RATE_LIMIT_ADMIN is present and over its limit, keyed per editor', async () => {
    const handler = vi.fn();
    const sink = vi.fn();
    const rateLimit = { limit: vi.fn(async () => ({ success: false })) } as unknown as RateLimit;
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(clubAdmin, { db: {}, auditSink: sink, rateLimit }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(rateLimit.limit).toHaveBeenCalledWith({ key: `editor:${clubAdmin.email}` });
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ detail: 'rejected: rate limited' }));
  });

  it('lets the handler run when RATE_LIMIT_ADMIN is present and under its limit', async () => {
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true };
    });
    const rateLimit = { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit;
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(clubAdmin, { db: {}, rateLimit }));
    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ownerOnly lets an Administrator through, and hands the handler the resolved db', async () => {
    const db = {};
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true, sameDb: ctx.db === db };
    });
    const action = clubAdminAction(handler, { ownerOnly: true, action: 'do', entity: 'widget' });
    const result = await action(postEvent(administrator, { db }));
    expect(result).toEqual({ ok: true, sameDb: true });
  });
});
