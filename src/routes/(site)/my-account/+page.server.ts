// /my-account: the member landing (signed in) and the sign-in form (signed out), one route for
// both per the design doc's own IA ("the landing" doubles as sign-in when no session exists).
// The signed-in state is the portal redesign pass's rebuilt member home
// (docs/2026-07-16-portal-redesign-design.md): the standing/renewal masthead, the value mirror,
// weighted action rows, recent receipts, the subordinate rail (household / gear & moorings /
// classes), and the doors row. The asset-fee pay door (`payments.ts`'s own deferred-consumer
// note) mints or reuses a real row and hands it to a real Stripe Checkout Session; a
// checkout-unavailable submission degrades to the same stub message every other payment form on
// this site shows, never a broken button.
//
// The three asset VERBS that carry no fee (release, request, cancel a request) moved to
// `/my-account/gear` in T2b (the design doc's own "gear door" ruling,
// docs/design-benchmark/decisions.md): the gear route owns their server actions and forms now.
// `?/payAssetFee` and `?/payRequest` stay here, since paying is the landing's one weighted
// "Needs your attention" action row; the gear page's own outstanding-fee rows POST to these two
// actions by their full route-relative path. `?/renew` moved to `/my-account/renew` in T2c (the
// design doc's own "the renewal door" ruling, docs/design-benchmark/decisions.md): the masthead's
// fireweed CTA is now a plain link to that route, never a form posting a hidden tier field.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestMemberLink, destroyMemberSession, issueMemberCsrfToken, validateMemberCsrfToken } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getMemberStanding } from '$member-auth/lib/standing';
import { getClassRegistrationOpens, getCurrentSeason } from '$admin-club/lib/club-settings';
import { getHouseholdInfo, listHouseholdMembers } from '$member-portal/lib/household';
import { getCreditBalance } from '$member-portal/lib/credits';
import {
  getPayableAssignmentFee,
  listHouseholdAssignments,
  listHouseholdWaitlistEntries,
  listHouseholdRequests,
  payForApprovedRequest,
} from '$member-portal/lib/assets';
import { listMyClasses, listMyWaitlistEntries } from '$member-portal/lib/classes';
import { listReceipts } from '$member-portal/lib/receipts';
import { buildActionRows } from '$member-portal/lib/action-rows';
import { portalState, valueMirror } from '$member-portal/lib/portal-state';
import { portalAction, type PortalActionContext, type PortalActionEvent } from '$member-portal/lib/portal-action';
import { checkoutOrStub } from '$member-portal/lib/checkout';
import { nextUnclaimedRenewalSeason } from '$member-portal/lib/renewal';
import { loadSeasonHasLiveEvents } from '$theme/season-data';
import { siteConfig } from '$theme/cairn.config';
import { verifyTurnstile } from '$theme/turnstile';
import { checkRateLimitKeys, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';

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

  const [
    standing,
    householdInfo,
    householdMembers,
    creditBalance,
    currentSeason,
    waitlistEntries,
    requests,
    receipts,
    myClasses,
    myWaitlist,
    seasonHasLiveEvents,
    classRegistrationOpens,
  ] = await Promise.all([
    getMemberStanding(db, member.id),
    getHouseholdInfo(db, member.householdId),
    listHouseholdMembers(db, member.householdId),
    getCreditBalance(db, member.householdId),
    getCurrentSeason(db),
    listHouseholdWaitlistEntries(db, member.householdId),
    listHouseholdRequests(db, member.householdId),
    listReceipts(db, member.householdId),
    listMyClasses(db, member.householdId),
    listMyWaitlistEntries(db, member.householdId),
    loadSeasonHasLiveEvents(db),
    getClassRegistrationOpens(db),
  ]);
  const assignments = await listHouseholdAssignments(db, member.householdId, currentSeason);
  const actionRows = buildActionRows({ assignments, requests, waitlistEntries: myWaitlist });
  const state = portalState({ standing, seasonHasLiveEvents, classRegistrationOpens, hasWeightedActionRows: actionRows.length > 0 });
  const mirrorSegments = valueMirror({ householdMembers, assets: assignments, creditBalance });
  // The masthead's renewal CTA names the season this click will actually buy (decisions.md's
  // "the renewal door"), not just `currentSeason`: a household that already paid for
  // `currentSeason` renews straight into the next unclaimed one, and the button's link text
  // linking to `/my-account/renew` would otherwise state a season the door itself does not
  // purchase.
  const renewalSeason = await nextUnclaimedRenewalSeason(db, member.householdId, currentSeason);

  return {
    member,
    csrf,
    standing,
    householdInfo,
    householdMembers,
    creditBalance,
    currentSeason,
    renewalSeason,
    assignments,
    waitlistEntries,
    receipts,
    myClasses,
    actionRows,
    state,
    mirrorSegments,
  };
};

