import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  getHouseholdTimeline,
  getMoneyOverview,
  listAttentionItems,
  listRecentTransactions,
  listRenewalCandidates,
  listSeasonMemberships,
} from '$admin-club/lib/money-store';

const CHARGE_ROW = {
  id: 'tx-1',
  kind: 'charge',
  source: 'stripe',
  occurred_at: '2026-06-01 12:00:00',
  amount_total_cents: 50000,
  fee_cents: 1500,
  processor_ref: 'cs_test_abc',
  refunds_transaction_id: null,
  household_id: 'hh-1',
  household_name: null,
  payer_name: 'Erik Larsen',
  payer_email: 'erik@example.com',
  memo: null,
  mw_ref: null,
  refunded_so_far: 0,
};

const LINE_ROW = {
  id: 'line-1',
  transaction_id: 'tx-1',
  item: 'dues',
  description: '2026 Family Membership',
  amount_cents: 50000,
  membership_id: 'ms-1',
  enrollment_id: null,
  assignment_id: null,
};

describe('getHouseholdTimeline', () => {
  it('nests lines under their own transaction, newest first per the query order', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM transactions t': [CHARGE_ROW],
        'FROM transaction_lines tl': [LINE_ROW],
      },
    });

    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx).toMatchObject({ id: 'tx-1', kind: 'charge', amountTotalCents: 50000 });
    expect(tx.lines).toEqual([
      { id: 'line-1', item: 'dues', description: '2026 Family Membership', amountCents: 50000, membershipId: 'ms-1', enrollmentId: null, assignmentId: null, refundedCents: 0 },
    ]);
    expect(calls.find((c) => c.sql.includes('FROM transactions t'))?.sql).toContain('ORDER BY t.occurred_at DESC');
  });

  it('sums a matching refund line\'s own amount into refundedCents, keyed by item plus domain reference', async () => {
    const refundRow = {
      ...CHARGE_ROW,
      id: 'tx-refund-1',
      kind: 'refund',
      refunds_transaction_id: 'tx-1',
      amount_total_cents: 15000,
    };
    const refundLineRow = {
      id: 'line-refund-1',
      transaction_id: 'tx-refund-1',
      item: 'dues',
      description: 'Refund: 2026 Family Membership',
      amount_cents: 15000,
      membership_id: 'ms-1',
      enrollment_id: null,
      assignment_id: null,
    };
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [CHARGE_ROW, refundRow],
        'FROM transaction_lines tl': [LINE_ROW, refundLineRow],
      },
    });
    const [charge] = await getHouseholdTimeline(db, 'hh-1');
    expect(charge.lines[0].refundedCents).toBe(15000);
  });

  it('never confuses two different lines that share an item but not a domain reference', async () => {
    const otherLine = { ...LINE_ROW, id: 'line-2', membership_id: 'ms-2' };
    const refundRow = { ...CHARGE_ROW, id: 'tx-refund-1', kind: 'refund', refunds_transaction_id: 'tx-1', amount_total_cents: 15000 };
    const refundLineRow = {
      id: 'line-refund-1',
      transaction_id: 'tx-refund-1',
      item: 'dues',
      description: 'Refund: some other membership',
      amount_cents: 15000,
      membership_id: 'ms-2',
      enrollment_id: null,
      assignment_id: null,
    };
    const { db } = fakeD1({
      allResults: {
        'FROM transactions t': [CHARGE_ROW, refundRow],
        'FROM transaction_lines tl': [LINE_ROW, otherLine, refundLineRow],
      },
    });
    const [charge] = await getHouseholdTimeline(db, 'hh-1');
    expect(charge.lines.find((line) => line.id === 'line-1')?.refundedCents).toBe(0);
  });

  it('marks a fresh stripe charge refundable and API-eligible', async () => {
    const { db } = fakeD1({ allResults: { 'FROM transactions t': [CHARGE_ROW], 'FROM transaction_lines tl': [LINE_ROW] } });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.refundable).toBe(true);
    expect(tx.apiEligible).toBe(true);
  });

  it('marks a fully refunded charge not refundable', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, refunded_so_far: 50000 }], 'FROM transaction_lines tl': [LINE_ROW] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.refundable).toBe(false);
  });

  it('keeps a partially refunded charge refundable', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, refunded_so_far: 20000 }], 'FROM transaction_lines tl': [LINE_ROW] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.refundable).toBe(true);
  });

  it('never marks a refund or void row itself as refundable', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, kind: 'refund' }], 'FROM transaction_lines tl': [] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.refundable).toBe(false);
  });

  it('an imported MembershipWorks row is never API-eligible even with a stripe source', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, mw_ref: 'mw-1234' }], 'FROM transaction_lines tl': [] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.apiEligible).toBe(false);
  });

  it('a check/cash source is never API-eligible', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, source: 'check', processor_ref: null }], 'FROM transaction_lines tl': [] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.apiEligible).toBe(false);
  });

  it('a payment-intent processor ref is API-eligible', async () => {
    const { db } = fakeD1({
      allResults: { 'FROM transactions t': [{ ...CHARGE_ROW, processor_ref: 'pi_test_xyz' }], 'FROM transaction_lines tl': [] },
    });
    const [tx] = await getHouseholdTimeline(db, 'hh-1');
    expect(tx.apiEligible).toBe(true);
  });
});

