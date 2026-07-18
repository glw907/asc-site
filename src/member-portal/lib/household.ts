// The portal's own household reads/writes (design doc's "4. Household" and the landing's
// household card): households/members are 0005_member_domain's own tables, read directly here
// the same way `standing.ts` already reads them for real. `directory_visibility` lives on
// `members` (0005's own schema); this module is the one place that reads and writes it from the
// member-facing side.
import type { D1Database } from '@cloudflare/workers-types';
import { normalizeEmail, normalizeNameCaps, normalizePhoneE164 } from '$admin-club/lib/member-normalize.js';

/** The schema's own three-state directory visibility (0005_member_domain's `CHECK`). */
export type DirectoryVisibility = 'visible' | 'partial' | 'hidden';

/** One household member, as the household card and the household-management screen both read
 *  it. `isPrimary` is derived against the household's own `primary_member_id`, never stored on
 *  the member row itself: a household designates exactly one primary member, the household's
 *  own billing and renewal contact, a foreign key on the household rather than a boolean
 *  scattered across members. */
export interface HouseholdMemberRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  directoryVisibility: DirectoryVisibility;
  isPrimary: boolean;
  archivedAt: string | null;
}

interface MemberRawRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  directory_visibility: string;
  archived_at: string | null;
}

/** One household's own facts the landing/household screens need alongside its members. */
export interface HouseholdInfo {
  id: string;
  name: string;
  primaryMemberId: string | null;
  leftAt: string | null;
}

export async function getHouseholdInfo(db: D1Database, householdId: string): Promise<HouseholdInfo | null> {
  const row = await db
    .prepare('SELECT id, name, primary_member_id, left_at FROM households WHERE id = ?1 LIMIT 1')
    .bind(householdId)
    .first<{ id: string; name: string; primary_member_id: string | null; left_at: string | null }>();
  return row ? { id: row.id, name: row.name, primaryMemberId: row.primary_member_id, leftAt: row.left_at } : null;
}

/** Every member of a household, not excluding an archived one (the household screen's own need to
 *  show full membership history plainly rather than silently dropping a row); the primary sorts
 *  first, then alphabetically, the household card's own reading order. */
export async function listHouseholdMembers(db: D1Database, householdId: string): Promise<HouseholdMemberRow[]> {
  const household = await getHouseholdInfo(db, householdId);
  const { results } = await db
    .prepare(
      `SELECT id, name, email, phone, birthdate, directory_visibility, archived_at
       FROM members WHERE household_id = ?1 ORDER BY name`,
    )
    .bind(householdId)
    .all<MemberRawRow>();
  const primaryId = household?.primaryMemberId ?? null;
  return results
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      birthdate: row.birthdate,
      directoryVisibility: row.directory_visibility as DirectoryVisibility,
      isPrimary: row.id === primaryId,
      archivedAt: row.archived_at,
    }))
    .sort((a, b) => (a.isPrimary === b.isPrimary ? a.name.localeCompare(b.name) : a.isPrimary ? -1 : 1));
}

/** Add a new household member (the welcome page's "add each household member" promise,
 *  fulfilled from the household screen: design doc's own "5. Household"). Email is optional
 *  (a covered child may have none, 0005's own schema comment); a household member added here has
 *  no `directory_visibility` opinion yet, so it defaults to the schema's own `'partial'`. Name,
 *  email, and phone are normalized the same way this codebase's other live write paths do
 *  (`member-normalize.js`); a phone that does not parse to E.164 is never a reason to refuse the
 *  add, so it stores trimmed as given rather than blocking the primary. */
