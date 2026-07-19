import { describe, expect, it } from 'vitest';
import { MAX_CLASS_PICKS, validateJoinInput } from '../member-signup/lib/validate.js';
import type { JoinInput } from '../member-signup/lib/types.js';

const TODAY = '2026-07-13';

function individualInput(overrides: Partial<JoinInput> = {}): JoinInput {
  return {
    tier: 'individual',
    purchaser: { name: 'ada Lovelace', email: '  Ada@Example.com  ', phone: '(907) 555-0142' },
    members: [],
    classPicks: [],
    ...overrides,
  };
}

describe('validateJoinInput', () => {
  it('accepts a minimal individual submission and normalizes the purchaser', () => {
    const result = validateJoinInput(individualInput(), { today: TODAY });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized?.purchaser).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+19075550142',
      birthdate: null,
    });
  });

  it('normalizes an unparseable phone to its trimmed raw value, never blocking the join', () => {
    const result = validateJoinInput(individualInput({ purchaser: { name: 'Ada', email: 'ada@example.com', phone: 'call me' } }), {
      today: TODAY,
    });
    expect(result.valid).toBe(true);
    expect(result.normalized?.purchaser.phone).toBe('call me');
  });

  it('rejects a submission with no purchaser name', () => {
    const result = validateJoinInput(individualInput({ purchaser: { name: '', email: 'ada@example.com' } }), { today: TODAY });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('A name is required.');
    expect(result.normalized).toBeNull();
  });

  describe('the young-adult age gate', () => {
    it('rejects a purchaser turning 26 on the submission date itself (the edge case)', () => {
      const result = validateJoinInput(
        individualInput({ tier: 'young-adult', purchaser: { name: 'Sam', email: 'sam@example.com', birthdate: '2000-07-13' } }),
        { today: TODAY },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Young Adult membership is only available under 26.');
    });

    it('accepts a purchaser turning 26 the day after submission', () => {
      const result = validateJoinInput(
        individualInput({ tier: 'young-adult', purchaser: { name: 'Sam', email: 'sam@example.com', birthdate: '2000-07-14' } }),
        { today: TODAY },
      );
      expect(result.valid).toBe(true);
    });

    it('rejects a young-adult submission with no birthdate at all', () => {
      const result = validateJoinInput(
        individualInput({ tier: 'young-adult', purchaser: { name: 'Sam', email: 'sam@example.com' } }),
        { today: TODAY },
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Young Adult membership requires a birthdate to verify eligibility.');
    });
  });

  describe('household composition', () => {
    it('accepts additional members on the family tier and normalizes each one', () => {
      const result = validateJoinInput(
        individualInput({
          tier: 'family',
          members: [
            { name: 'BOB lovelace', birthdate: '2012-01-01' },
            { name: 'cleo lovelace', birthdate: '2015-01-01', email: '  Cleo@Example.com ' },
          ],
        }),
        { today: TODAY },
      );
      expect(result.valid).toBe(true);
      expect(result.normalized?.members).toEqual([
        { name: 'Bob Lovelace', birthdate: '2012-01-01', email: null },
        { name: 'Cleo Lovelace', birthdate: '2015-01-01', email: 'cleo@example.com' },
      ]);
    });

    it('rejects additional members on a non-family tier', () => {
      const result = validateJoinInput(individualInput({ members: [{ name: 'Bob' }] }), { today: TODAY });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Only the family tier can include additional household members.');
    });
  });

  describe('class picks', () => {
    it('accepts a pick on the purchaser (memberIndex 0)', () => {
      const result = validateJoinInput(individualInput({ classPicks: [{ memberIndex: 0, classId: 'intro-sailing' }] }), {
        today: TODAY,
      });
      expect(result.valid).toBe(true);
    });

    it('accepts a pick on an entered family member', () => {
      const result = validateJoinInput(
        individualInput({
          tier: 'family',
          members: [{ name: 'Bob', birthdate: '2012-01-01' }],
          classPicks: [{ memberIndex: 1, classId: 'youth-sailing' }],
        }),
        { today: TODAY },
      );
      expect(result.valid).toBe(true);
    });

    it('rejects a pick pointing at a household member that was never entered', () => {
      const result = validateJoinInput(individualInput({ classPicks: [{ memberIndex: 1, classId: 'intro-sailing' }] }), {
        today: TODAY,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A class pick refers to a household member that was not entered.');
    });

    it(`accepts exactly ${MAX_CLASS_PICKS} picks on the purchaser`, () => {
      const classPicks = Array.from({ length: MAX_CLASS_PICKS }, (_, i) => ({ memberIndex: 0, classId: `class-${i}` }));
      const result = validateJoinInput(individualInput({ classPicks }), { today: TODAY });
      expect(result.valid).toBe(true);
    });

    it(`rejects more than ${MAX_CLASS_PICKS} picks with a friendly message, never truncating silently`, () => {
      const classPicks = Array.from({ length: MAX_CLASS_PICKS + 1 }, (_, i) => ({ memberIndex: 0, classId: `class-${i}` }));
      const result = validateJoinInput(individualInput({ classPicks }), { today: TODAY });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`You can select up to ${MAX_CLASS_PICKS} classes at once; for a larger group, please contact us.`);
    });
  });

  it('collects every violation at once, not just the first', () => {
    const result = validateJoinInput(
      individualInput({ purchaser: { name: '', email: 'ada@example.com' }, members: [{ name: 'Bob' }] }),
      { today: TODAY },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['A name is required.', 'Only the family tier can include additional household members.']),
    );
  });
});
