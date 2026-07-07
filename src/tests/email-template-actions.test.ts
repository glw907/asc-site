import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/email/[id]/+page.server';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'editor' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

const STORED_ROW = {
  id: 'class_offer',
  subject: 'A spot is open -- {{item_display_name}}',
  reply_to: 'program-committee@aksailingclub.org',
  body: 'Hi {{person_name}}, claim it: {{claim_url}}.',
  updated_at: '2026-07-07 00:00:00',
  updated_by: 'import:ops',
};

const DEFAULTS_ROW = { default_subject: STORED_ROW.subject, default_body: STORED_ROW.body };

type SaveActionEvent = Parameters<typeof actions.save>[0];

/** A fake POST event carrying exactly what `clubAdminAction` and this route's handlers read,
 *  the same shape `classes-actions.test.ts`'s own `postEvent` establishes. */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/email/class_offer';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id: 'class_offer' },
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink },
  } as unknown as SaveActionEvent;
}

const asAdmin = { allResults: { 'FROM club_roles': [{ role: 'club-admin' }] } };

describe('email template actions: role gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save refuses an editor with no club role (403), auditing the rejected attempt', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const sink = vi.fn();
    const result = await actions.save(postEvent(noRole, { subject: 'x', body: 'y' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entity: 'email-template', editor: noRole.email }),
    );
  });

  it('a club admin (not owner) suffices to save: routine content', async () => {
    const { db, calls } = fakeD1({
      ...asAdmin,
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': STORED_ROW,
      },
    });
    const sink = vi.fn();
    const result = await actions.save(
      postEvent(admin, { subject: 'New subject', body: 'New body' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true, warning: null });
    expect(calls.some((c) => c.sql.startsWith('UPDATE email_templates SET subject'))).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entity: 'email-template', entityId: 'class_offer', editor: admin.email }),
    );
  });
});

describe('email template actions: save', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 400 on a missing subject or body, auditing the rejected attempt', async () => {
    const { db } = fakeD1(asAdmin);
    const sink = vi.fn();
    const result = await actions.save(postEvent(admin, { subject: '', body: 'y' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', entity: 'email-template' }));
  });

  it('saves cleanly and warns (not blocks) on an unknown variable token', async () => {
    const { db, calls } = fakeD1({
      ...asAdmin,
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': STORED_ROW,
      },
    });
    const sink = vi.fn();
    const result = await actions.save(
      postEvent(admin, { subject: 'Subject', body: 'Body with {{not_a_real_var}}' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true, warning: 'This template does not use {{not_a_real_var}}.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE email_templates SET subject'))).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update', entity: 'email-template', detail: 'unknown variables: not_a_real_var' }),
    );
  });
});

describe('email template actions: reset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM club_roles': [] } });
    const result = await actions.reset(postEvent(noRole, {}, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('restores the row and audits it', async () => {
    let readCount = 0;
    const restoredRow = { ...STORED_ROW, updated_by: admin.email };
    const { db, calls } = fakeD1({
      ...asAdmin,
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': () => (readCount++ === 0 ? STORED_ROW : restoredRow),
        'default_subject, default_body FROM email_templates': DEFAULTS_ROW,
      },
    });
    const sink = vi.fn();
    const result = await actions.reset(postEvent(admin, {}, { db, auditSink: sink }));
    expect(result).toEqual({ ok: true, reset: true, template: expect.objectContaining({ id: 'class_offer' }) });
    expect(calls.some((c) => c.sql.startsWith('UPDATE email_templates SET subject = default_subject'))).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'reset',
      entity: 'email-template',
      entityId: 'class_offer',
      editor: admin.email,
    });
  });

  it('fails 400 and audits the rejection when no default is recorded', async () => {
    const { db } = fakeD1({
      ...asAdmin,
      firstResults: {
        'id, subject, reply_to, body, updated_at, updated_by FROM email_templates': STORED_ROW,
        'default_subject, default_body FROM email_templates': { default_subject: '', default_body: '' },
      },
    });
    const sink = vi.fn();
    const result = await actions.reset(postEvent(admin, {}, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reset', entity: 'email-template', entityId: 'class_offer' }),
    );
  });
});
