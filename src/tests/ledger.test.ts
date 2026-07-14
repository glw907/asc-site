import { describe, expect, it } from 'vitest';
import { buildTransactionStatements, recordTransaction, signedAmountCents, type TransactionHeader, type TransactionLineInput } from '$admin-club/lib/ledger';
import { fakeD1, type FakeD1Call } from './_fake-d1';

/** `buildTransactionStatements` returns real `D1PreparedStatement`s, which carry no public `sql`/
 *  `args` accessors; `fakeD1`'s own stand-in objects do, so a test inspecting what got built casts
 *  through this shape rather than widening the production return type just to satisfy a test. */
function asCall(statement: unknown): FakeD1Call {
  return statement as FakeD1Call;
}

const DUES_HEADER: TransactionHeader = {
  kind: 'charge',
  source: 'stripe',
  occurredAt: '2026-07-13 12:00:00',
  amountTotalCents: 25000,
  processorRef: 'cs_test_123',
  householdId: 'hh-1',
};

const DUES_LINE: TransactionLineInput = {
  item: 'dues',
  description: 'Family Membership -- 2026 season',
  amountCents: 25000,
  membershipId: 'mem-1',
};

describe('signedAmountCents', () => {
  it('charge is positive, refund is negative, void is zero', () => {
    expect(signedAmountCents('charge', 25000)).toBe(25000);
    expect(signedAmountCents('refund', 25000)).toBe(-25000);
    expect(signedAmountCents('void', 25000)).toBe(0);
  });
});

describe('buildTransactionStatements', () => {
  it('throws when the lines do not sum to amount_total_cents', () => {
    const { db } = fakeD1();
    expect(() => buildTransactionStatements(db, DUES_HEADER, [{ ...DUES_LINE, amountCents: 100 }])).toThrow();
  });

  it('throws when a line carries more than one domain reference', () => {
    const { db } = fakeD1();
    const badLine: TransactionLineInput = { ...DUES_LINE, membershipId: 'mem-1', enrollmentId: 'enr-1' };
    expect(() => buildTransactionStatements(db, DUES_HEADER, [badLine])).toThrow();
  });

  it('mints an id when the header omits one, and produces one transactions INSERT plus one INSERT per line', () => {
    const { db } = fakeD1();
    const { id, statements } = buildTransactionStatements(db, DUES_HEADER, [DUES_LINE]);
    expect(id).toBeTruthy();
    expect(statements).toHaveLength(2);
    expect(asCall(statements[0]).sql).toContain('INSERT INTO transactions');
    expect(asCall(statements[0]).args).toEqual([
      id,
      'charge',
      'stripe',
      '2026-07-13 12:00:00',
      25000,
      null,
      'cs_test_123',
      null,
      'hh-1',
      null,
      null,
      null,
      null,
    ]);
    expect(asCall(statements[1]).sql).toContain('INSERT INTO transaction_lines');
    expect(asCall(statements[1]).args).toEqual([expect.any(String), id, 'dues', 'Family Membership -- 2026 season', 25000, 'mem-1', null, null]);
  });

  it('keeps a caller-supplied id', () => {
    const { db } = fakeD1();
    const { id, statements } = buildTransactionStatements(db, { ...DUES_HEADER, id: 'txn-fixed-1' }, [DUES_LINE]);
    expect(id).toBe('txn-fixed-1');
    expect(asCall(statements[0]).args[0]).toBe('txn-fixed-1');
  });

  it('accepts a zero-total void with a matching zero-sum line set', () => {
    const { db } = fakeD1();
    const voidHeader: TransactionHeader = { ...DUES_HEADER, kind: 'void', amountTotalCents: 0 };
    expect(() => buildTransactionStatements(db, voidHeader, [{ ...DUES_LINE, amountCents: 0 }])).not.toThrow();
  });

  it('accepts a comp transaction whose list-price and discount lines net to zero', () => {
    const { db } = fakeD1();
    const compHeader: TransactionHeader = { ...DUES_HEADER, source: 'comp', amountTotalCents: 0 };
    const lines: TransactionLineInput[] = [
      { item: 'class-fee', description: 'Intro to Sailing seat', amountCents: 15000, enrollmentId: 'enr-1' },
      { item: 'discount', description: 'Comped seat', amountCents: -15000 },
    ];
    const { statements } = buildTransactionStatements(db, compHeader, lines);
    expect(statements).toHaveLength(3);
  });
});

describe('recordTransaction', () => {
  it('batches the built statements and returns the transaction id', async () => {
    const { db, calls } = fakeD1();
    const id = await recordTransaction(db, DUES_HEADER, [DUES_LINE]);
    expect(id).toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('INSERT INTO transactions');
    expect(calls[1].sql).toContain('INSERT INTO transaction_lines');
  });
});