export async function addHouseholdMember(
  db: D1Database,
  householdId: string,
  input: { name: string; email: string | null; phone: string | null; birthdate: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  const name = normalizeNameCaps(input.name);
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? (normalizePhoneE164(input.phone) ?? input.phone.trim()) : null;
  await db
    .prepare('INSERT INTO members (id, household_id, name, email, phone, birthdate) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, householdId, name, email, phone, input.birthdate)
    .run();
  return id;
}

/** Remove a household member: refuses to remove the household's own primary (the household
 *  screen's own "reassignment is an admin action, not self-serve" note — removing the primary
 *  outright would leave the household with a dangling `primary_member_id`, exactly the state
 *  0005's own deferred-primary dance exists to prevent), never removes a household's LAST member
 *  either (a household with zero members is not a state this schema supports rendering: the
 *  landing has nothing left to show). Deletes outright rather than archiving: this is the portal's
 *  own "I added this by mistake" corrective, distinct from an admin's `archived_at` ("not coming
 *  back"), which the portal never sets. */
export async function removeHouseholdMember(db: D1Database, householdId: string, memberId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const household = await getHouseholdInfo(db, householdId);
  if (household?.primaryMemberId === memberId) {
    return { ok: false, error: 'The primary member cannot be removed; contact the club to change the primary.' };
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE household_id = ?1').bind(householdId).first<{ n: number }>();
  if ((count?.n ?? 0) <= 1) {
    return { ok: false, error: 'A household must keep at least one member.' };
  }
  await db.prepare('DELETE FROM members WHERE id = ?1 AND household_id = ?2').bind(memberId, householdId).run();
  return { ok: true };
}

/** Set one member's directory visibility. Both the member themself and their household's primary
 *  may call this (the design doc's own "override precedence, disclosed both ways": the primary
 *  can set any household member's listing, a member can set their own, latest write wins — no
 *  extra conflict machinery needed beyond a plain `UPDATE`, since there is nothing to reconcile
 *  beyond "whoever wrote last"). The route layer is responsible for the ownership check (self, or
 *  primary-over-household); this module trusts its caller, the same boundary
 *  `assets-store.ts`'s writers already draw. */
export async function setDirectoryVisibility(db: D1Database, memberId: string, visibility: DirectoryVisibility): Promise<void> {
  await db.prepare("UPDATE members SET directory_visibility = ?1, updated_at = datetime('now') WHERE id = ?2").bind(visibility, memberId).run();
}

/**
 * The lean leave-the-club action (design doc's own "the lean LEAVE-THE-CLUB action" and the
 * symmetry rule's "join implies leave"): stamps `households.left_at`, which stops the (future)
 * renewal-reminder cadence for the household and surfaces on the admin's needs-attention strip.
 * Deliberately does not touch `members.archived_at`: archival stays the admin's own deliberate,
 * reversible act. Idempotent: leaving twice is a silent no-op, not an error, matching this
 * codebase's own idempotent-write convention (`assets-store.ts`'s `releaseAssignment`).
 */
export async function leaveClub(db: D1Database, householdId: string): Promise<void> {
  await db.prepare("UPDATE households SET left_at = datetime('now') WHERE id = ?1 AND left_at IS NULL").bind(householdId).run();
}

/** A household's own street address (migration 0027_directory_domain's four new columns, plus
 *  the pre-existing `city`), as the household screen's edit form and the profile preview's
 *  "does an address exist yet" check both need it. Gated at render by the existing
 *  `directory_visibility` dial (T3's own visible-tier rule), never a new switch. */
export interface HouseholdAddress {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export async function getHouseholdAddress(db: D1Database, householdId: string): Promise<HouseholdAddress | null> {
  const row = await db
    .prepare('SELECT city, address_line1, address_line2, state, postal_code FROM households WHERE id = ?1 LIMIT 1')
    .bind(householdId)
    .first<{ city: string | null; address_line1: string | null; address_line2: string | null; state: string | null; postal_code: string | null }>();
  return row
    ? { addressLine1: row.address_line1, addressLine2: row.address_line2, city: row.city, state: row.state, postalCode: row.postal_code }
    : null;
}

/** The address edit form's own raw fields, before {@link updateHouseholdAddress} validates and
 *  trims them. */
export interface HouseholdAddressInput {
  addressLine1: string;
  addressLine2: string;
  state: string;
  postalCode: string;
}

const MAX_ADDRESS_LINE_LENGTH = 120;
const MAX_STATE_LENGTH = 40;
const MAX_POSTAL_CODE_LENGTH = 12;

function validateAddressField(value: string, maxLength: number, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  return { ok: true, value: trimmed };
}

/**
 * Update the household's own street address: every field is optional (a household may choose not
 * to keep one on file, matching the address's own nullable schema), an empty field clears its
 * column, and each non-empty field is length-checked before any write (the same
 * validate-everything-first shape `profile.ts`'s `updateProfile` uses). `city` is untouched here
 * (the member-import's own domain; not part of this edit form). Only the household's primary may
 * call this; the route layer draws that line, the same boundary this module's other writers trust
 * their caller to have already checked.
 */
export async function updateHouseholdAddress(db: D1Database, householdId: string, input: HouseholdAddressInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const line1 = validateAddressField(input.addressLine1, MAX_ADDRESS_LINE_LENGTH, 'Address line 1');
  if (!line1.ok) return line1;
  const line2 = validateAddressField(input.addressLine2, MAX_ADDRESS_LINE_LENGTH, 'Address line 2');
  if (!line2.ok) return line2;
  const state = validateAddressField(input.state, MAX_STATE_LENGTH, 'State');
  if (!state.ok) return state;
  const postalCode = validateAddressField(input.postalCode, MAX_POSTAL_CODE_LENGTH, 'ZIP code');
  if (!postalCode.ok) return postalCode;

  await db
    .prepare("UPDATE households SET address_line1 = ?1, address_line2 = ?2, state = ?3, postal_code = ?4, updated_at = datetime('now') WHERE id = ?5")
    .bind(line1.value, line2.value, state.value, postalCode.value, householdId)
    .run();
  return { ok: true };
}
