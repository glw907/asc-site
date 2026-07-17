import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { listReceipts } from '$member-portal/lib/receipts';

describe('listReceipts', () => {
  it('reads a dues charge, cents preserved, no unit conversion', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-dues', date: '2026-05-17 00:00:00', amount_cents: 25000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-dues', description: 'Membership dues', membership_season: null, class_name: null },
        ],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-dues', date: '2026-05-17 00:00:00', what: 'Membership dues', amountCents: 25000 },
    ]);
  });

  it('appends the membership season to a dues line, recovering the self-labeling the stored text alone drops', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-dues', date: '2026-05-17 00:00:00', amount_cents: 25000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-dues', description: 'Membership dues', membership_season: 2026, class_name: null },
        ],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-dues', date: '2026-05-17 00:00:00', what: 'Membership dues (2026)', amountCents: 25000 },
    ]);
  });

  it('reads a class-fee charge, the case the old memberships/asset_payments union could never see', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-class', date: '2026-06-20 00:00:00', amount_cents: 15000 }],
        'FROM transaction_lines tl': [{ transaction_id: 'tx-class', description: 'Class fee', membership_season: null, class_name: null }],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-class', date: '2026-06-20 00:00:00', what: 'Class fee', amountCents: 15000 },
    ]);
  });

  it('replaces a generic "Class fee" line with the real class name, resolving the collision live households hit', async () => {
    // Verified live: one household's three separate class-fee charges all stored the identical
    // description "Class fee", indistinguishable in the receipts list -- the enrollment's own
    // class name is the disambiguator the stored text never carried.
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-class', date: '2026-06-20 00:00:00', amount_cents: 10000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-class', description: 'Class fee', membership_season: null, class_name: '2nd Youth Intro to Sailing Class' },
        ],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-class', date: '2026-06-20 00:00:00', what: '2nd Youth Intro to Sailing Class', amountCents: 10000 },
    ]);
  });

  it('reads a donation', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-donation', date: '2026-04-01 00:00:00', amount_cents: 10000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-donation', description: 'Donation to the Alaska Sailing Club', membership_season: null, class_name: null },
        ],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-donation', date: '2026-04-01 00:00:00', what: 'Donation to the Alaska Sailing Club', amountCents: 10000 },
    ]);
  });

  it('composes a bundled multi-line charge as one row, joining each line\'s own label', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-join', date: '2026-05-01 00:00:00', amount_cents: 30000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-join', description: 'Individual Membership -- 2026 season', membership_season: null, class_name: null },
          { transaction_id: 'tx-join', description: 'Class fee', membership_season: null, class_name: 'Intro to Sailing' },
        ],
      },
    });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([
      { id: 'tx-join', date: '2026-05-01 00:00:00', what: 'Individual Membership -- 2026 season, Intro to Sailing', amountCents: 30000 },
    ]);
  });

  it('returns an empty list for a household with no ledger transactions, without querying the lines table', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM transactions t': [] } });

    await expect(listReceipts(db, 'hh-1')).resolves.toEqual([]);
    expect(calls.some((c) => c.sql.includes('FROM transaction_lines'))).toBe(false);
  });

  it('never double-counts: only kind = charge and amount_total_cents > 0 are selected, refunds and $0 comps excluded at the SQL layer', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM transactions t': [{ id: 'tx-dues', date: '2026-05-17 00:00:00', amount_cents: 25000 }],
        'FROM transaction_lines tl': [
          { transaction_id: 'tx-dues', description: 'Membership dues', membership_season: null, class_name: null },
        ],
      },
    });

    const receipts = await listReceipts(db, 'hh-1');
    expect(receipts).toHaveLength(1);
    const txCall = calls.find((c) => c.sql.includes('FROM transactions t'));
    expect(txCall?.sql).toContain("kind = 'charge'");
    expect(txCall?.sql).toContain('amount_total_cents > 0');
    const lineCall = calls.find((c) => c.sql.includes('FROM transaction_lines tl'));
    expect(lineCall?.sql).toContain("kind = 'charge'");
    expect(lineCall?.sql).toContain('amount_total_cents > 0');
  });
});
