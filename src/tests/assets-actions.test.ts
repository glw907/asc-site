// The assets route's own actions (Part 2): the club-role gate and the audit wiring, mirroring
// `classes-actions.test.ts`'s established `postEvent` recipe. `assets-store.test.ts` owns the
// data-layer logic; this file only proves the route composes `clubAdminAction` correctly around
// it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/assets/+page.server';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Instructor' carries no club role; clubAdminAction's gate now reads `editor.role` directly
// (initiative 5 Task 2), not a `club_roles` row.
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type ActionEvent = Parameters<typeof actions.assign>[0];

function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/assets';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: {},
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink },
  } as unknown as ActionEvent;
}

describe('assets actions: assign', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.assign(postEvent(noRole, { assetType: 'mooring', membershipId: 'ms-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 400 when the household is missing, auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.assign(postEvent(admin, { assetType: 'mooring', membershipId: '' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'assign', entity: 'assignment' }));
  });

  it('inserts the assignment and audits its id', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.assign(
      postEvent(admin, { assetType: 'mooring', membershipId: 'ms-1', description: 'Buoy M-14' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_assignments'));
    expect(insert?.args).toEqual([insert?.args[0], 'mooring', 'ms-1', 'Buoy M-14', 'active']);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'assign', entity: 'assignment', editor: admin.email }),
    );
  });
});

describe('assets actions: release', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 404 when the assignment does not exist', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments WHERE id': null } });
    const result = await actions.release(postEvent(admin, { assignmentId: 'a-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('updates status to released and audits the id', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM asset_assignments WHERE id': { id: 'a-1', status: 'active', asset_type: 'mooring' } },
    });
    const sink = vi.fn();
    const result = await actions.release(postEvent(admin, { assignmentId: 'a-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE asset_assignments SET status'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({ action: 'release', entity: 'assignment', entityId: 'a-1', editor: admin.email });
  });
});

describe('assets actions: recordPayment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 400 on an invalid method', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM asset_assignments WHERE id': { id: 'a-1', status: 'active', asset_type: 'mooring' } },
    });
    const result = await actions.recordPayment(postEvent(admin, { assignmentId: 'a-1', amount: '300', method: 'venmo' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 404 when the assignment does not exist', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_assignments WHERE id': null } });
    const result = await actions.recordPayment(postEvent(admin, { assignmentId: 'a-1', amount: '300', method: 'check' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('records an offline check payment and audits the method', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM asset_assignments WHERE id': { id: 'a-1', status: 'active', asset_type: 'mooring' },
        "'current_season'": { value: '2026' },
      },
    });
    const sink = vi.fn();
    const result = await actions.recordPayment(
      postEvent(admin, { assignmentId: 'a-1', amount: '300', method: 'check', reference: 'Check #1234' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_payments'));
    expect(insert?.args.slice(1)).toEqual(['a-1', 2026, 300, 'check', 'Check #1234']);
    expect(sink).toHaveBeenCalledWith({
      action: 'record-payment',
      entity: 'asset-payment',
      entityId: 'a-1',
      detail: 'method=check',
      editor: admin.email,
    });
  });
});

describe('assets actions: waitlist', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waitlistAdd refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.waitlistAdd(postEvent(noRole, { assetType: 'mooring', memberId: 'mem-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('waitlistAdd inserts a row at the end of the type-specific queue', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE asset_type': { max_position: 1 } } });
    const sink = vi.fn();
    const result = await actions.waitlistAdd(postEvent(admin, { assetType: 'mooring', memberId: 'mem-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_waitlist'));
    expect(insert?.args).toEqual([insert?.args[0], 'mooring', 'mem-1', 2, null]);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', entity: 'asset-waitlist' }));
  });

  it('waitlistRemove deletes the one row and audits it', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.waitlistRemove(postEvent(admin, { waitlistId: 'w-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    // clubAdminAction's role gate no longer queries club_roles (initiative 5 Task 2): it is the
    // only DB call this handler makes.
    expect(calls).toEqual([{ sql: 'DELETE FROM asset_waitlist WHERE id = ?1', args: ['w-1'] }]);
    expect(sink).toHaveBeenCalledWith({ action: 'remove', entity: 'asset-waitlist', entityId: 'w-1', editor: admin.email });
  });

  it('waitlistMoveToEnd fails 404 for an unknown entry', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE id': null } });
    const result = await actions.waitlistMoveToEnd(postEvent(admin, { waitlistId: 'w-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('waitlistMoveToEnd re-tails the entry within its own asset type and audits it', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM asset_waitlist WHERE id': { id: 'w-1', asset_type: 'mooring' } } });
    const sink = vi.fn();
    const result = await actions.waitlistMoveToEnd(postEvent(admin, { waitlistId: 'w-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE asset_waitlist SET position') && c.args.includes('mooring'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({ action: 'reorder', entity: 'asset-waitlist', entityId: 'w-1', editor: admin.email });
  });
});
