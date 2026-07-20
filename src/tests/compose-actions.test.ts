// The Compose screen's route (`/admin/club/email/compose`): the load's own segment options and
// blast history, and each action's role gate, validation, and the two rules the design's safety
// flow depends on -- `test` always targets the signed-in editor regardless of what the form
// posts, and `send` re-resolves the segment from scratch rather than trusting anything `review`
// (or a stale client) handed back. Mirrors `announce-actions.test.ts`'s own fake-request idiom
// (both wrap `clubAdminAction`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions, load } from '../routes/admin/club/email/compose/+page.server';
import type { SegmentOption } from '$admin-club/lib/segments';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Instructor' carries no club role; clubAdminAction's gate now reads `editor.role` directly
// (initiative 5 Task 2), not a `club_roles` row.
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.review>[0];
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

function loadEventFor(editor: Editor | null, db: unknown, search = ''): LoadEvent {
  return {
    locals: { editor },
    platform: { env: { CLUB_DB: db } },
    url: new URL(`https://x.dev/admin/club/email/compose${search}`),
  } as unknown as LoadEvent;
}

function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; env?: Record<string, unknown>; auditSink?: (record: AdminActionAuditRecord) => void } = {},
): ActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/email/compose';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db, ...opts.env } },
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as ActionEvent;
}

// A current household with one member on file, so `resolveSegment('current')` has a real
// recipient to find (the review/send tests below).
const asAdmin = {
  allResults: {
    'FROM households h': [{ household_id: 'hh-larsen', paid_at: new Date().toISOString().slice(0, 10), primary_member_id: null }],
    'FROM members WHERE archived_at': [
      { id: 'mem-erik', name: 'Erik Larsen', email: 'erik.larsen@example.com', household_id: 'hh-larsen' },
    ],
  },
};

describe('/admin/club/email/compose load', () => {
  it('lists segment options and past blasts, with the signed-in editor own email', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM email_blasts': [
          {
            id: 'blast-1',
            segment_key: 'current',
            segment_label: 'Current members',
            subject: 'Fleet update',
            body: 'Hi {{person_name}}',
            recipient_count: 1,
            sent_count: 1,
            failed_count: 0,
            actor: 'admin@example.com',
            created_at: '2026-07-14 00:00:00',
          },
        ],
      },
    });
    const result = (await load(loadEventFor(admin, db))) as LoadResult;
    expect(result.error).toBeNull();
    expect(result.editorEmail).toBe(admin.email);
    expect(result.blasts).toHaveLength(1);
    expect(result.segmentOptions.map((option: SegmentOption) => option.key)).toEqual(['current', 'lapsed', 'instructors']);
  });

  it('reports the CLUB_DB-unbound error, degrading to empty lists', async () => {
    const result = (await load(loadEventFor(admin, undefined))) as LoadResult;
    expect(result.error).toBe('CLUB_DB is not bound.');
    expect(result.blasts).toEqual([]);
    expect(result.segmentOptions).toEqual([]);
    expect(result.presetSegmentKey).toBeNull();
  });

  it('carries no preselection with no `segment` query param', async () => {
    const { db } = fakeD1();
    const result = (await load(loadEventFor(admin, db))) as LoadResult;
    expect(result.presetSegmentKey).toBeNull();
  });

  it("preselects the deep-link `segment` param when it exactly names a real picker option", async () => {
    const { db } = fakeD1();
    const result = (await load(loadEventFor(admin, db, '?segment=lapsed'))) as LoadResult;
    expect(result.presetSegmentKey).toBe('lapsed');
  });

  it('the `class` sentinel (the "Email class members" nav entry, T5) preselects the picker own first class option, current season first', async () => {
    const { db } = fakeD1({
      firstResults: { "'current_season'": { value: '2026' } },
      allResults: {
        'FROM classes c': [
          { id: 'cls-new', name: 'Keelboat 101', season: 2026 },
          { id: 'cls-old', name: 'Dinghy Basics', season: 2024 },
        ],
      },
    });
    const result = (await load(loadEventFor(admin, db, '?segment=class'))) as LoadResult;
    expect(result.presetSegmentKey).toBe('class:cls-new');
  });

  it('the `class` sentinel falls back to no preselection when the picker has no class option', async () => {
    const { db } = fakeD1();
    const result = (await load(loadEventFor(admin, db, '?segment=class'))) as LoadResult;
    expect(result.presetSegmentKey).toBeNull();
  });

  it('a `segment` param naming no real option falls back to no preselection, never an error', async () => {
    const { db } = fakeD1();
    const result = (await load(loadEventFor(admin, db, '?segment=class:no-such-class'))) as LoadResult;
    expect(result.presetSegmentKey).toBeNull();
  });
});

