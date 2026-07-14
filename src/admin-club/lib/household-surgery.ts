// Household surgery: move-member and merge-households (Task 5, docs/plans/2026-07-14-
// membership-admin.md, the design doc's own "Household surgery" section). Both are pure plan
// builders on the `households-store.ts` pattern (this module's own header on why a merge conflict
// check needs `db` reads before it can decide): a caller runs the returned statements in one
// `db.batch()` alongside its own `clubAdminAction` audit, never executing anything here itself.
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

/** A move or merge plan's own success shape: unrun statements for the caller's `db.batch()`. */
export interface SurgeryPlan {
  ok: true;
  statements: D1PreparedStatement[];
}

/** A merge refused because both households hold a `memberships` row for the same season (the
 *  `UNIQUE(household_id, season)` constraint the design doc names): the seasons in conflict, so
 *  the caller can show them and let the admin resolve the duplicate first. */
export interface MergeConflict {
  ok: false;
  conflictSeasons: number[];
}

export interface MoveRefusal {
  ok: false;
  error: string;
}

/** The message a merge's own pre-check (`buildMergePlan`'s `MergeConflict` branch) already builds
 *  from the specific overlapping seasons it found; also what a caller shows when the identical
 *  `UNIQUE(household_id, season)` constraint fires DURING the batch instead, a race the pre-check
 *  cannot close on its own (a season row inserted concurrently, after the check ran clean but
 *  before the batch committed) -- {@link isUniqueConstraintError}'s own header. Generic on
 *  purpose: the race path never learns which season collided, only that one did. */
export const SEASON_CONFLICT_RACE_MESSAGE = 'Both households hold a membership for the same season. Resolve the duplicate season first.';

/**
 * Whether `err` is a raw D1 UNIQUE-constraint failure, `enrollments.ts`'s own `isUniqueViolation`
 * substring convention (matched loosely here, with no table name, since the caller already knows
 * from context which constraint its own batch could plausibly trip). The desk's merge and move
 * actions both wrap their own `db.batch()` call with this so a race that slips past
 * `buildMergePlan`'s pre-check surfaces the design's own {@link SEASON_CONFLICT_RACE_MESSAGE}
 * instead of a raw database error reaching the admin.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('UNIQUE');
}

interface HouseholdMembershipSeasonRow {
  household_id: string;
  season: number;
}

/**
 * Merge `mergedId` into `survivorId`: re-parents members, memberships, and ledger transactions
 * (asset assignments follow automatically, since they reference a membership id, never a
 * household id directly), then marks `mergedId` with `left_at` and clears its own dangling
 * `primary_member_id`. Refused with the overlapping seasons when both households hold a
 * membership row for the same season; the caller resolves the duplicate first, per the design
 * doc's own ruling.
 */
export async function buildMergePlan(db: D1Database, survivorId: string, mergedId: string): Promise<SurgeryPlan | MergeConflict> {
  const { results } = await db
    .prepare('SELECT household_id, season FROM memberships WHERE household_id IN (?1, ?2)')
    .bind(survivorId, mergedId)
    .all<HouseholdMembershipSeasonRow>();

  const survivorSeasons = new Set(results.filter((row) => row.household_id === survivorId).map((row) => row.season));
  const mergedSeasons = results.filter((row) => row.household_id === mergedId).map((row) => row.season);
  const conflictSeasons = mergedSeasons.filter((season) => survivorSeasons.has(season)).sort((a, b) => a - b);
  if (conflictSeasons.length > 0) {
    return { ok: false, conflictSeasons };
  }

  return {
    ok: true,
    statements: [
      db.prepare('UPDATE members SET household_id = ?1 WHERE household_id = ?2').bind(survivorId, mergedId),
      db.prepare('UPDATE memberships SET household_id = ?1 WHERE household_id = ?2').bind(survivorId, mergedId),
      db.prepare('UPDATE transactions SET household_id = ?1 WHERE household_id = ?2').bind(survivorId, mergedId),
      db.prepare("UPDATE households SET primary_member_id = NULL, left_at = datetime('now') WHERE id = ?1").bind(mergedId),
    ],
  };
}

interface MemberHouseholdRow {
  household_id: string;
}

interface HouseholdPrimaryRow {
  primary_member_id: string | null;
}

async function memberHouseholdId(db: D1Database, memberId: string): Promise<string | null> {
  const row = await db.prepare('SELECT household_id FROM members WHERE id = ?1').bind(memberId).first<MemberHouseholdRow>();
  return row?.household_id ?? null;
}

/**
 * Re-parent one member to `targetHouseholdId`. Moving a household's own primary member requires
 * `newPrimaryId` (another current member of the SAME source household) so the source household
 * is never left with a dangling `primary_member_id`, per the design doc's own rule; moving the
 * last member out of a household is allowed and leaves it empty (a visible "No membership" row,
 * not an error state, per that same section). When the target household has no primary yet (the
 * empty-household state this same surgery can produce), the moved member becomes its primary.
 */
export async function buildMovePlan(
  db: D1Database,
  memberId: string,
  targetHouseholdId: string,
  newPrimaryId?: string,
): Promise<SurgeryPlan | MoveRefusal> {
  const sourceHouseholdId = await memberHouseholdId(db, memberId);
  if (!sourceHouseholdId) return { ok: false, error: 'No such member.' };
  if (sourceHouseholdId === targetHouseholdId) return { ok: false, error: 'That member is already in this household.' };

  const source = await db
    .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
    .bind(sourceHouseholdId)
    .first<HouseholdPrimaryRow>();

  const statements: D1PreparedStatement[] = [];

  if (source?.primary_member_id === memberId) {
    if (!newPrimaryId || newPrimaryId === memberId) {
      return { ok: false, error: 'Moving the primary requires naming a new primary first.' };
    }
    const candidateHouseholdId = await memberHouseholdId(db, newPrimaryId);
    if (candidateHouseholdId !== sourceHouseholdId) {
      return { ok: false, error: 'The new primary must be another member of the same household.' };
    }
    statements.push(db.prepare('UPDATE households SET primary_member_id = ?1 WHERE id = ?2').bind(newPrimaryId, sourceHouseholdId));
  }

  statements.push(db.prepare("UPDATE members SET household_id = ?1, updated_at = datetime('now') WHERE id = ?2").bind(targetHouseholdId, memberId));

  const target = await db
    .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
    .bind(targetHouseholdId)
    .first<HouseholdPrimaryRow>();
  if (target && target.primary_member_id === null) {
    statements.push(db.prepare('UPDATE households SET primary_member_id = ?1 WHERE id = ?2').bind(memberId, targetHouseholdId));
  }

  return { ok: true, statements };
}
