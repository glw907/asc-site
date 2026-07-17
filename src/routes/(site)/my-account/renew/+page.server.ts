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
};
