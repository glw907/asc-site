import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/signups/+page.server';
import { getSignupReview } from '$admin-club/lib/demo-members';

const owner: Editor = { email: 'owner@example.com', displayName: 'Owner', role: 'owner' };

/** The double-submit pair `adminAction` checks: a `__Host-`-prefixed cookie (issued over https,
 *  matching every real admin request) against the posted `csrf` field. */
const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

/** The exact event type each action expects, read off the action itself rather than hand-typed,
 *  so this stays correct if the route's generated types ever change. */
type SignupsActionEvent = Parameters<typeof actions.approve>[0];

/**
 * A fake POST event carrying exactly what `adminAction` and these handlers read: an https URL (so
 * the CSRF cookie name matches production), a matching cookie/field pair, `locals.editor`, and an
 * optional `auditSink` to capture the emitted records. The cast is narrow and explained, not a
 * blanket `any`: neither handler touches any of the real event's other properties (`params`,
 * `platform`, and so on), so a full mock would be padding, not signal.
 */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { auditSink?: (record: AdminActionAuditRecord) => void } = {},
): SignupsActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/signups';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    locals: { editor, auditSink: opts.auditSink },
  } as unknown as SignupsActionEvent;
}

async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

describe('signups actions: adminAction guard', () => {
  // The CSRF token itself is also verified by the engine's route-agnostic guard (see
  // adminAction's own doc comment); what this exercises is adminAction's defense-in-depth
  // editor gate, thrown as an AdminActionError before either handler runs.
  it('rejects approve with no signed-in editor', async () => {
    await expect(
      actions.approve(postEvent(null, { id: 'review-marchetti-2026' })),
    ).rejects.toThrow();
  });

  it('rejects deny with no signed-in editor', async () => {
    await expect(
      actions.deny(postEvent(null, { id: 'review-marchetti-2026', reason: 'x' })),
    ).rejects.toThrow();
  });
});

describe('signups actions: approve', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 400 without an id, auditing the rejected attempt', async () => {
    const sink = vi.fn();
    const result = await actions.approve(postEvent(owner, {}, { auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'approve', entity: 'signup', editor: owner.email }),
    );
  });

  it('fails 404 for a review id that does not exist', async () => {
    const result = await actions.approve(postEvent(owner, { id: 'review-does-not-exist' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('clears the row, redirects to the queue, and audits the actor', async () => {
    const sink = vi.fn();
    const before = getSignupReview('review-oyelaran-2026');
    expect(before?.outcome).toBeNull();

    const caught = await catchThrown(
      actions.approve(postEvent(owner, { id: 'review-oyelaran-2026' }, { auditSink: sink })),
    );

    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).status).toBe(303);
    expect((caught as Redirect).location).toBe('/admin/club/signups');
    expect(getSignupReview('review-oyelaran-2026')?.outcome).toBe('approved');
    expect(getSignupReview('review-oyelaran-2026')?.reason).toBeNull();
    expect(sink).toHaveBeenCalledWith({
      action: 'approve',
      entity: 'signup',
      entityId: 'review-oyelaran-2026',
      editor: owner.email,
    });
  });
});

describe('signups actions: deny', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 400 without a reason', async () => {
    const result = await actions.deny(postEvent(owner, { id: 'review-drummond-2026' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 400 for a whitespace-only reason', async () => {
    const result = await actions.deny(postEvent(owner, { id: 'review-drummond-2026', reason: '   ' }));
    expect(isActionFailure(result)).toBe(true);
  });

  it('records the reason, redirects, and audits it', async () => {
    const sink = vi.fn();

    const caught = await catchThrown(
      actions.deny(
        postEvent(
          owner,
          { id: 'review-drummond-2026', reason: 'Payment does not match the invoice.' },
          { auditSink: sink },
        ),
      ),
    );

    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).status).toBe(303);
    expect(getSignupReview('review-drummond-2026')?.outcome).toBe('denied');
    expect(getSignupReview('review-drummond-2026')?.reason).toBe('Payment does not match the invoice.');
    expect(sink).toHaveBeenCalledWith({
      action: 'deny',
      entity: 'signup',
      entityId: 'review-drummond-2026',
      detail: 'Payment does not match the invoice.',
      editor: owner.email,
    });
  });
});
