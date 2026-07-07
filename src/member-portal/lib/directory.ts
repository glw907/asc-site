// The member directory (design doc's own "member directory" benefit, MembershipWorks absorption
// item 4): reads `members.directory_visibility` directly off 0005_member_domain's own schema, the
// same three-state column `household.ts`'s `setDirectoryVisibility` writes. `hidden` and archived
// members never leave this module (design choice 6 in `demo-members.ts`'s header: an archived
// member is excluded from the directory by default, the same as every other list). `partial`
// members appear by name only; `visible` members carry their one email and one phone too. There
// is no per-field suppression column, so a `partial` row's contact fields are simply `null` here
// rather than the caller having to know which state means what.
import type { D1Database } from '@cloudflare/workers-types';

/** One listed member, as the directory renders it. `email`/`phone` are `null` for a `partial`
 *  listing (name only) as well as for a member who genuinely has neither on file; the caller does
 *  not need to distinguish the two, since both render the same way (no contact line). */
export interface DirectoryMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** One household's listed members, grouped for the directory's card-per-household layout. A
 *  household with zero listed members (everyone hidden or archived) never appears at all. */
export interface DirectoryHousehold {
  id: string;
  name: string;
  city: string | null;
  members: DirectoryMember[];
}

interface DirectoryRow {
  household_id: string;
  household_name: string;
  household_city: string | null;
  member_id: string;
  member_name: string;
  email: string | null;
  phone: string | null;
  directory_visibility: string;
}

/**
 * Every listed member, grouped by household, households and members both in the query's own
 * name order (no client-side re-sort needed). Excludes `hidden` and archived members at the SQL
 * level, so a caller can render the result directly with no further filtering for visibility.
 */
export async function listDirectory(db: D1Database): Promise<DirectoryHousehold[]> {
  const { results } = await db
    .prepare(
      `SELECT h.id AS household_id, h.name AS household_name, h.city AS household_city,
              m.id AS member_id, m.name AS member_name, m.email, m.phone, m.directory_visibility
       FROM members m
       JOIN households h ON h.id = m.household_id
       WHERE m.archived_at IS NULL AND m.directory_visibility != 'hidden'
       ORDER BY h.name, m.name`,
    )
    .all<DirectoryRow>();

  const households: DirectoryHousehold[] = [];
  const byId = new Map<string, DirectoryHousehold>();
  for (const row of results) {
    let household = byId.get(row.household_id);
    if (!household) {
      household = { id: row.household_id, name: row.household_name, city: row.household_city, members: [] };
      byId.set(row.household_id, household);
      households.push(household);
    }
    const exposesContact = row.directory_visibility === 'visible';
    household.members.push({
      id: row.member_id,
      name: row.member_name,
      email: exposesContact ? row.email : null,
      phone: exposesContact ? row.phone : null,
    });
  }
  return households;
}
