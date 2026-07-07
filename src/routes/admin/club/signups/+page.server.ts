// The Club section's signup-review queue (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B: "Signup review as a queue screen, the office-list pattern again; approve/deny
// with the email templates"). THE REAL SEMANTICS, load-bearing everywhere in this file and its
// screen: membership activates IMMEDIATELY on payment (design choice 5 in demo-members.ts), so
// this queue is a POST-HOC background check the board runs in the background (2-3 days, silence
// unless there's an issue), never a gate. Nothing here can un-activate a membership; a `denied`
// outcome only records that the board found something worth a human follow-up.
//
// This is the first Club screen with a real write path, so it is also the first live consumer of
// `$admin-club/lib/adminAction.ts` (Part C item 3's stand-in): both actions verify the signed-in
// editor and emit a typed audit record through it, the mutation exemplar every later phase-2
// write flow (renewals, the season rollover, asset assignments) is meant to copy.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { adminAction } from '$admin-club/lib/adminAction';
import {
  CURRENT_SEASON,
  getCreditGrantsForHousehold,
  getHousehold,
  getMember,
  getMembershipsForHousehold,
  getPaymentForMembership,
  getSignupReview,
  pendingSignupReviews,
  resolveSignupReview,
  reviewedThisSeasonCount,
  type MembershipTier,
  type SignupReview,
} from '$admin-club/lib/demo-members';

/** One queue row: the evidence a reviewer needs beside the decision (who, household, tier, this
 *  season's paid amount and date, and the household's total granted credits), derived from the
 *  same member/household/membership/payment/credit-grant facts every other Club screen reads,
 *  never a second copy of them. */
export interface SignupReviewRow {
  id: string;
  memberName: string;
  household: string;
  tier: MembershipTier;
  paidAmount: number;
  paidDate: string | null;
  creditGrant: number;
  submittedAt: string;
  flagNote: string | null;
}

function toRow(review: SignupReview): SignupReviewRow | null {
  const member = getMember(review.memberId);
  if (!member) return null;
  const membership = getMembershipsForHousehold(member.householdId).find((m) => m.season === CURRENT_SEASON);
  const payment = membership ? getPaymentForMembership(membership.id) : undefined;
  const creditGrant = getCreditGrantsForHousehold(member.householdId).reduce((sum, grant) => sum + grant.amount, 0);
  return {
    id: review.id,
    memberName: member.name,
    household: getHousehold(member.householdId)?.name ?? 'No household on file',
    tier: membership?.tier ?? 'individual',
    paidAmount: payment?.amount ?? 0,
    paidDate: payment?.paidDate ?? null,
    creditGrant,
    submittedAt: review.submittedAt,
    flagNote: review.flagNote,
  };
}

export const load: PageServerLoad = (event) => {
  requireSession(event);
  const reviews = pendingSignupReviews()
    .map(toRow)
    .filter((row): row is SignupReviewRow => row !== null);
  return { reviews, reviewedThisSeason: reviewedThisSeasonCount() };
};

/** Reads `id` off a posted form, failing closed (400) rather than throwing when it is missing:
 *  a stripped or hand-crafted post is a bad request, not a server error. */
function requireReviewId(formData: FormData) {
  const id = formData.get('id');
  return typeof id === 'string' && id ? id : null;
}

export const actions: Actions = {
  // Approve is design choice 10's acknowledging no-op: the common case, no data beyond who acted
  // and when. It simply clears the row from the queue.
  approve: async (event) => {
    const { editor, audit } = adminAction(event);
    const formData = await event.request.formData();
    const id = requireReviewId(formData);
    if (!id) return fail(400, { error: 'Missing review id.' });
    if (!getSignupReview(id)) return fail(404, { error: 'No such signup review.' });
    resolveSignupReview(id, 'approved', { reviewedBy: editor.email });
    audit('club.signups.approved', { reviewId: id });
    throw redirect(303, '/admin/club/signups');
  },
  // Deny is the rare path (the dialog confirm on the screen): it requires a reason and records it
  // for the audit trail. Telling the member what happened is a manual step today; a real
  // member-communication send is a TODO for pass 2.2's real store.
  deny: async (event) => {
    const { editor, audit } = adminAction(event);
    const formData = await event.request.formData();
    const id = requireReviewId(formData);
    if (!id) return fail(400, { error: 'Missing review id.' });
    const reason = formData.get('reason');
    if (typeof reason !== 'string' || !reason.trim()) {
      return fail(400, { error: 'A reason is required to deny a signup.', id });
    }
    if (!getSignupReview(id)) return fail(404, { error: 'No such signup review.' });
    resolveSignupReview(id, 'denied', { reason, reviewedBy: editor.email });
    audit('club.signups.denied', { reviewId: id, reason: reason.trim() });
    throw redirect(303, '/admin/club/signups');
  },
};