export const actions: Actions = {
  requestLink: async (event) => {
    if (!(await validateMemberCsrfToken(event))) return fail(403, { error: 'Please try again.' });

    const form = await event.request.formData();
    const email = String(form.get('email') ?? '').trim();
    if (!email) return fail(400, { error: 'Please enter your email address.' });

    // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b): every
    // public POST, keyed per IP and per email. This action sends a magic-link email on every
    // valid submit, the same send-path abuse class as `resend`/`requestRenewLink`.
    const rateLimitAllowed = await checkRateLimitKeys(event.platform?.env.RATE_LIMIT_PUBLIC_POST, [`ip:${event.getClientAddress()}`, `email:${email.toLowerCase()}`]);
    if (!rateLimitAllowed) return fail(429, { error: RATE_LIMIT_MESSAGE });

    // Turnstile-gated (2026-07-15 hardening pass, matching the family's own
    // `if (secret && !verify) fail/invalid` pattern): the signed-out sign-in form sends a
    // magic-link email on every valid submit, the same send-path abuse class as `resend`/
    // `requestRenewLink`.
    const secret = event.platform?.env.TURNSTILE_SECRET_KEY;
    const token = String(form.get('cf-turnstile-response') ?? '');
    if (secret && !(await verifyTurnstile(token, event.getClientAddress(), secret))) {
      return fail(400, { error: 'Spam check failed. Please try again.' });
    }

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

  // Resolves an approved retention request into a real assignment plus an outstanding
  // `asset_payments` row (`payForApprovedRequest`), then hands that assignment straight to a real
  // `asset-fee` Checkout Session (Task 6). If the checkout is abandoned, the assignment now shows
  // under "Your assets" with its own retry-capable `?/payAssetFee` door below.
  payRequest: portalAction(async ({ event, form, ctx }) => {
    const requestId = String(form.get('requestId') ?? '');
    if (!requestId) return fail(400, { error: 'Missing request id.' });
    const result = await payForApprovedRequest(ctx.db, requestId, ctx.member.householdId);
    if ('error' in result) return fail(400, { error: result.error });
    return payAssetFeeCheckout(event, ctx, result.assignmentId);
  }),

  // The portal's own retry-capable asset-fee pay door (Task 6): "an approved, unpaid asset
  // assignment shows its fee and a pay door through the asset-fee checkout" — the assignments
  // list's own "Pay" button for any assignment `?/payRequest` above already resolved but whose
  // checkout was abandoned.
  payAssetFee: portalAction(async ({ event, form, ctx }) => {
    const assignmentId = String(form.get('assignmentId') ?? '');
    if (!assignmentId) return fail(400, { error: 'Missing assignment id.' });
    return payAssetFeeCheckout(event, ctx, assignmentId);
  }),
};

/** Shared by both asset-fee pay doors above: re-verifies the outstanding fee server-side
 *  ({@link getPayableAssignmentFee}, never trusting whatever `listHouseholdAssignments` last
 *  rendered) and hands it to {@link checkoutOrStub}. */
async function payAssetFeeCheckout(event: PortalActionEvent, ctx: PortalActionContext, assignmentId: string) {
  const currentSeason = await getCurrentSeason(ctx.db);
  const payable = await getPayableAssignmentFee(ctx.db, assignmentId, ctx.member.householdId, currentSeason);
  if ('error' in payable) return fail(400, { error: payable.error });

  return checkoutOrStub(event, ctx, 'assetPayStubbed', {
    kind: 'asset-fee',
    refId: assignmentId,
    amountCents: payable.amountCents,
    description: `${payable.assetTypeName} fee`,
  });
}
