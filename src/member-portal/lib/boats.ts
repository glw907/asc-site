// The portal's own boat reads/writes (design doc's T5: "boat add/edit/remove on the member's
// PROFILE screen"): `boats.member_id` is the boat's OWNER (migration 0027_directory_domain's own
// supersession of the directory spec's original household-owned shape), so every write here is
// scoped to the signed-in member's own rows, never a household-wide reach. The household screen
// only ever READS boats, grouped by owner (`listHouseholdBoatsGroupedByOwner`), to answer "who has
// what" without granting anyone edit rights over a boat they do not own.
import type { D1Database } from '@cloudflare/workers-types';

/** `boats.kept_on`'s own `CHECK` values (migration 0028_boats_model). */
export type BoatKeptOn = 'trailer' | 'mooring';
const KEPT_ON_VALUES: BoatKeptOn[] = ['trailer', 'mooring'];

/** The fixed capture-time picker (migration 0028's own header comment): picking `'Buccaneer 18'`
 *  or `'Laser'` stores that string verbatim in `boats.model`; picking `'Other'` requires
 *  `otherModel`, and that typed string is what stores instead. The column always holds the
 *  resolved string, never the picker choice itself. */
export type BoatModelPicker = 'Buccaneer 18' | 'Laser' | 'Other';
const MODEL_PICKER_VALUES: BoatModelPicker[] = ['Buccaneer 18', 'Laser', 'Other'];

/** A user-facing refusal, matching every other portal module's `{ error }` shape
 *  (`profile.ts`'s own `ProfileActionError`). */
export interface BoatActionError {
  error: string;
}

/** One boat, as the profile screen's own list reads it. */
export interface BoatRow {
  id: string;
  memberId: string;
  name: string | null;
  model: string;
  sailNumber: string | null;
  keptOn: BoatKeptOn;
}

interface BoatRawRow {
  id: string;
  member_id: string;
  name: string | null;
  model: string;
  sail_number: string | null;
  kept_on: BoatKeptOn;
}

function toBoatRow(row: BoatRawRow): BoatRow {
  return { id: row.id, memberId: row.member_id, name: row.name, model: row.model, sailNumber: row.sail_number, keptOn: row.kept_on };
}

/** The raw capture form's own fields, before {@link resolveBoatWrite} validates and resolves
 *  them; `modelPicker` and `keptOn` arrive as plain strings from a `FormData` read, not yet
 *  narrowed to their own union types. */
export interface BoatWriteInput {
  name: string;
  modelPicker: string;
  otherModel: string;
  sailNumber: string;
  keptOn: string;
}

interface ResolvedBoatWrite {
  name: string;
  model: string;
  sailNumber: string | null;
  keptOn: BoatKeptOn;
}

const MAX_NAME_LENGTH = 80;
const MAX_MODEL_LENGTH = 80;
const MAX_SAIL_NUMBER_LENGTH = 20;

/**
 * Validate and resolve a boat capture (add or edit) before any write: a name is always required
 * (`boats.name` is nullable in the schema only to admit legacy seed rows; every capture path going
 * forward requires it), the model picker resolves to the string that stores in `boats.model` (a
 * fixed choice, or the typed "Other" model, itself required and non-empty), and `keptOn` must be
 * one of the schema's own `CHECK` values. Every refusal happens before touching the database,
 * matching `profile.ts`'s `updateProfile` -- a partial write on a bad field would leave the row
 * inconsistent with what the form showed.
 */
function resolveBoatWrite(input: BoatWriteInput): ResolvedBoatWrite | BoatActionError {
  const name = input.name.trim();
  if (!name) return { error: 'Please enter a boat name.' };
  if (name.length > MAX_NAME_LENGTH) return { error: `Boat name must be ${MAX_NAME_LENGTH} characters or fewer.` };

  if (!MODEL_PICKER_VALUES.includes(input.modelPicker as BoatModelPicker)) {
    return { error: 'Please choose a model.' };
  }
  const model = input.modelPicker === 'Other' ? input.otherModel.trim() : input.modelPicker;
  if (!model) return { error: 'Please enter the model.' };
  if (model.length > MAX_MODEL_LENGTH) return { error: `Model must be ${MAX_MODEL_LENGTH} characters or fewer.` };

  const sailNumber = input.sailNumber.trim();
  if (sailNumber.length > MAX_SAIL_NUMBER_LENGTH) return { error: `Sail number must be ${MAX_SAIL_NUMBER_LENGTH} characters or fewer.` };

  if (!KEPT_ON_VALUES.includes(input.keptOn as BoatKeptOn)) return { error: 'Please choose where the boat is kept.' };

  return { name, model, sailNumber: sailNumber || null, keptOn: input.keptOn as BoatKeptOn };
}

