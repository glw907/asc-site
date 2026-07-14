// /my-account: the member landing (signed in) and the sign-in form (signed out), one route for
// both per the design doc's own IA ("the landing" doubles as sign-in when no session exists) and
// mockup frames 01/02. The signed-in state composes every module this portal-capstone pass built:
// standing (member-auth), the task list, the household card, a receipts stub, and the assets
// summary (current assignments + waitlist positions + any pending requests). Renewal (Task 6,
// `docs/2026-07-13-unified-signup-design.md`'s "Renew and welcome-back") and the asset-fee pay
// door (`payments.ts`'s own deferred-consumer note) both mint or reuse a real row and hand it to a
// real Stripe Checkout Session; a checkout-unavailable submission degrades to the same stub
// message every other payment form on this site shows, never a broken button.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requestMemberLink, destroyMemberSession, issueMemberCsrfToken, validateMemberCsrfToken } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getMemberStanding, MEMBERSHIP_TIER_LABEL, type MembershipTier } from '$member-auth/lib/standing';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';
import { getHouseholdInfo, listHouseholdMembers } from '$member-portal/lib/household';
import { getCreditBalance } from '$member-portal/lib/credits';
import {
  cancelAssetRequest,
  createAssetRequest,
  getPayableAssignmentFee,
  listHouseholdAssignments,
  listHouseholdWaitlistEntries,
  listHouseholdRequests,
  listRequestableAssetTypes,
  payForApprovedRequest,
  releaseHouseholdAssignment,
} from '$member-portal/lib/assets';
import { listReceipts } from '$member-portal/lib/receipts';
import { buildTaskList } from '$member-portal/lib/tasks';
import { mintOrReuseRenewalMembership } from '$member-portal/lib/renewal';
import { portalAction, type PortalActionContext, type PortalActionEvent } from '$member-portal/lib/portal-action';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv } from '$admin-club/lib/payments';
import { siteConfig } from '$theme/cairn.config';

export const prerender = false;

// The site's established from-address, matching contact.remote.ts's own FROM_ADDRESS constant
// (kept as this route's own copy rather than importing that module, since member-auth's send
// path should not depend on the contact form's).
const FROM_ADDRESS = 'noreply@aksailingclub.org';

/** `MembershipTier`'s own three values (matching `$theme/join-apply-form.ts`'s own
 *  `MEMBERSHIP_TIERS` precedent): the renew card's tier picker and the `?/renew` action's own
 *  input validation both need the plain list. */
const MEMBERSHIP_TIERS: readonly MembershipTier[] = ['individual', 'family', 'young-adult'];

function isMembershipTier(value: string): value is MembershipTier {
  return (MEMBERSHIP_TIERS as readonly string[]).includes(value);
}

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) return { member: null, csrf, standing: null };

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { member, csrf, standing: null };

  const [standing, householdInfo, householdMembers, creditBalance, currentSeason, waitlistEntries, requests, receipts, assetTypes, tierPrices] = await Promise.all([
    getMemberStanding(db, member.id),
    getHouseholdInfo(db, member.householdId),
    listHouseholdMembers(db, member.householdId),
    getCreditBalance(db, member.householdId),
    getCurrentSeason(db),
    listHouseholdWaitlistEntries(db, member.householdId),
    listHouseholdRequests(db, member.householdId),
    listReceipts(db, member.householdId),
    listRequestableAssetTypes(db),
    getTierPrices(db),
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
    assetTypes,
    tierPrices,
  };
};

/**
 * Build a Stripe Checkout Session for `kind`/`refId`/`amountCents` and redirect the member
 * straight to it, degrading to `{ <stubbedKey>: true }` when `STRIPE_SECRET_KEY` is not bound
 * (the same stub-message shape every other payment form on this site returns) and to a `fail(502)`
 * when a configured key still failed to create the session. Shared by `?/renew` and both asset-fee
 * pay doors (`?/payRequest`, `?/payAssetFee`) so the checkout-vs-stub-vs-error branching lives in
 * one place.
 */
async function checkoutOrStub(
  event: PortalActionEvent,
  ctx: PortalActionContext,
  stubbedKey: string,
  args: { kind: 'dues' | 'asset-fee'; refId: string; amountCents: number; description: string },
) {
  const env = event.platform?.env as CreateCheckoutEnv | undefined;
  try {
    const result = await createCheckout(env ?? {}, {
      kind: args.kind,
      refId: args.refId,
      amountCents: args.amountCents,
      description: args.description,
      origin: event.url.origin,
      successPath: '/payment/confirmation/',
      cancelPath: '/my-account',
      customerEmail: ctx.member.email ?? undefined,
    });
    if ('url' in result) redirect(303, result.url);
    return { [stubbedKey]: true } as Record<string, true>;
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) return fail(502, { error: err.message });
    throw err;
  }
}

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

  // The portal renew card (Task 6): mints or reuses the household's next unclaimed season's
  // unpaid membership row at the submitted tier and the CURRENT settings price
  // (`mintOrReuseRenewalMembership`, `renewal.ts`'s own "duplicate protection" rule), then hands
  // it straight to a plain `dues` Checkout Session. The `#renew` anchor the reminder emails
  // target lands on this same card (the template's own `id="renew"`), whatever the member's
  // standing.
  renew: portalAction(async ({ event, form, ctx }) => {
    const tierRaw = String(form.get('tier') ?? '');
    if (!isMembershipTier(tierRaw)) return fail(400, { error: 'Please choose a membership tier.' });

    const prices = await getTierPrices(ctx.db);
    const priceDollars = prices[tierRaw];
    const currentSeason = await getCurrentSeason(ctx.db);
    const { membershipId } = await mintOrReuseRenewalMembership(ctx.db, ctx.member.householdId, ctx.member.id, tierRaw, priceDollars, currentSeason);

    return checkoutOrStub(event, ctx, 'renewStubbed', {
      kind: 'dues',
      refId: membershipId,
      amountCents: Math.round(priceDollars * 100),
      description: `${MEMBERSHIP_TIER_LABEL[tierRaw]} Membership dues`,
    });
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

  // Request an asset (design doc's own "Request an asset": a type picker plus a one-line note; any
  // adult member may). Always `kind: 'new'` here: the year-to-year retention ask surfaces IN the
  // renewal flow instead (this pass's own scope note), not from this general request form.
  requestAsset: portalAction(async ({ form, ctx }) => {
    const assetType = String(form.get('assetType') ?? '').trim();
    if (!assetType) return fail(400, { error: 'Please choose an asset type.' });
    const note = String(form.get('note') ?? '').trim() || null;
    await createAssetRequest(ctx.db, { assetType, householdId: ctx.member.householdId, requestedBy: ctx.member.id, kind: 'new', note });
    return { requested: true as const };
  }),

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
