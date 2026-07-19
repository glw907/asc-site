// /my-account/renew: the renewal door (T2c of the portal redesign pass, decisions.md's own "the
// renewal door" ruling). T2's masthead drew the renewal CTA as one plain fireweed button with a
// hidden tier field defaulting to the household's last-held tier -- a household that grew from
// individual to family would silently buy the wrong tier at the wrong price on that one click (3
// of 88 renewals with a prior season changed tier, roughly 3.4%). This route states the
// household's current tier and price plainly and offers the other tiers at their real settings
// prices, so the member sees exactly what they are buying before they click. The masthead's CTA
// links here now instead of posting.
//
// `?/renew` moved here verbatim from `/my-account/+page.server.ts` (T2b's own "server actions
// move with their forms" precedent): same `mintOrReuseRenewalMembership` call, same
// `checkoutOrStub` degrade-to-stub path, same CSRF handling via `portalAction`. No payment logic
// changed.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getMemberStanding, MEMBERSHIP_TIER_LABEL, type MembershipTier } from '$member-auth/lib/standing';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';
import { mintOrReuseRenewalMembership, nextUnclaimedRenewalSeason } from '$member-portal/lib/renewal';
import { portalAction } from '$member-portal/lib/portal-action';
import { checkoutOrStub } from '$member-portal/lib/checkout';
import { documents } from '$chassis/content';
import { loadPublishedDocuments } from '$theme/documents';
import { householdSignaturesComplete } from '$member-portal/lib/waiver-requirements';

/** The signing moment for the renewal household-complete gate: the SAME redirect target, whether
 *  the gate refuses at `load` (a member visiting the page directly) or at `?/renew` (a stale tab
 *  submitting past a page that already redirected everyone else) -- member-waivers T5b, spec rule
 *  7's amendment: "the managing adult's renewal start routes through the signing moment". */
const SIGN_REDIRECT = '/my-account/sign?context=renewal&next=%2Fmy-account%2Frenew';

export const prerender = false;

/** `MembershipTier`'s own three values (matching `$theme/join-apply-form.ts`'s own
 *  `MEMBERSHIP_TIERS` precedent): the tier picker's own option list and the `?/renew` action's
 *  input validation both need the plain list. */
const MEMBERSHIP_TIERS: readonly MembershipTier[] = ['individual', 'family', 'young-adult'];

function isMembershipTier(value: string): value is MembershipTier {
  return (MEMBERSHIP_TIERS as readonly string[]).includes(value);
}

/** One tier option the picker renders: its display label and the CURRENT settings price, never a
 *  price the template computes itself. */
export interface RenewTierOption {
  tier: MembershipTier;
  label: string;
  priceDollars: number;
}

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, standing: null, currentSeason: null, renewalSeason: null, tiers: null };

  const [standing, currentSeason, prices] = await Promise.all([getMemberStanding(db, member.id), getCurrentSeason(db), getTierPrices(db)]);

  // The household-complete gate (member-waivers T5b, spec rule 7's amendment): a renewal start
  // routes through the signing moment first, whether it is the signer's own outstanding documents
  // or the household is only waiting on someone else -- the sign page itself decides which of
  // those two states to show (T5b's own "Waiting on {name}" vs the ordinary moment). Documents key
  // to `getCurrentSeason` throughout this pass (T4's own convention, matched here rather than the
  // renewal-specific `renewalSeason` below), so an early renewer for next season still signs
  // against whatever is published for the season now in effect.
  if (!(await householdSignaturesComplete(db, loadPublishedDocuments(documents, currentSeason), member.householdId, currentSeason))) {
    redirect(303, SIGN_REDIRECT);
  }

  // The season this submit will actually buy (decisions.md's "the renewal door": "the member
  // sees exactly what they are buying before they click"), not just `currentSeason` -- a
  // household that already paid for `currentSeason` renews straight into the NEXT unclaimed one
  // (`nextUnclaimedRenewalSeason`, the same read `?/renew` below re-derives at mint time), and
  // the button naming the wrong year is the exact defect this door exists to prevent.
  const renewalSeason = await nextUnclaimedRenewalSeason(db, member.householdId, currentSeason);

  const tiers: RenewTierOption[] = MEMBERSHIP_TIERS.map((tier) => ({ tier, label: MEMBERSHIP_TIER_LABEL[tier], priceDollars: prices[tier] }));

  return { csrf, standing, currentSeason, renewalSeason, tiers };
};

export const actions: Actions = {
  // Moved from `/my-account/+page.server.ts` unchanged (T2c): mints or reuses the household's
  // next unclaimed season's unpaid membership row at the submitted tier and the CURRENT settings
  // price (`mintOrReuseRenewalMembership`, `renewal.ts`'s own "duplicate protection" rule), then
  // hands it straight to a plain `dues` Checkout Session.
  renew: portalAction(async ({ event, form, ctx }) => {
    const tierRaw = String(form.get('tier') ?? '');
    if (!isMembershipTier(tierRaw)) return fail(400, { error: 'Please choose a membership tier.' });

    const currentSeason = await getCurrentSeason(ctx.db);
    // The hard gate, re-checked here (never trusting that the page that rendered this form is the
    // one still open in the browser): no payment proceeds until the household's own signatures
    // are complete, member-waivers T5b's own defense-in-depth mirror of `load`'s redirect above.
    if (!(await householdSignaturesComplete(ctx.db, loadPublishedDocuments(documents, currentSeason), ctx.member.householdId, currentSeason))) {
      redirect(303, SIGN_REDIRECT);
    }

    const prices = await getTierPrices(ctx.db);
    const priceDollars = prices[tierRaw];
    const { membershipId } = await mintOrReuseRenewalMembership(ctx.db, ctx.member.householdId, ctx.member.id, tierRaw, priceDollars, currentSeason);

    return checkoutOrStub(event, ctx, 'renewStubbed', {
      kind: 'dues',
      refId: membershipId,
      amountCents: Math.round(priceDollars * 100),
      description: `${MEMBERSHIP_TIER_LABEL[tierRaw]} Membership dues`,
    });
  }),
};