/** A member's own boats, name-ordered (their own profile screen's list). */
export async function listMemberBoats(db: D1Database, memberId: string): Promise<BoatRow[]> {
  const { results } = await db
    .prepare('SELECT id, member_id, name, model, sail_number, kept_on FROM boats WHERE member_id = ?1 ORDER BY name')
    .bind(memberId)
    .all<BoatRawRow>();
  return results.map(toBoatRow);
}

/** One owner's own boats, for the household screen's read-only grouping. */
export interface HouseholdBoatGroup {
  ownerId: string;
  ownerName: string;
  boats: BoatRow[];
}

/** The household's boats, grouped by owning member, for the household screen's read-only listing
 *  (item 2 of T5's own outcome). A member with no boats is simply absent from the result; a
 *  household with no boats at all answers an empty array. Editing always happens on the owning
 *  member's own profile, never here. */
export async function listHouseholdBoatsGroupedByOwner(db: D1Database, householdId: string): Promise<HouseholdBoatGroup[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.member_id, b.name, b.model, b.sail_number, b.kept_on, m.name AS owner_name
       FROM boats b JOIN members m ON m.id = b.member_id
       WHERE m.household_id = ?1
       ORDER BY m.name, b.name`,
    )
    .bind(householdId)
    .all<BoatRawRow & { owner_name: string }>();

  const groups: HouseholdBoatGroup[] = [];
  const byOwner = new Map<string, HouseholdBoatGroup>();
  for (const row of results) {
    let group = byOwner.get(row.member_id);
    if (!group) {
      group = { ownerId: row.member_id, ownerName: row.owner_name, boats: [] };
      byOwner.set(row.member_id, group);
      groups.push(group);
    }
    group.boats.push(toBoatRow(row));
  }
  return groups;
}

/** Add a boat to the signed-in member's own profile. */
export async function addBoat(db: D1Database, memberId: string, input: BoatWriteInput): Promise<{ id: string } | BoatActionError> {
  const resolved = resolveBoatWrite(input);
  if ('error' in resolved) return resolved;
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO boats (id, member_id, name, model, sail_number, kept_on) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, memberId, resolved.name, resolved.model, resolved.sailNumber, resolved.keptOn)
    .run();
  return { id };
}

/** Edit a boat, refusing one that is not the signed-in member's own (ownership is a `WHERE`
 *  clause, not a separate read-then-check, mirroring `assets.ts`'s own `releaseHouseholdAssignment`
 *  ownership pattern). */
export async function updateBoat(db: D1Database, memberId: string, boatId: string, input: BoatWriteInput): Promise<{ ok: true } | BoatActionError> {
  const resolved = resolveBoatWrite(input);
  if ('error' in resolved) return resolved;
  const result = await db
    .prepare("UPDATE boats SET name = ?1, model = ?2, sail_number = ?3, kept_on = ?4, updated_at = datetime('now') WHERE id = ?5 AND member_id = ?6")
    .bind(resolved.name, resolved.model, resolved.sailNumber, resolved.keptOn, boatId, memberId)
    .run();
  if ((result.meta.changes ?? 0) !== 1) return { error: 'No such boat.' };
  return { ok: true };
}

/** Remove a boat, refusing one that is not the signed-in member's own. */
export async function removeBoat(db: D1Database, memberId: string, boatId: string): Promise<{ ok: true } | BoatActionError> {
  const result = await db.prepare('DELETE FROM boats WHERE id = ?1 AND member_id = ?2').bind(boatId, memberId).run();
  if ((result.meta.changes ?? 0) !== 1) return { error: 'No such boat.' };
  return { ok: true };
}
