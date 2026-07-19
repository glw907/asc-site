import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { buildJoinStatements } from '../member-signup/lib/statements.js';
import { computeJoinPricing } from '../member-signup/lib/pricing.js';
import type { NormalizedJoinInput } from '../member-signup/lib/types.js';

const PRICES = { individual: 250, family: 500, 'young-adult': 100 };

function normalized(overrides: Partial<NormalizedJoinInput> = {}): NormalizedJoinInput {
  return {
    tier: 'individual',
    purchaser: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '+19075550142', birthdate: null },
    members: [],
    classPicks: [],
    ...overrides,
  };
}

describe('buildJoinStatements', () => {
  it('writes the household, its primary member, and an unpaid membership row, with no class or waitlist statements when there are no picks', async () => {
    const { db, calls } = fakeD1();
    const validated = normalized();
    const pricing = computeJoinPricing(validated, PRICES, new Map());
    const result = await buildJoinStatements(db, validated, pricing, { season: 2026, fullClassIds: new Set() });

    expect(result.enrollmentIds).toEqual([]);
    expect(result.waitlistIds).toEqual([]);
    await db.batch(result.statements);

    const householdInsert = calls.find((c) => c.sql.startsWith('INSERT INTO households'));
    expect(householdInsert?.args).toEqual([expect.any(String), 'Ada Lovelace']);

    const memberInsert = calls.find((c) => c.sql.startsWith('INSERT INTO members ('));
    expect(memberInsert?.args).toEqual([expect.any(String), householdInsert?.args[0], 'Ada Lovelace', 'ada@example.com', '+19075550142', null]);

    const householdUpdate = calls.find((c) => c.sql.startsWith('UPDATE households'));
    expect(householdUpdate?.args).toEqual([memberInsert?.args[0], householdInsert?.args[0]]);

    const membershipInsert = calls.find((c) => c.sql.startsWith('INSERT INTO memberships'));
    expect(membershipInsert?.args).toEqual([result.membershipId, householdInsert?.args[0], 2026, 'individual', 250]);
    // price_paid is a whole-dollar snapshot (250), never the cents figure (25000).
    expect(membershipInsert?.sql).not.toMatch(/paid_at/);

    // No waiver_acceptances write: the pre-T2 waiver machinery retired (member-waivers T5a), and
    // this pass does not yet wire the new per-document signature model into the join flow.
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO waiver_acceptances'))).toBe(false);

    const joinAudit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log') && (c.args as unknown[])[2] === 'membership');
    expect(joinAudit?.args).toEqual(['public:join', 'join', 'membership', result.membershipId, 'tier=individual season=2026']);

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_waitlist'))).toBe(false);
  });

  it('writes a member row for each additional family member and lets class picks reference the purchaser or a member by roster index', async () => {
    const { db, calls } = fakeD1();
    const validated = normalized({
      tier: 'family',
      members: [{ name: 'Bob Lovelace', birthdate: '2012-01-01', email: null }],
      classPicks: [
        { memberIndex: 0, classId: 'intro-sailing' },
        { memberIndex: 1, classId: 'youth-sailing' },
      ],
    });
    const pricing = computeJoinPricing(validated, PRICES, new Map([['intro-sailing', 100], ['youth-sailing', 75]]));
    const result = await buildJoinStatements(db, validated, pricing, { season: 2026, fullClassIds: new Set() });
    await db.batch(result.statements);

    const memberInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO members ('));
    expect(memberInserts).toHaveLength(2);
    const purchaserId = memberInserts[0].args[0];
    const bobId = memberInserts[1].args[0];
    expect(memberInserts[1].args).toEqual([bobId, memberInserts[0].args[1], 'Bob Lovelace', null, null, '2012-01-01']);

    const enrollInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
    expect(enrollInserts).toHaveLength(2);
    expect(enrollInserts[0].args).toEqual([expect.any(String), 'intro-sailing', purchaserId]);
    expect(enrollInserts[1].args).toEqual([expect.any(String), 'youth-sailing', bobId]);
    expect(result.enrollmentIds).toEqual([enrollInserts[0].args[0], enrollInserts[1].args[0]]);

    // fee_paid = 0 at write time for every pick, covered or not: reconcileJoin flips it later.
    for (const insert of enrollInserts) {
      expect(insert.sql).toContain('fee_paid');
      expect(insert.sql).toContain('0)');
    }
  });

  it('lands a full class pick in class_waitlist instead of class_enrollments, with a position read off D1', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'COALESCE(MAX(position)': { next_position: 5 } } });
    const validated = normalized({ classPicks: [{ memberIndex: 0, classId: 'full-class' }] });
    const pricing = computeJoinPricing(validated, PRICES, new Map([['full-class', 100]]));
    const result = await buildJoinStatements(db, validated, pricing, {
      season: 2026,
      fullClassIds: new Set(['full-class']),
    });
    await db.batch(result.statements);

    expect(result.enrollmentIds).toEqual([]);
    expect(result.waitlistIds).toEqual([expect.any(String)]);

    const waitlistInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_waitlist'));
    expect(waitlistInsert?.args).toEqual([result.waitlistIds[0], 'full-class', expect.any(String), 5]);

    const waitlistAudit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log') && (c.args as unknown[])[2] === 'waitlist');
    expect(waitlistAudit?.args).toEqual(['public:join', 'waitlist', 'waitlist', result.waitlistIds[0], 'class=full-class position=5']);
  });

  it('assigns sequential positions when two picks land on the same full class', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'COALESCE(MAX(position)': { next_position: 3 } } });
    const validated = normalized({
      tier: 'family',
      members: [{ name: 'Bob Lovelace', birthdate: '2012-01-01', email: null }],
      classPicks: [
        { memberIndex: 0, classId: 'full-class' },
        { memberIndex: 1, classId: 'full-class' },
      ],
    });
    const pricing = computeJoinPricing(validated, PRICES, new Map());
    const result = await buildJoinStatements(db, validated, pricing, {
      season: 2026,
      fullClassIds: new Set(['full-class']),
    });
    await db.batch(result.statements);

    const waitlistInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO class_waitlist'));
    expect(waitlistInserts.map((c) => c.args[3])).toEqual([3, 4]);
  });

  it('batches every statement together (never runs any of them separately)', async () => {
    const { db } = fakeD1();
    const validated = normalized({ classPicks: [{ memberIndex: 0, classId: 'intro-sailing' }] });
    const pricing = computeJoinPricing(validated, PRICES, new Map([['intro-sailing', 100]]));
    const result = await buildJoinStatements(db, validated, pricing, { season: 2026, fullClassIds: new Set() });
    // households + member + household-update + membership + enrollment + audit(enroll) + audit(join)
    expect(result.statements).toHaveLength(7);
  });
});
