import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure, isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import { actions } from '../routes/admin/club/signups/+page.server';
import { getSignupReview } from '$admin-club/lib/demo-members';

const owner: Editor = { email: 'owner@example.com', displayName: 'Owner', role: 'owner' };

/** The exact event type each action expects, read off the action itself rather than hand-typed,
 *  so this stays correct if the route's generated types ever change. */
type SignupsActionEvent = Parameters<typeof actions.approve>[0];

/**
 * A fake POST event carrying exactly what these actions read: `locals.editor` (through
 * `adminAction`'s `requireSession`/`requireOwner`) and `request.formData()`. The cast is narrow
 * and explained, not a blanket `any`: neither action touches any of the real event's other
 * properties (`cookies`, `params`, `platform`, and so on), so a full mock would be padding, not
 * signal.
 */
function postEvent(editor: Editor | null, fields: Record<string, string>): SignupsActionEvent {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const request = new Request('http://localhost/admin/club/signups', { method: 'POST', body: formData });
  return { locals: { editor }, request } as SignupsActionEvent;
}

async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

describe('signups actions: CSRF-guard-adjacent editor gate', () => {
  // The CSRF token itself is verified by the engine's route-agnostic guard (see adminAction.ts's
  // own header comment), not by this action; what these actions own is the editor-identity gate,
  // which is what this suite exercises, the same split admin-action.test.ts already covers for
  // the wrapper directly.
  it('rejects approve with no signed-in editor', async () => {
    await expect(actions.approve(postEvent(null, { id: 'review-marchetti-2026' }))).rejects.toThrow();
  });

  it('rejects deny with no signed-in editor', async () => {
    await expect(actions.deny(postEvent(null, { id: 'review-marchetti-2026', reason: 'x' }))).rejects.toThrow();
  });
});

describe('signups actions: approve', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails 400 without an id', async () => {
    const result = await actions.approve(postEvent(owner, {}));
    expect(isActionFailure(result)).toBe(true);
  });

  it('fails 404 for a review id that does not exist', async () => {
    const result = await actions.approve(postEvent(owner, { id: 'review-does-not-exist' }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('clears the row, redirects to the queue, and audits the actor', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const before = getSignupReview('review-oyelaran-2026');
    expect(before?.outcome).toBeNull();

    const caught = await catchThrown(actions.approve(postEvent(owner, { id: 'review-oyelaran-2026' })));

    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).status).toBe(303);
    expect((caught as Redirect).location).toBe('/admin/club/signups');
    expect(getSignupReview('review-oyelaran-2026')?.outcome).toBe('approved');
    expect(getSignupReview('review-oyelaran-2026')?.reason).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith(
      'club.audit',
      expect.objectContaining({ actor: owner.email, action: 'club.signups.approved' }),
    );
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
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const caught = await catchThrown(
      actions.deny(postEvent(owner, { id: 'review-drummond-2026', reason: 'Payment does not match the invoice.' })),
    );

    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).status).toBe(303);
    expect(getSignupReview('review-drummond-2026')?.outcome).toBe('denied');
    expect(getSignupReview('review-drummond-2026')?.reason).toBe('Payment does not match the invoice.');
    expect(infoSpy).toHaveBeenCalledWith(
      'club.audit',
      expect.objectContaining({
        actor: owner.email,
        action: 'club.signups.denied',
        detail: { reviewId: 'review-drummond-2026', reason: 'Payment does not match the invoice.' },
      }),
    );
  });
});
