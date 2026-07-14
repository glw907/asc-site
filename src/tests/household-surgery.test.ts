import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { buildMergePlan, buildMovePlan, isUniqueConstraintError } from '$admin-club/lib/household-surgery';

describe('buildMergePlan', () => {
  it('refuses a merge when both households hold a membership for the same season', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM memberships WHERE household_id IN': [
          { household_id: 'hh-wright-a', season: 2025 },
          { household_id: 'hh-wright-b', season: 2025 },
          { household_id: 'hh-wright-a', season: 2024 },
        ],
      },
    });

    const plan = await buildMergePlan(db, 'hh-wright-a', 'hh-wright-b');
    expect(plan).toEqual({ ok: false, conflictSeasons: [2025] });
  });

  it('builds a clean merge: members, memberships, transactions re-parented and left_at stamped', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM memberships WHERE household_id IN': [
          { household_id: 'hh-a', season: 2025 },
          { household_id: 'hh-b', season: 2024 },
        ],
      },
    });

    const plan = await buildMergePlan(db, 'hh-a', 'hh-b');
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.statements).toHaveLength(4);

    await db.batch(plan.statements);
    expect(calls.some((c) => c.sql.startsWith('UPDATE members SET household_id') && c.args[0] === 'hh-a' && c.args[1] === 'hh-b')).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE memberships SET household_id') && c.args[0] === 'hh-a' && c.args[1] === 'hh-b')).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE transactions SET household_id') && c.args[0] === 'hh-a' && c.args[1] === 'hh-b')).toBe(true);
    expect(calls.some((c) => c.sql.includes('left_at') && c.args[0] === 'hh-b')).toBe(true);
  });
});

/** Two households, each with a primary and a spare member, wired for `buildMovePlan`'s own
 *  member and household lookups (both queries share their SQL text with a different id, so the
 *  fixture answers by the bound id rather than by a second substring key). */
function surgeryFixture() {
  const memberHouseholds: Record<string, string> = {
    'mem-1': 'hh-a', // primary of hh-a
    'mem-2': 'hh-a', // spare of hh-a
    'mem-9': 'hh-b', // primary of hh-b
  };
  const householdPrimaries: Record<string, string | null> = { 'hh-a': 'mem-1', 'hh-b': 'mem-9', 'hh-empty': null };
  return fakeD1({
    firstResults: {
      'FROM members WHERE id': (args: unknown[]) => {
        const id = memberHouseholds[args[0] as string];
        return id ? { household_id: id } : null;
      },
      'FROM households WHERE id': (args: unknown[]) => {
        const id = args[0] as string;
        return id in householdPrimaries ? { primary_member_id: householdPrimaries[id] } : null;
      },
    },
  });
}

describe('buildMovePlan', () => {
  it('refuses a missing member', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-ghost', 'hh-b');
    expect(result).toEqual({ ok: false, error: 'No such member.' });
  });

  it('refuses moving into the household the member already belongs to', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-2', 'hh-a');
    expect(result).toEqual({ ok: false, error: 'That member is already in this household.' });
  });

  it('moves a non-primary member with a single statement, no primary reassignment', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-2', 'hh-b');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.statements).toHaveLength(1);
  });

  it('refuses moving the primary without naming a new one', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-1', 'hh-b');
    expect(result).toEqual({ ok: false, error: 'Moving the primary requires naming a new primary first.' });
  });

  it('refuses a proposed new primary from a different household', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-1', 'hh-b', 'mem-9');
    expect(result).toEqual({ ok: false, error: 'The new primary must be another member of the same household.' });
  });

  it('reassigns the primary before moving, when a valid new primary is named', async () => {
    const { db, calls } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-1', 'hh-b', 'mem-2');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.statements).toHaveLength(2);
    await db.batch(result.statements);
    const reassign = calls.find((c) => c.sql.startsWith('UPDATE households SET primary_member_id'));
    expect(reassign?.args).toEqual(['mem-2', 'hh-a']);
    const move = calls.find((c) => c.sql.startsWith('UPDATE members SET household_id'));
    expect(move?.args).toEqual(['hh-b', 'mem-1']);
  });

  it('makes the moved member primary when the target household has none', async () => {
    const { db } = surgeryFixture();
    const result = await buildMovePlan(db, 'mem-2', 'hh-empty');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.statements).toHaveLength(2);
  });
});

describe('isUniqueConstraintError', () => {
  it('recognizes a raw D1 UNIQUE-constraint failure, the season-conflict race a batch can still hit', () => {
    expect(isUniqueConstraintError(new Error('UNIQUE constraint failed: memberships.household_id, memberships.season'))).toBe(true);
  });

  it('answers false for an unrelated error', () => {
    expect(isUniqueConstraintError(new Error('network timeout'))).toBe(false);
  });

  it('answers false for a non-Error thrown value', () => {
    expect(isUniqueConstraintError('some string')).toBe(false);
  });
});