describe('/admin/club/email/compose review action', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses an editor with no club role (403), auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.review(
      postEvent(noRole, { segmentKey: 'current', subject: 'S', body: 'B' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'compose-review', entity: 'email-blast', editor: noRole.email }),
    );
  });

  it('fails 400 when the segment, subject, or body is missing', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.review(postEvent(admin, { segmentKey: '', subject: 'S', body: 'B' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 400 for an unknown segment key', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.review(
      postEvent(admin, { segmentKey: 'class:no-such-class', subject: 'S', body: 'B' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('resolves the real segment server-side and returns its exact count, label, and a recipient sample', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.review(
      postEvent(admin, { segmentKey: 'current', subject: 'Fleet update', body: 'Hi {{person_name}}' }, { db }),
    );
    expect(result).toMatchObject({ kind: 'review', segmentKey: 'current', segmentLabel: 'Current members', recipientCount: 1 });
    expect((result as { sample: unknown[] }).sample).toEqual([
      { email: 'erik.larsen@example.com', personName: 'Erik Larsen', memberId: 'mem-erik' },
    ]);
  });
});

describe('/admin/club/email/compose test action', () => {
  afterEach(() => vi.restoreAllMocks());

  it('always sends to the signed-in editor, never a client-supplied recipient', async () => {
    const { db } = fakeD1(asAdmin);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.test(
      postEvent(admin, { subject: 'Test', body: 'Hi', recipient: 'someone-else@example.com' }, { db, env: { EMAIL: { send } } }),
    );
    expect(result).toEqual({ kind: 'test', ok: true, error: null });
    const message = send.mock.calls[0][0] as { to: string };
    expect(message.to).toBe(admin.email);
  });

  it('fails 400 when the subject or body is missing', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.test(postEvent(admin, { subject: '', body: '' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.test(postEvent(noRole, { subject: 'S', body: 'B' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });
});

describe('/admin/club/email/compose send action', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fails 400 without an explicit confirm', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(postEvent(admin, { segmentKey: 'current', subject: 'S', body: 'B' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('re-resolves the segment fresh, ignoring a stale client-supplied recipient count', async () => {
    const { db, calls } = fakeD1(asAdmin);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await actions.send(
      postEvent(
        admin,
        { segmentKey: 'current', subject: 'S', body: 'B', confirm: 'on', recipientCount: '999' },
        { db, env: { EMAIL: { send } } },
      ),
    );
    expect(result).toMatchObject({ kind: 'sent', segmentLabel: 'Current members', recipientCount: 1, sentCount: 1, failedCount: 0 });
    const blastInsert = calls.find((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    expect(blastInsert?.args[5]).toBe(1); // recipient_count: the fresh resolve, never the posted 999
  });

  it('fails 400 for an unknown segment key even with confirm set', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(
      postEvent(admin, { segmentKey: 'class:no-such-class', subject: 'S', body: 'B', confirm: 'on' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('refuses an editor with no club role (403), auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.send(
      postEvent(noRole, { segmentKey: 'current', subject: 'S', body: 'B', confirm: 'on' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'compose-send', entity: 'email-blast', editor: noRole.email }),
    );
  });
});
