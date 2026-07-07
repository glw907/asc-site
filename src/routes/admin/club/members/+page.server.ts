// The Club section's Members screen (docs/superpowers/specs/2026-07-06-asc-phase-2-design-
// suite.md, Part B): the list reads the pass-2.2 schema preview (src/admin-club/lib/demo-
// members.ts) rather than a live store, since the real member model doesn't exist yet (see that
// file's header comment). MemberRow is deliberately the row shape a real D1 query would project
// (member id, name, household name, standing, visibility, joined date), so swapping this load's
// import for a real query is a one-file change, not a reshape of the screen.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { getHousehold, members, standingForMember, type SeasonStanding, type DirectoryVisibility } from '$admin-club/lib/demo-members';

export interface MemberRow {
  id: string;
  name: string;
  household: string;
  standing: SeasonStanding;
  directoryVisibility: DirectoryVisibility;
  joined: string;
}

export const load: PageServerLoad = (event) => {
  requireSession(event);
  const rows: MemberRow[] = members
    .map((member) => ({
      id: member.id,
      name: member.name,
      household: getHousehold(member.householdId)?.name ?? 'No household on file',
      standing: standingForMember(member.id),
      directoryVisibility: member.directoryVisibility,
      joined: member.joined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { members: rows };
};
