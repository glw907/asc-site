// The Club section's Members screen (household-grouped list; Task 4, docs/plans/2026-07-14-
// membership-admin.md): reads `listHouseholds` off the live `asc-club` CLUB_DB, replacing the
// fixture-backed demo-members.ts read this route previously carried (see that module's own
// header, now superseded for this screen). Search, standing-segment, and archived filtering all
// happen server-side: `listHouseholds` computes a matched member's own email hit as part of its
// one query, and `HouseholdListRow`'s member chips deliberately never expose a raw email to the
// client, so a client-side re-filter could never reproduce an email match. The `q`/`segment`/
// `archived` URL params are that query's own inputs; `+page.svelte` pushes a new URL on every
// control change (`goto`, no full page reload) rather than filtering an already-loaded array.
// Pagination stays client-side over whatever `listHouseholds` already returned, since it needs no
// further server knowledge once the filtered set is in hand.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { listHouseholds, type HouseholdListRow } from '$admin-club/lib/households-store';

type SegmentFilter = 'all' | 'current' | 'lapsed';

function parseSegment(value: string | null): SegmentFilter {
  return value === 'current' || value === 'lapsed' ? value : 'all';
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  const search = event.url.searchParams.get('q') ?? '';
  const segment = parseSegment(event.url.searchParams.get('segment'));
  const includeArchived = event.url.searchParams.get('archived') === '1';

  if (!db) {
    return {
      households: [] as HouseholdListRow[],
      search,
      segment,
      includeArchived,
      error: 'CLUB_DB is not bound.',
    };
  }

  try {
    const households = await listHouseholds(db, { search: search || undefined, segment, includeArchived });
    return { households, search, segment, includeArchived, error: null as string | null };
  } catch (err) {
    console.error('admin/club/members: CLUB_DB read failed', err);
    return {
      households: [] as HouseholdListRow[],
      search,
      segment,
      includeArchived,
      error: 'Could not read the households table.',
    };
  }
};
