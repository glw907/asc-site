// The Club section's Member detail (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B): a two-pane read against the same pass-2.2 schema preview the list reads. A
// member's own household owns the membership, payment, and credit history (see demo-members.ts's
// design choice 2: a Member and a Membership are different entities), so this load reads that
// household's records, not per-member ones. A miss on `id` is not thrown as a SvelteKit
// error(404): throwing would bubble past `/admin`'s own layout to the root +error.svelte, which
// rebuilds the PUBLIC site chrome (see that file's own header comment), not the admin shell.
// Returning an honest `member: null` instead lets the page render a themed not-found state inside
// the admin chrome, the same honest-empty-state posture the Events/Classes screens already use
// for a read failure.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import {
  creditBalance,
  getCreditGrantsForHousehold,
  getCreditRedemptionsForHousehold,
  getHousehold,
  getHouseholdMembers,
  getMember,
  getMembershipsForHousehold,
  getPaymentForMembership,
  isHouseholdPrimary,
  segmentForMember,
  currentSeasonPaymentStatus,
  type MembershipTier,
} from '$admin-club/lib/demo-members';

/** One entry in the detail page's activity timeline: either a season's membership/payment row,
 *  or a credit redemption against the household's ledger. Both are dated so they interleave in
 *  one most-recent-first list. */
export type TimelineEntry =
  | { kind: 'membership'; date: string; season: number; tier: MembershipTier; paymentStatus: 'paid' | 'pending'; amount: number; paidDate: string | null }
  | { kind: 'redemption'; date: string; memberName: string; classEnrollmentRef: string };

export const load: PageServerLoad = (event) => {
  requireSession(event);
  const member = getMember(event.params.id);
  if (!member) return { member: null };

  const household = getHousehold(member.householdId);
  const otherHouseholdMembers = getHouseholdMembers(member.householdId).filter((m) => m.id !== member.id);

  const membershipEntries: TimelineEntry[] = household
    ? getMembershipsForHousehold(household.id).map((membership) => {
        const payment = getPaymentForMembership(membership.id);
        return {
          kind: 'membership',
          date: payment?.paidDate ?? `${membership.season}-01-01`,
          season: membership.season,
          tier: membership.tier,
          paymentStatus: payment?.status ?? 'pending',
          amount: payment?.amount ?? membership.pricePaid,
          paidDate: payment?.paidDate ?? null,
        };
      })
    : [];

  const redemptionEntries: TimelineEntry[] = household
    ? getCreditRedemptionsForHousehold(household.id).map((redemption) => ({
        kind: 'redemption',
        date: redemption.redeemedAt,
        memberName: getMember(redemption.memberId)?.name ?? 'A household member',
        classEnrollmentRef: redemption.classEnrollmentRef,
      }))
    : [];

  const timeline = [...membershipEntries, ...redemptionEntries].sort((a, b) => (a.date < b.date ? 1 : -1));

  const creditsGranted = household
    ? getCreditGrantsForHousehold(household.id).reduce((sum, grant) => sum + grant.amount, 0)
    : 0;
  const creditsRemaining = household ? creditBalance(household.id) : 0;

  return {
    member,
    household,
    otherHouseholdMembers,
    isPrimary: isHouseholdPrimary(member.id),
    segment: segmentForMember(member.id),
    currentSeasonPaymentStatus: currentSeasonPaymentStatus(member.id),
    // The household's own most recent membership tier (its last renewal's tier, current or
    // not); there is no separate per-member tier to read (design choice 2).
    mostRecentTier: household ? (getMembershipsForHousehold(household.id)[0]?.tier ?? null) : null,
    creditsGranted,
    creditsRemaining,
    timeline,
  };
};
