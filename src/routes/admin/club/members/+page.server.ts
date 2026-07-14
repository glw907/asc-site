// The Club section's Members screen (household-grouped list; Task 4, docs/plans/2026-07-14-
// membership-admin.md): reads `listHouseholds` off the live `asc-club` CLUB_DB, replacing the
// fixture-backed read this route previously carried. Search, standing-segment, and archived filtering all
// happen server-side: `listHouseholds` computes a matched member's own email hit as part of its
// one query, and `HouseholdListRow`'s member chips deliberately never expose a raw email to the
// client, so a client-side re-filter could never reproduce an email match. The `q`/`segment`/
// `archived` URL params are that query's own inputs; `+page.svelte` pushes a new URL on every
// control change (`goto`, no full page reload) rather than filtering an already-loaded array.
// Pagination stays client-side over whatever `listHouseholds` already returned, since it needs no
// further server knowledge once the filtered set is in hand.
//
// Task 5 adds the `addHousehold` action: the walk-up-join entry point (a household plus its
// first, primary member), landing on the new desk so a manual payment can follow immediately.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { createHousehold, listHouseholds, type HouseholdListRow } from '$admin-club/lib/households-store';

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

export const actions: Actions = {
  addHousehold: clubAdminAction(
    async ({ form, ctx }) => {
      const name = form.get('name');
      const memberName = form.get('memberName');
      if (typeof name !== 'string' || !name.trim() || typeof memberName !== 'string' || !memberName.trim()) {
        ctx.audit({ action: 'add', entity: 'household', detail: 'rejected: missing household or member name' });
        return fail(400, { error: "A household name and its first member's name are both required." });
      }
      const city = form.get('city');
      const email = form.get('memberEmail');
      const phone = form.get('memberPhone');
      const birthdate = form.get('memberBirthdate');
      const { householdId } = await createHousehold(ctx.db, {
        name: name.trim(),
        city: typeof city === 'string' && city.trim() ? city.trim() : null,
        member: {
          name: memberName.trim(),
          email: typeof email === 'string' && email.trim() ? email.trim() : null,
          phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
          birthdate: typeof birthdate === 'string' && birthdate.trim() ? birthdate.trim() : null,
        },
      });
      ctx.audit({ action: 'add', entity: 'household', entityId: householdId });
      redirect(303, `/admin/club/members/${householdId}`);
    },
    { action: 'add', entity: 'household', deniedMessage: 'A club role is required to add a household.' },
  ),
};
