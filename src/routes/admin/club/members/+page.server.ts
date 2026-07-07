// The Club section's Members screen (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B): the list reads the pass-2.2 schema preview (src/admin-club/lib/demo-
// members.ts) rather than a live store, since the real member model doesn't exist yet (see that
// file's header comment, which also records the club's real ~180-member/~100-household scale
// this screen is designed for). MemberRow is deliberately the row shape a real D1 query would
// project (member id, name, email, household name, segment, this-season payment status,
// visibility, joined date), so swapping this load's import for a real query is a one-file
// change, not a reshape of the screen. Search and pagination live client-side in the Svelte
// component (the same load-once, filter-in-memory shape the Events/Classes screens already use),
// which is enough for a real query to page and search server-side later without this load
// changing shape.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import {
  getHousehold,
  members,
  segmentForMember,
  currentSeasonPaymentStatus,
  type MemberSegment,
  type DirectoryVisibility,
  type PaymentStatus,
} from '$admin-club/lib/demo-members';

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  household: string;
  segment: MemberSegment;
  currentSeasonPaymentStatus: PaymentStatus | null;
  directoryVisibility: DirectoryVisibility;
  joined: string;
}

export const load: PageServerLoad = (event) => {
  requireSession(event);
  const rows: MemberRow[] = members
    .map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      household: getHousehold(member.householdId)?.name ?? 'No household on file',
      segment: segmentForMember(member.id),
      currentSeasonPaymentStatus: currentSeasonPaymentStatus(member.id),
      directoryVisibility: member.directoryVisibility,
      joined: member.joined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { members: rows };
};
