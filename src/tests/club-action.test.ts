import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { RateLimit } from '@cloudflare/workers-types';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord, AdminActionEvent } from '@glw907/cairn-cms/sveltekit';
import { access } from '$theme/cairn.config.js';
import { clubAdminAction } from '$admin-club/lib/club-action';

const clubAdmin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Administrator' is the granted owner-capability name from the roles-adoption pass's T2
// (docs/2026-07-19-asc-roles-adoption.md); the reserved `owner` role stays declared but is never
// granted club access, so a fixture exercising the granted owner-capability path uses this name.
const administrator: Editor = { email: 'admin-owner@example.com', displayName: 'Administrator', role: 'Administrator', capability: 'owner' };
const instructor: Editor = { email: 'instructor@example.com', displayName: 'Instructor', role: 'Instructor', capability: 'none' };
// The two roles the roles-adoption pass's T4 exercises specifically: Publisher is the widened
// role admitted to the Email/Announce send actions but no other club action; Webmaster has no
// club access at all, same shape as Instructor but editor capability rather than none.
const publisher: Editor = { email: 'publisher@example.com', displayName: 'Publisher', role: 'Publisher', capability: 'editor' };
const webmaster: Editor = { email: 'webmaster@example.com', displayName: 'Webmaster', role: 'Webmaster', capability: 'editor' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

/** A fake POST event carrying exactly what `adminAction` reads, plus the `CLUB_DB` binding
 *  `clubAdminAction` resolves off `platform.env` (the same shape `events-actions.test.ts`
 *  established), and `locals.cairnAccess`, the site's real `access` map by default -- the same
 *  value `hooks.server.ts`'s guard attaches, so these tests exercise real map enforcement rather
 *  than `canReach`'s undefined-map fallback. `opts.path` lets a test target a deeper key
 *  (`/admin/club/email`, `/admin/club/announce`) than the section default. `opts.omitAccessMap`
 *  drops `locals.cairnAccess` entirely -- the guard's own fail-closed branch for a map the layout
 *  guard never attached (a review-gate finding), which the default-attached map above can never
 *  exercise. */
function postEvent(
  editor: Editor,
  opts: {
    db?: unknown;
    auditSink?: (record: AdminActionAuditRecord) => void;
    rateLimit?: RateLimit;
    path?: string;
    omitAccessMap?: boolean;
  } = {},
): AdminActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  const url = `https://x.dev${opts.path ?? '/admin/club/widgets'}`;
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
    locals: { editor, auditSink: opts.auditSink, cairnAccess: opts.omitAccessMap ? undefined : access },
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

  it('fails closed (500) and never runs the handler when the access map is not attached, even for an Administrator', async () => {
    // Review-gate finding: `canReach(undefined, ...)` admits any editor-capability session, and a
    // form action never re-runs the ancestor layout's `load` that would normally attach the map --
    // so an unwired map must fail closed here rather than fall through to an open `canReach` call.
    // The strongest role (Administrator, owner capability) proves the guard fires before any
    // capability-based shortcut, not just for the routine roles.
    const handler = vi.fn();
    const sink = vi.fn();
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(administrator, { db: {}, auditSink: sink, omitAccessMap: true }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'do', entity: 'widget', editor: administrator.email, detail: 'rejected: access map not attached' }),
    );
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

// The roles-adoption pass's T4: the role decision now composes `canReach` against the site's real
// `access` map (`src/theme/cairn.config.ts`), so the Publisher widening on `/admin/club/email` and
// `/admin/club/announce` (Communication's Email/Announce send actions) and every other club
// action's `/admin/club` section default both fall out of the map with no bespoke per-action role
// list -- this is the property T4 exists to prove.
describe('clubAdminAction reads the site access map', () => {
  const allowThrough = async (editor: Editor, path: string) => {
    const handler = vi.fn(async ({ ctx }) => {
      ctx.audit({ action: 'do', entity: 'widget' });
      return { ok: true };
    });
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(editor, { db: {}, path }));
    expect(result).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  };

  const denyAtTheAction = async (editor: Editor, path: string) => {
    const handler = vi.fn();
    const sink = vi.fn();
    const action = clubAdminAction(handler, { action: 'do', entity: 'widget' });
    const result = await action(postEvent(editor, { db: {}, auditSink: sink, path }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'do', entity: 'widget', editor: editor.email }));
  };

  it('admits Publisher to the Email send action', async () => {
    await allowThrough(publisher, '/admin/club/email/send');
  });

  it('admits Publisher to the Announce send action', async () => {
    await allowThrough(publisher, '/admin/club/announce/send');
  });

  it('denies Publisher a representative other club action (Money), audited', async () => {
    await denyAtTheAction(publisher, '/admin/club/money/approve');
  });

  it('admits Club manager to the Email send action, the Announce send action, and Money', async () => {
    await allowThrough(clubAdmin, '/admin/club/email/send');
    await allowThrough(clubAdmin, '/admin/club/announce/send');
    await allowThrough(clubAdmin, '/admin/club/money/approve');
  });

  it('admits Administrator to the Email send action, the Announce send action, and Money', async () => {
    await allowThrough(administrator, '/admin/club/email/send');
    await allowThrough(administrator, '/admin/club/announce/send');
    await allowThrough(administrator, '/admin/club/money/approve');
  });

  it('denies Webmaster the Email send action', async () => {
    await denyAtTheAction(webmaster, '/admin/club/email/send');
  });

  it('denies Webmaster the Announce send action', async () => {
    await denyAtTheAction(webmaster, '/admin/club/announce/send');
  });

  it('denies Instructor the Email send action', async () => {
    await denyAtTheAction(instructor, '/admin/club/email/send');
  });

  it('denies Instructor the Announce send action', async () => {
    await denyAtTheAction(instructor, '/admin/club/announce/send');
  });
});
