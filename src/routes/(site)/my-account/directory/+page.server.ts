// /my-account/directory: the members-only directory (the membership pitch's own "Member
// directory and Discord community" line). Read-only: every write this page depends on (a
// member's own listing, or the household primary's listing for anyone in their household) is
// `$member-portal/lib/household.ts`'s existing `setDirectoryVisibility`, reached from
// /my-account/profile and /my-account/household. `households` is `null` only when `CLUB_DB`
// itself is unavailable (a degraded state, distinct from an empty directory).
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listDirectory, type DirectoryHousehold } from '$member-portal/lib/directory';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

export const load: PageServerLoad = async (event) => {
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  const households: DirectoryHousehold[] | null = db ? await listDirectory(db) : null;

  return { households };
};
