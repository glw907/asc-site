// The join engine's write-batch builder (Task 1): turns a validated, priced join submission into
// the ordered statements one `db.batch()` runs (household, members, the unpaid membership row,
// each class pick's enrollment or waitlist row, the purchaser's waiver acceptance, audit rows).
// The caller (the `/join/apply` action, Task 3) owns running the batch and the Stripe redirect
// that follows; this module never calls `.batch()` itself, matching `people.ts`'s own
// batch-builder-vs-batch-runner split.
//
// Every id this module mints is a fresh `crypto.randomUUID()`, generated before any statement is
// built, so a household's `primary_member_id` and an enrollment's `member_id` can reference a
// member row created earlier in the SAME batch (D1 batches run sequentially inside one implicit
// transaction, the same deferred-primary dance `people.ts`'s `ensureMember` already documents).
//
// This is the one function in the engine's pure core that takes a `db`: a waitlist row's
// `position` needs the class's current queue length, a fact only D1 has, so `buildJoinStatements`
// reads that (never writes) before returning the statement list.
import type { D1Database } from '@cloudflare/workers-types';
import type { BuildJoinStatementsOptions, BuildJoinStatementsResult, JoinPricingResult, NormalizedJoinInput } from './types.js';

/**
 * The next free `class_waitlist.position` for `classId`, matching `enrollments.ts`'s own
 * `signUpForClass` query. Memoized per class within one call so multiple picks landing on the
 * same full class (two siblings both waitlisting the same class, say) get sequential positions
 * without a second read.
 */
function nextPositionReader(db: D1Database) {
  const seen = new Map<string, number>();
  return async (classId: string): Promise<number> => {
    if (!seen.has(classId)) {
      const row = await db
        .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM class_waitlist WHERE class_id = ?1')
        .bind(classId)
        .first<{ next_position: number }>();
      seen.set(classId, row?.next_position ?? 1);
    }
    const position = seen.get(classId) as number;
    seen.set(classId, position + 1);
    return position;
  };
}

/**
 * Builds the household, its members, the unpaid `memberships` row, and every class pick's
 * enrollment or waitlist row (per `opts.fullClassIds`), plus this write's `audit_log` rows, all as
 * unrun `D1PreparedStatement`s for the caller's own `db.batch()`. `pricing.duesCents` sizes
 * `memberships.price_paid` (converted back to whole dollars, matching that column's existing
 * unit); `pricing`'s covered-vs-paid split is NOT reflected in `class_enrollments.fee_paid` here,
 * since every enrollment (credit-covered or not) is written unpaid (`fee_paid = 0`) until the
 * checkout actually settles: `reconcileJoin` (Task 2) is the one place that flips it, for both
 * outcomes, once payment (or a covered redemption) is confirmed.
 *
 * The purchaser's own `waiver_acceptances` row retired with the pre-T2 waiver machinery
 * (member-waivers T5a): the per-document signature model (T2/T4) is the one place a real
 * signature lands now, and this pass does not yet wire that gate into the join flow (T5b/c's own
 * job), so a fresh join writes no waiver row of any shape.
 */
export async function buildJoinStatements(
  db: D1Database,
  validated: NormalizedJoinInput,
  pricing: JoinPricingResult,
  opts: BuildJoinStatementsOptions,
): Promise<BuildJoinStatementsResult> {
  const householdId = crypto.randomUUID();
  const purchaserId = crypto.randomUUID();
  const memberIds = validated.members.map(() => crypto.randomUUID());
  // Index 0 is the purchaser; index 1+ mirrors `validated.members`, matching
  // `JoinClassPick.memberIndex`'s own contract.
  const roster = [purchaserId, ...memberIds];

  const statements = [
    db.prepare('INSERT INTO households (id, name) VALUES (?1, ?2)').bind(householdId, validated.purchaser.name),
    db
      .prepare('INSERT INTO members (id, household_id, name, email, phone, birthdate) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(purchaserId, householdId, validated.purchaser.name, validated.purchaser.email, validated.purchaser.phone, validated.purchaser.birthdate),
    ...validated.members.map((member, index) =>
      db
        .prepare('INSERT INTO members (id, household_id, name, email, phone, birthdate) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(memberIds[index], householdId, member.name, member.email, null, member.birthdate),
    ),
    db.prepare('UPDATE households SET primary_member_id = ?1 WHERE id = ?2').bind(purchaserId, householdId),
  ];

  const membershipId = crypto.randomUUID();
  const priceDollars = Math.round(pricing.duesCents / 100);
  statements.push(
    db
      .prepare('INSERT INTO memberships (id, household_id, season, tier, price_paid) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(membershipId, householdId, opts.season, validated.tier, priceDollars),
  );

  const nextPosition = nextPositionReader(db);
  const enrollmentIds: string[] = [];
  const waitlistIds: string[] = [];

  for (const pick of validated.classPicks) {
    const memberId = roster[pick.memberIndex];
    if (opts.fullClassIds.has(pick.classId)) {
      const waitlistId = crypto.randomUUID();
      const position = await nextPosition(pick.classId);
      waitlistIds.push(waitlistId);
      statements.push(
        db
          .prepare('INSERT INTO class_waitlist (id, class_id, member_id, position) VALUES (?1, ?2, ?3, ?4)')
          .bind(waitlistId, pick.classId, memberId, position),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:join', 'waitlist', 'waitlist', waitlistId, `class=${pick.classId} position=${position}`),
      );
    } else {
      const enrollmentId = crypto.randomUUID();
      enrollmentIds.push(enrollmentId);
      statements.push(
        db
          .prepare('INSERT INTO class_enrollments (id, class_id, member_id, fee_paid) VALUES (?1, ?2, ?3, 0)')
          .bind(enrollmentId, pick.classId, memberId),
        db
          .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
          .bind('public:join', 'enroll', 'enrollment', enrollmentId, `class=${pick.classId}`),
      );
    }
  }

  statements.push(
    db
      .prepare('INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind('public:join', 'join', 'membership', membershipId, `tier=${validated.tier} season=${opts.season}`),
  );

  return { statements, membershipId, enrollmentIds, waitlistIds, purchaserMemberId: purchaserId };
}
