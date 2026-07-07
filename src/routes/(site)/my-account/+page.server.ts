// /my-account: the member landing (signed in) and the sign-in form (signed out), one route for
// both per the design doc's own IA ("the landing" doubles as sign-in when no session exists) and
// mockup frames 01/02. The signed-in state composes every module this portal-capstone pass built:
// standing (member-auth), the task list, the household card, a receipts stub, and the assets
// summary (current assignments + waitlist positions + any pending requests). Renewal and asset
// payment are both honest stubs today (this task's own instruction: a real Stripe key is
// pending): the "Renew" and "Pay for your <asset>" actions below record intent and say so
// on-screen, never pretending a charge happened.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestMemberLink, destroyMemberSession, issueMemberCsrfToken, validateMemberCsrfToken } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getMemberStanding } from '$member-auth/lib/standing';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import { getHouseholdInfo, listHouseholdMembers } from '$member-portal/lib/household';
import { getCreditBalance } from '$member-portal/lib/credits';
import { listHouseholdAssignments, listHouseholdWaitlistEntries, listHouseholdRequests, cancelAssetRequest, releaseHouseholdAssignment, payForApprovedRequest } from '$member-portal/lib/assets';
import { listReceipts } from '$member-portal/lib/receipts';
import { buildTaskList } from '$member-portal/lib/tasks';
import { portalAction } from '$member-portal/lib/portal-action';
import { siteConfig } from '$theme/cairn.config';

export const prerender = false;

// The site's established from-address, matching contact.remote.ts's own FROM_ADDRESS constant
// (kept as this route's own copy rather than importing that module, since member-auth's send
// path should not depend on the contact form's).
const FROM_ADDRESS = 'noreply@aksailingclub.org';

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) return { member: null, csrf, standing: null };

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { member, csrf, standing: null };

  const [standing, householdInfo, householdMembers, creditBalance, currentSeason, waitlistEntries, requests, receipts] = await Promise.all([
    getMemberStanding(db, member.id),
    getHouseholdInfo(db, member.householdId),
    listHouseholdMembers(db, member.householdId),
    getCreditBalance(db, member.householdId),
    getCurrentSeason(db),
    listHouseholdWaitlistEntries(db, member.householdId),
    listHouseholdRequests(db, member.householdId),
    listReceipts(db, member.householdId),
  ]);
  const assignments = await listHouseholdAssignments(db, member.householdId, currentSeason);
  const isPrimary = householdInfo?.primaryMemberId === member.id;
  const tasks = buildTaskList({ standing, creditBalance, assetRequests: requests });

  return {
    member,
    csrf,
    standing,
    householdInfo,
    householdMembers,
    isPrimary,
    creditBalance,
    assignments,
    waitlistEntries,
    requests,
    receipts,
    tasks,
  };
};

export const actions: Actions = {
  requestLink: async (event) => {
    if (!(await validateMemberCsrfToken(event))) return fail(403, { error: 'Please try again.' });

    const form = await event.request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { error: 'Please enter your email address.' });

    const db = resolveMemberDb(event.platform?.env);
    if (!db) return fail(503, { error: "This isn't available right now. Please try again shortly." });
    const emailBinding = event.platform?.env.EMAIL;
    if (!emailBinding) return fail(503, { error: 'Mail service is not configured yet. Contact the club instead.' });

    const result = await requestMemberLink(db, email, (message) => emailBinding.send(message), {
      origin: event.url.origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
    });
    if (result.status === 'send_error') {
      return fail(500, { error: 'Something went wrong sending your link. Please try again.' });
    }
    return { sent: true as const };
  },

  signOut: async (event) => {
    const db = resolveMemberDb(event.platform?.env);
    const cookieName = memberSessionCookieName(event.url.protocol === 'https:');
    const sessionId = event.cookies.get(cookieName);
    if (db && sessionId) await destroyMemberSession(db, sessionId);
    event.cookies.delete(cookieName, { path: '/' });
    redirect(303, '/my-account');
  },

  // The honest renewal stub (payment is out of scope this pass; a real Stripe key is pending):
  // acknowledges the member asked to renew, plainly, rather than pretending Checkout ran. A real
  // renewal flow (this task's own scope decision: not built this pass, see the report) will
  // replace this with the real thing.
  renew: portalAction(async () => {
    return { renewRequested: true as const };
  }),

  releaseAsset: portalAction(async ({ form, ctx }) => {
    const assignmentId = String(form.get('assignmentId') ?? '');
    if (!assignmentId) return fail(400, { error: 'Missing assignment id.' });
    const result = await releaseHouseholdAssignment(ctx.db, assignmentId, ctx.member.householdId);
    if ('error' in result) return fail(400, { error: result.error });
    return { released: true as const };
  }),

  cancelRequest: portalAction(async ({ form, ctx }) => {
    const requestId = String(form.get('requestId') ?? '');
    if (!requestId) return fail(400, { error: 'Missing request id.' });
    const result = await cancelAssetRequest(ctx.db, requestId, ctx.member.householdId, ctx.member.id);
    if ('error' in result) return fail(400, { error: result.error });
    return { cancelled: true as const };
  }),

  payRequest: portalAction(async ({ form, ctx }) => {
    const requestId = String(form.get('requestId') ?? '');
    if (!requestId) return fail(400, { error: 'Missing request id.' });
    const result = await payForApprovedRequest(ctx.db, requestId, ctx.member.householdId);
    if ('error' in result) return fail(400, { error: result.error });
    return { paid: true as const };
  }),
};
