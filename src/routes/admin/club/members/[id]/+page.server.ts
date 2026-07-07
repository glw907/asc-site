// The Club section's Member detail (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B): a two-pane read against the same pass-2.2 schema preview the list reads.
// A miss on `id` is not thrown as a SvelteKit error(404): throwing would bubble past `/admin`'s
// own layout to the root +error.svelte, which rebuilds the PUBLIC site chrome (see that file's
// own header comment), not the admin shell. Returning an honest `member: null` instead lets the
// page render a themed not-found state inside the admin chrome, the same honest-empty-state
// posture the Events/Classes screens already use for a read failure.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import {
  getHousehold,
  getHouseholdMembers,
  getMember,
  getMembershipsForMember,
  getPaymentForMembership,
  standingForMember,
} from '$admin-club/lib/demo-members';

/** One season's row in the detail page's payment timeline. */
export interface TimelineRow {
  season: number;
  paymentStatus: 'paid' | 'pending';
  amount: number;
  paidDate: string | null;
}

export const load: PageServerLoad = (event) => {
  requireSession(event);
  const member = getMember(event.params.id);
  if (!member) return { member: null };

  const household = getHousehold(member.householdId);
  const otherHouseholdMembers = getHouseholdMembers(member.householdId).filter((m) => m.id !== member.id);
  const timeline: TimelineRow[] = getMembershipsForMember(member.id).map((membership) => {
    const payment = getPaymentForMembership(membership.id);
    return {
      season: membership.season,
      paymentStatus: payment?.status ?? 'pending',
      amount: payment?.amount ?? 0,
      paidDate: payment?.paidDate ?? null,
    };
  });

  return {
    member,
    household,
    otherHouseholdMembers,
    standing: standingForMember(member.id),
    timeline,
  };
};
