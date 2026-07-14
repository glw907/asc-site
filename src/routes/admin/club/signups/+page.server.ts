// The Club section's signup-review queue (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B: "Signup review as a queue screen, the office-list pattern again; approve/deny
// with the email templates"), now reading live `asc-club` data through `signup-reviews-store.ts`
// (Task 8, docs/plans/2026-07-14-membership-admin.md). THE REAL SEMANTICS, load-bearing everywhere
// in this file and its screen: membership activates IMMEDIATELY on payment, so this queue is a
// POST-HOC background check the board runs in the background (2-3 days, silence unless there's an
// issue), never a gate. Nothing here can un-activate a membership; a `denied` outcome only records
// that the board found something worth a human follow-up.
//
// Both actions run through `clubAdminAction`: any club role suffices here, the same routine-domain
// gate Events and Classes both use, since neither action is owner-scoped.
import { fail, redirect } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { pendingSignupReviews, resolveSignupReview, reviewedThisSeasonCount } from '$admin-club/lib/signup-reviews-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return { reviews: [], reviewedThisSeason: 0 };

  const season = await getCurrentSeason(db);
  const [reviews, reviewedThisSeason] = await Promise.all([
    pendingSignupReviews(db),
    reviewedThisSeasonCount(db, season),
  ]);
  return { reviews, reviewedThisSeason };
};

/** Reads `id` (a `memberships.id`) off a posted form, failing closed (400) rather than throwing
 *  when it is missing: a stripped or hand-crafted post is a bad request, not a server error. */
function requireReviewId(formData: FormData) {
  const id = formData.get('id');
  return typeof id === 'string' && id ? id : null;
}

/** Whether `id` names a real `memberships` row: a stale or hand-crafted post (the queue's own
 *  row already resolved, or the id simply doesn't exist) answers 404 rather than writing an
 *  orphaned resolution row `signup_review_resolutions`'s own `REFERENCES memberships(id)` would
 *  reject anyway, but explained as a normal not-found rather than a raw constraint failure. */
async function membershipExists(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM memberships WHERE id = ?1').bind(id).first<{ id: string }>();
  return row !== null;
}

const DENIED_MESSAGE = 'A club role is required to review signups.';

export const actions: Actions = {
  // Approve is the acknowledging no-op: the common case, no data beyond who acted and when. It
  // simply clears the row from the queue. `adminAction` (which `clubAdminAction` composes)
  // requires an audit emit on every path through the handler, a rejected attempt included, so a
  // stripped or hand-crafted post still leaves a record of what was tried.
  approve: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireReviewId(form);
      if (!id) {
        ctx.audit({ action: 'approve', entity: 'signup', detail: 'rejected: missing review id' });
        return fail(400, { error: 'Missing review id.' });
      }
      if (!(await membershipExists(ctx.db, id))) {
        ctx.audit({ action: 'approve', entity: 'signup', entityId: id, detail: 'rejected: no such membership' });
        return fail(404, { error: 'No such signup review.' });
      }
      await resolveSignupReview(ctx.db, { membershipId: id, outcome: 'approved', resolvedBy: ctx.editor.email });
      ctx.audit({ action: 'approve', entity: 'signup', entityId: id });
      redirect(303, '/admin/club/signups');
    },
    { action: 'approve', entity: 'signup', deniedMessage: DENIED_MESSAGE },
  ),
  // Deny is the rare path (the dialog confirm on the screen): it requires a reason and records it
  // for the audit trail. Telling the member what happened is a manual step today; a real
  // member-communication send is a TODO for a later pass.
  deny: clubAdminAction(
    async ({ form, ctx }) => {
      const id = requireReviewId(form);
      if (!id) {
        ctx.audit({ action: 'deny', entity: 'signup', detail: 'rejected: missing review id' });
        return fail(400, { error: 'Missing review id.' });
      }
      const reason = form.get('reason');
      if (typeof reason !== 'string' || !reason.trim()) {
        ctx.audit({ action: 'deny', entity: 'signup', entityId: id, detail: 'rejected: missing reason' });
        return fail(400, { error: 'A reason is required to deny a signup.', id });
      }
      if (!(await membershipExists(ctx.db, id))) {
        ctx.audit({ action: 'deny', entity: 'signup', entityId: id, detail: 'rejected: no such membership' });
        return fail(404, { error: 'No such signup review.' });
      }
      const trimmedReason = reason.trim();
      await resolveSignupReview(ctx.db, {
        membershipId: id,
        outcome: 'denied',
        note: trimmedReason,
        resolvedBy: ctx.editor.email,
      });
      ctx.audit({ action: 'deny', entity: 'signup', entityId: id, detail: trimmedReason });
      redirect(303, '/admin/club/signups');
    },
    { action: 'deny', entity: 'signup', deniedMessage: DENIED_MESSAGE },
  ),
};
