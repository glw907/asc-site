// The committees route's own actions: the club-role gate and the audit wiring, mirroring
// `assets-actions.test.ts`'s established `postEvent` recipe. `committees-store.test.ts` owns the
// data-layer logic; this file only proves the route composes `clubAdminAction` correctly around
// it, including the decline-deletes-the-row behavior the task calls out by name.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/committees/+page.server';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type ActionEvent = Parameters<typeof actions.createCommittee>[0];

function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/committees';
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
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as ActionEvent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('committees actions: createCommittee', () => {
  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.createCommittee(postEvent(noRole, { name: 'Fleet', kind: 'established' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 400 on an invalid kind, auditing the rejection', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.createCommittee(postEvent(admin, { name: 'Fleet', kind: 'social' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'committee' }));
  });

  it('creates the committee and audits its id', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.createCommittee(postEvent(admin, { name: 'Fleet', kind: 'established' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO committees'))).toBe(true);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'committee', editor: admin.email }));
  });
});

describe('committees actions: archiveCommittee', () => {
  it('archives by default and audits the archive verb', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.archiveCommittee(postEvent(admin, { committeeId: 'c-1', archived: 'true' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls[0].sql).toContain("datetime('now')");
    expect(sink).toHaveBeenCalledWith({ action: 'archive', entity: 'committee', entityId: 'c-1', editor: admin.email });
  });

  it('restores and audits the restore verb when archived=false', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.archiveCommittee(postEvent(admin, { committeeId: 'c-1', archived: 'false' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls[0].sql).toContain('NULL');
    expect(sink).toHaveBeenCalledWith({ action: 'restore', entity: 'committee', entityId: 'c-1', editor: admin.email });
  });
});

describe('committees actions: addMember', () => {
  it('inserts an active row and audits its id', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.addMember(
      postEvent(admin, { committeeId: 'c-1', memberId: 'm-1', role: 'chair' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT OR IGNORE INTO committee_members ('));
    expect(insert?.args).toEqual([insert?.args[0], 'c-1', 'm-1', 'chair']);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', entity: 'committee-member' }));
  });

  it('fails 400 gracefully (no throw) on a duplicate pair, auditing the rejection', async () => {
    const { db } = fakeD1({ runResults: { 'INSERT OR IGNORE INTO committee_members': { changes: 0 } } });
    const sink = vi.fn();
    const result = await actions.addMember(
      postEvent(admin, { committeeId: 'c-1', memberId: 'm-1', role: 'chair' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'add', entity: 'committee-member' }));
  });
});

describe('committees actions: declineMember deletes the row', () => {
  it('deletes the committee_members row and audits the decline verb', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.declineMember(postEvent(admin, { committeeMemberId: 'cm-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ sql: 'DELETE FROM committee_members WHERE id = ?1', args: ['cm-1'] }]);
    expect(sink).toHaveBeenCalledWith({ action: 'decline', entity: 'committee-member', entityId: 'cm-1', editor: admin.email });
  });

  it('fails 400 when no committeeMemberId is posted', async () => {
    const { db } = fakeD1();
    const result = await actions.declineMember(postEvent(admin, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });
});

describe('committees actions: removeMember also deletes the row', () => {
  it('deletes the committee_members row and audits the remove verb', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.removeMember(postEvent(admin, { committeeMemberId: 'cm-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ sql: 'DELETE FROM committee_members WHERE id = ?1', args: ['cm-1'] }]);
    expect(sink).toHaveBeenCalledWith({ action: 'remove', entity: 'committee-member', entityId: 'cm-1', editor: admin.email });
  });
});

describe('committees actions: approveMember', () => {
  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.approveMember(postEvent(noRole, { committeeMemberId: 'cm-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('activates the row and audits it', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.approveMember(postEvent(admin, { committeeMemberId: 'cm-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls[0].sql).toContain("SET status = 'active'");
    expect(sink).toHaveBeenCalledWith({ action: 'approve', entity: 'committee-member', entityId: 'cm-1', editor: admin.email });
  });
});

describe('committees actions: setMemberRole', () => {
  it('fails 400 on an invalid role', async () => {
    const { db } = fakeD1();
    const result = await actions.setMemberRole(postEvent(admin, { committeeMemberId: 'cm-1', role: 'president' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('updates the role and audits it', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.setMemberRole(
      postEvent(admin, { committeeMemberId: 'cm-1', role: 'co-chair' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls[0].args).toEqual(['co-chair', 'cm-1']);
    expect(sink).toHaveBeenCalledWith({
      action: 'set-role',
      entity: 'committee-member',
      entityId: 'cm-1',
      detail: 'role=co-chair',
      editor: admin.email,
    });
  });
});

describe('committees actions: createPosition', () => {
  it('inserts a position row and audits its id', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM member_positions': { max_order: -1 } } });
    const sink = vi.fn();
    const result = await actions.createPosition(
      postEvent(admin, { memberId: 'm-1', kind: 'officer', title: 'Commodore' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO member_positions'));
    expect(insert?.args).toEqual([insert?.args[0], 'm-1', 'officer', 'Commodore', 0]);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'member-position' }));
  });
});

describe('committees actions: removePosition', () => {
  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.removePosition(postEvent(noRole, { positionId: 'p-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('deletes the row and audits it', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.removePosition(postEvent(admin, { positionId: 'p-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ sql: 'DELETE FROM member_positions WHERE id = ?1', args: ['p-1'] }]);
    expect(sink).toHaveBeenCalledWith({ action: 'remove', entity: 'member-position', entityId: 'p-1', editor: admin.email });
  });
});

describe('committees actions: movePosition', () => {
  it('defaults direction to down and audits it', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM member_positions ORDER BY': [
          { id: 'p-1', sort_order: 0 },
          { id: 'p-2', sort_order: 1 },
        ],
      },
    });
    const sink = vi.fn();
    const result = await actions.movePosition(postEvent(admin, { positionId: 'p-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE member_positions SET sort_order'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'reorder',
      entity: 'member-position',
      entityId: 'p-1',
      detail: 'direction=down',
      editor: admin.email,
    });
  });
});