describe('listRecentTransactions', () => {
  it('joins the household name and binds the limit', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM transactions t': [{ ...CHARGE_ROW, household_name: 'The Larsens' }],
        'FROM transaction_lines WHERE transaction_id IN': [LINE_ROW],
      },
    });
    const [tx] = await listRecentTransactions(db, 20);
    expect(tx.householdName).toBe('The Larsens');
    expect(tx.lines).toHaveLength(1);
    const txCall = calls.find((c) => c.sql.includes('LEFT JOIN households h'));
    expect(txCall?.args).toEqual([20]);
    const lineCall = calls.find((c) => c.sql.includes('transaction_id IN'));
    expect(lineCall?.args).toEqual(['tx-1']);
  });

  it('never queries lines when there are no transactions', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM transactions t': [] } });
    await expect(listRecentTransactions(db, 20)).resolves.toEqual([]);
    expect(calls.some((c) => c.sql.includes('transaction_lines'))).toBe(false);
  });
});

describe('listSeasonMemberships', () => {
  it('maps the flat row, source read from the linked dues charge', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM memberships m': [
          {
            id: 'ms-1',
            household_id: 'hh-1',
            household_name: 'The Larsens',
            season: 2026,
            tier: 'family',
            price_paid: 500,
            paid_at: '2026-01-01',
            refunded_at: null,
            source: 'stripe',
          },
        ],
      },
    });
    const [row] = await listSeasonMemberships(db, 2026);
    expect(row).toEqual({
      id: 'ms-1',
      householdId: 'hh-1',
      householdName: 'The Larsens',
      season: 2026,
      tier: 'family',
      pricePaid: 500,
      paidAt: '2026-01-01',
      refundedAt: null,
      source: 'stripe',
    });
    expect(calls[0].args).toEqual([2026]);
  });

  it('reads source as null for an invoiced-but-unpaid row', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM memberships m': [
          { id: 'ms-2', household_id: 'hh-2', household_name: 'The Halvorsens', season: 2026, tier: 'individual', price_paid: 250, paid_at: null, refunded_at: null, source: null },
        ],
      },
    });
    const [row] = await listSeasonMemberships(db, 2026);
    expect(row.source).toBeNull();
  });
});

describe('listRenewalCandidates', () => {
  it('binds season - 1 and maps the grounding row', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM households h': [
          { household_id: 'hh-1', household_name: 'The Whitfields', season: 2025, tier: 'family', price_paid: 500, paid_at: '2025-02-11' },
        ],
      },
    });
    const rows = await listRenewalCandidates(db, 2026);
    expect(rows).toEqual([
      { householdId: 'hh-1', householdName: 'The Whitfields', lastSeason: 2025, tier: 'family', pricePaid: 500, paidAt: '2025-02-11' },
    ]);
    expect(calls[0].args).toEqual([2025]);
  });

  it('carries the refunded-row-ignored predicate on the grounding subquery', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM households h': [] } });
    await listRenewalCandidates(db, 2026);
    expect(calls[0].sql).toContain('mm.refunded_at IS NULL');
  });
});

describe('listAttentionItems', () => {
  it('maps an active assignment whose household lacks a paid season row', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM asset_assignments aa': [
          { assignment_id: 'aa-1', household_id: 'hh-hunter', household_name: 'Elayne C Hunter', asset_type_name: 'Small Boat Rack', membership_season: 2024 },
        ],
      },
    });
    const rows = await listAttentionItems(db, 2026);
    expect(rows).toEqual([
      { assignmentId: 'aa-1', householdId: 'hh-hunter', householdName: 'Elayne C Hunter', assetTypeName: 'Small Boat Rack', membershipSeason: 2024 },
    ]);
    expect(calls[0].args).toEqual([2026]);
    expect(calls[0].sql).toContain('NOT EXISTS');
  });
});

describe('getMoneyOverview', () => {
  it('composes the four stat tiles from the scalar queries and the two list sizes', async () => {
    const { db } = fakeD1({
      firstResults: {
        'COUNT(*) AS n FROM households': { n: 148 },
        'COUNT(DISTINCT household_id)': { n: 84 },
        'SUM(price_paid)': { total: 30044 },
      },
      allResults: {
        'FROM households h': [{ household_id: 'hh-1', household_name: 'A', season: 2025, tier: 'individual', price_paid: 250, paid_at: '2025-01-01' }],
        'FROM asset_assignments aa': [],
      },
    });
    await expect(getMoneyOverview(db, 2026)).resolves.toEqual({
      totalHouseholds: 148,
      currentHouseholds: 84,
      duesCollected: 30044,
      renewalCandidates: 1,
      attentionCount: 0,
    });
  });

  it('defaults every scalar to zero when the tables are empty', async () => {
    const { db } = fakeD1({ allResults: { 'FROM households h': [], 'FROM asset_assignments aa': [] } });
    await expect(getMoneyOverview(db, 2026)).resolves.toEqual({
      totalHouseholds: 0,
      currentHouseholds: 0,
      duesCollected: 0,
      renewalCandidates: 0,
      attentionCount: 0,
    });
  });
});
