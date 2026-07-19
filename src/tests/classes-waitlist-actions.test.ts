// The classes detail route's own two Task 7 actions (`offer`, `cancelOffer`): the club-role gate
// and the audit wiring, mirroring `classes-actions.test.ts`'s established `postEvent` recipe. The
// offer machine's own transition logic (capacity, active-offer refusal, token hashing, expiry) is
// `offers.test.ts`'s job; this file only proves the route composes `clubAdminAction` correctly
// around it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/classes/[id]/+page.server';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Instructor' carries no club role; clubAdminAction's gate now reads `editor.role` directly
// (initiative 5 Task 2), not a `club_roles` row.
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type DetailActionEvent = Parameters<typeof actions.offer>[0];

/** Mirrors `classes-actions.test.ts`'s own `postEvent`. */
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
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as DetailActionEvent;
}

const CLASS_ROW = {
  id: 'fleet-tune-up-weekend',
  season: 2026,
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  visible: 1 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

describe('classes actions: offer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.offer(postEvent(noRole, { waitlistId: 'wait-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 400 when the class has no free capacity, auditing the rejected attempt', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': { n: 10 },
        'FROM class_waitlist WHERE class_id': { n: 1 },
      },
    });
    const sink = vi.fn();
    const result = await actions.offer(postEvent(admin, { waitlistId: 'wait-1' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'offer', entity: 'offer', editor: admin.email }),
    );
  });

  it('mints a token, returning it once, and audits the waitlist entry', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': { n: 9 },
        'FROM class_waitlist WHERE class_id': { n: 1 },
        'FROM class_waitlist WHERE id': { class_id: CLASS_ROW.id },
        'FROM class_offers WHERE waitlist_id': null,
        "'offer_window_hours'": { value: '72' },
      },
    });
    const sink = vi.fn();
    const result = await actions.offer(postEvent(admin, { waitlistId: 'wait-1' }, { db, auditSink: sink }));
    expect(result).toEqual({
      ok: true,
      offered: { waitlistId: 'wait-1', token: expect.any(String), expiresAt: expect.any(String) },
    });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'offer',
      entity: 'offer',
      entityId: 'wait-1',
      editor: admin.email,
    });
  });

  it('fails 400 when the waitlist entry is missing', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.offer(postEvent(admin, {}, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'offer', entity: 'offer' }));
  });
});

describe('classes actions: cancelOffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.cancelOffer(postEvent(noRole, { waitlistId: 'wait-1' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('cancels the active offer and audits cancel-offer', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM class_offers WHERE waitlist_id': { token: 'the-hash' } } });
    const sink = vi.fn();
    const result = await actions.cancelOffer(postEvent(admin, { waitlistId: 'wait-1' }, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'declined'"))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'cancel-offer',
      entity: 'offer',
      entityId: 'wait-1',
      editor: admin.email,
    });
  });

  it('fails 400 when there is no active offer to cancel, auditing the rejected attempt', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_offers WHERE waitlist_id': null } });
    const sink = vi.fn();
    const result = await actions.cancelOffer(postEvent(admin, { waitlistId: 'wait-1' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'cancel-offer', entity: 'offer' }));
  });
});
