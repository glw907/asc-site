import { describe, expect, it } from 'vitest';
import { computeJoinPricing } from '../member-signup/lib/pricing.js';
import type { NormalizedJoinInput } from '../member-signup/lib/types.js';

const PRICES = { individual: 250, family: 500, 'young-adult': 100 };

function normalized(overrides: Partial<NormalizedJoinInput> = {}): NormalizedJoinInput {
  return {
    tier: 'individual',
    purchaser: { name: 'Ada Lovelace', email: 'ada@example.com', phone: null, birthdate: null },
    members: [],
    classPicks: [],
    ...overrides,
  };
}

describe('computeJoinPricing', () => {
  it('prices a plain individual join with no classes: dues only, one credit granted but unused', () => {
    const result = computeJoinPricing(normalized(), PRICES, new Map());
    expect(result).toEqual({
      duesCents: 25000,
      creditsGranted: 1,
      coveredPicks: [],
      paidPicks: [],
      totalCents: 25000,
    });
  });

  it('grants a young-adult purchaser one credit, same as individual', () => {
    const result = computeJoinPricing(normalized({ tier: 'young-adult' }), PRICES, new Map());
    expect(result.duesCents).toBe(10000);
    expect(result.creditsGranted).toBe(1);
  });

  it('covers a single class pick with the individual tier\'s one credit', () => {
    const classFees = new Map([['intro-sailing', 100]]);
    const result = computeJoinPricing(normalized({ classPicks: [{ memberIndex: 0, classId: 'intro-sailing' }] }), PRICES, classFees);
    expect(result.coveredPicks).toEqual([0]);
    expect(result.paidPicks).toEqual([]);
    expect(result.totalCents).toBe(25000);
  });

  it('a family of two parents and three kids: two seats covered by credits, three paid, in pick order', () => {
    const classFees = new Map([
      ['intro-sailing', 100],
      ['youth-sailing', 75],
    ]);
    const input = normalized({
      tier: 'family',
      members: [
        { name: 'Partner', birthdate: null, email: null },
        { name: 'Kid One', birthdate: '2014-01-01', email: null },
        { name: 'Kid Two', birthdate: '2016-01-01', email: null },
        { name: 'Kid Three', birthdate: '2018-01-01', email: null },
      ],
      classPicks: [
        { memberIndex: 0, classId: 'intro-sailing' },
        { memberIndex: 1, classId: 'intro-sailing' },
        { memberIndex: 2, classId: 'youth-sailing' },
        { memberIndex: 3, classId: 'youth-sailing' },
        { memberIndex: 4, classId: 'youth-sailing' },
      ],
    });
    const result = computeJoinPricing(input, PRICES, classFees);
    expect(result.duesCents).toBe(50000);
    expect(result.creditsGranted).toBe(2);
    // The first two picks (pick order, not member order) land the two family credits.
    expect(result.coveredPicks).toEqual([0, 1]);
    expect(result.paidPicks).toEqual([
      { pickIndex: 2, amountCents: 7500 },
      { pickIndex: 3, amountCents: 7500 },
      { pickIndex: 4, amountCents: 7500 },
    ]);
    expect(result.totalCents).toBe(50000 + 7500 * 3);
  });

  it('prices a class missing from the fee map as free rather than throwing', () => {
    const result = computeJoinPricing(
      normalized({
        classPicks: [
          { memberIndex: 0, classId: 'a' },
          { memberIndex: 0, classId: 'b' },
        ],
      }),
      PRICES,
      new Map([['a', 50]]),
    );
    // 'a' consumes the one individual credit; 'b' is missing from the map and prices at 0.
    expect(result.coveredPicks).toEqual([0]);
    expect(result.paidPicks).toEqual([{ pickIndex: 1, amountCents: 0 }]);
  });
});
