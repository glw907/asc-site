import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildListPriceIndex,
  buildRepairLineStatements,
  buildSubtotalLines,
  buildTransactionInsertStatements,
  classifyKind,
  deriveMwRef,
  formatReport,
  linkDomainRows,
  linkRefunds,
  parseMoneyToCents,
  planMwLedgerImport,
  planRepairs,
  planTransactionRow,
} from '../../scripts/import/mw-ledger.mjs';
import { RowRefusedError, parseMwCsv } from '../../scripts/import/mw-members.mjs';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadRows() {
  return parseMwCsv(readFileSync(path.join(FIXTURES_DIR, 'mw-accounting-ledger-synthetic.csv'), 'utf8'));
}

const CTX = { accountId: 'acct-1', accountName: 'Test', email: 'test@example.com' };

/** The database state `mw-members.mjs` would already have written before this backfill runs:
 *  households acct-1 through acct-6 resolved (acct-unknown deliberately absent), one existing
 *  membership matching the bundle transaction's dues line, one existing stripe-linked enrollment
 *  matching the event transaction. */
function existingState() {
  return {
    householdIdByMwAccountId: new Map([
      ['acct-1', 'household-1'],
      ['acct-2', 'household-2'],
      ['acct-3', 'household-3'],
      ['acct-4', 'household-4'],
      ['acct-5', 'household-5'],
      ['acct-6', 'household-6'],
      ['acct-7', 'household-7'],
      ['acct-8', 'household-8'],
      ['acct-9', 'household-9'],
    ]),
    memberships: [{ id: 'membership-1', householdId: 'household-1', paidAt: '2026-01-10', pricePaid: 150 }],
    enrollments: [{ id: 'enrollment-1', householdId: 'household-4', stripeRef: 'ch_evt1' }],
    existingMwRefs: new Set<string>(),
    existingIdByMwRef: new Map<string, string>(),
    headersMissingLines: [] as { id: string; mwRef: string }[],
    // acct-7's comp row (fixture Reference 'Event: 2nd Adult/Teen Intro to Sailing Class (Thu Jul
    // 18 2024, 01:00pm AKDT)') resolves via HISTORICAL_CLASS_MAP to season 2024, slug
    // 'adult-intro-class-2' -- the real class this fixture's list-price fallback matches against.
    classFeeCentsBySeasonSlug: new Map([['2024:adult-intro-class-2', 10000]]),
  };
}

describe('classifyKind', () => {
  it('classifies a voided row as void regardless of its Transaction Total sign', () => {
    expect(classifyKind({ Items: 'Voided', 'Transaction Total': '90' }, CTX)).toBe('void');
  });

  it('classifies a negative-total row as a refund', () => {
    expect(classifyKind({ Items: '', 'Transaction Total': '-120' }, CTX)).toBe('refund');
  });

  it('classifies everything else as a charge', () => {
    expect(classifyKind({ Items: '', 'Transaction Total': '100' }, CTX)).toBe('charge');
    expect(classifyKind({ Items: '', 'Transaction Total': '0' }, CTX)).toBe('charge');
  });
});

describe('deriveMwRef', () => {
  it('is stable across repeated derivation of the same row', () => {
    const row = { Date: 'Jan 10, 2026', 'Account ID': 'acct-1', 'Transaction Type': 'Membership', Reference: '', Items: 'Family membership - Renewal', 'Transaction Total': '200', 'Payment ID': 'ch_fam1', 'Discount Code': '', Note: '' };
    expect(deriveMwRef(row)).toBe(deriveMwRef({ ...row }));
  });

  it('differs when an identifying column differs', () => {
    const a = { Date: 'Jan 10, 2026', 'Account ID': 'acct-1', 'Transaction Type': 'Membership', Reference: '', Items: 'x', 'Transaction Total': '200', 'Payment ID': '', 'Discount Code': '', Note: '' };
    const b = { ...a, 'Account ID': 'acct-2' };
    expect(deriveMwRef(a)).not.toBe(deriveMwRef(b));
  });
});

describe('parseMoneyToCents', () => {
  it('parses whole dollars, thousands commas, and a leading $ to cents', () => {
    expect(parseMoneyToCents('250', CTX, 'x')).toBe(25000);
    expect(parseMoneyToCents('$1,200', CTX, 'x')).toBe(120000);
    expect(parseMoneyToCents('-120', CTX, 'x')).toBe(-12000);
  });

  it('parses one or two decimal places without float rounding drift', () => {
    expect(parseMoneyToCents('3.20', CTX, 'x')).toBe(320);
    expect(parseMoneyToCents('6.10', CTX, 'x')).toBe(610);
    expect(parseMoneyToCents('$1,200.50', CTX, 'x')).toBe(120050);
    expect(parseMoneyToCents('25.5', CTX, 'x')).toBe(2550);
  });

  it('treats a blank cell as zero', () => {
    expect(parseMoneyToCents('', CTX, 'x')).toBe(0);
  });

  it('refuses more than two decimal places', () => {
    expect(() => parseMoneyToCents('3.201', CTX, 'x')).toThrow(RowRefusedError);
  });

  it('refuses non-numeric content', () => {
    expect(() => parseMoneyToCents('not a number', CTX, 'x')).toThrow(RowRefusedError);
  });
});

describe('buildSubtotalLines', () => {
  it('builds one line per non-zero sub-total column, dropping zero columns', () => {
    const row = { 'Membership Sub-Total': '150', 'Event Sub-Total': '0', 'Donation Sub-Total': '0', 'Cart Sub-Total': '50', 'Other Sub-Total': '0', Handling: '0', 'Total Tax': '0' };
    expect(buildSubtotalLines(row, CTX)).toEqual([
      { item: 'dues', description: 'Membership dues', amountCents: 15000 },
      { item: 'asset-fee', description: 'Asset add-on', amountCents: 5000 },
    ]);
  });

  it('combines Handling and Total Tax into one other line', () => {
    const row = { 'Membership Sub-Total': '0', 'Event Sub-Total': '75', 'Donation Sub-Total': '0', 'Cart Sub-Total': '0', 'Other Sub-Total': '0', Handling: '2', 'Total Tax': '3' };
    expect(buildSubtotalLines(row, CTX)).toEqual([
      { item: 'class-fee', description: 'Class fee', amountCents: 7500 },
      { item: 'other', description: 'Handling & tax', amountCents: 500 },
    ]);
  });
});

describe('buildListPriceIndex', () => {
  it('derives the highest non-comped price per membership tier and per event Reference', () => {
    const rows = loadRows();
    const index = buildListPriceIndex(rows);
    // The highest "individual" price in the fixture is Jordan Fiveington's $120 (later refunded);
    // a later refund does not disqualify a row from establishing a real list price.
    expect(index.membershipCentsByTier.get('individual')).toBe(12000);
    expect(index.membershipCentsByTier.get('family')).toBe(15000);
    expect(index.eventCentsByReference.get('2024-1st-adult')).toBe(7500);
  });
});

describe('planTransactionRow: membership bundle with an asset add-on line', () => {
  it('splits the Membership and Cart sub-totals into a dues line and an asset-fee line', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-1')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.kind).toBe('charge');
    expect(planned.source).toBe('stripe');
    expect(planned.amountTotalCents).toBe(20000);
    expect(planned.feeCents).toBe(610); // Transaction Fee is fractional ($6.10) in the fixture
    expect(planned.householdId).toBe('household-1');
    expect(planned.lines).toEqual([
      { item: 'dues', description: 'Membership dues', amountCents: 15000, membershipId: null, enrollmentId: null, assignmentId: null },
      { item: 'asset-fee', description: 'Asset add-on', amountCents: 5000, membershipId: null, enrollmentId: null, assignmentId: null },
    ]);
  });
});

describe('planTransactionRow: comped seat', () => {
  it('derives a list price and emits a positive item line plus a matching negative discount line', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-3')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.source).toBe('comp');
    expect(planned.amountTotalCents).toBe(0);
    expect(planned.lines).toEqual([
      { item: 'dues', description: 'Membership dues (comp)', amountCents: 12000, membershipId: null, enrollmentId: null, assignmentId: null },
      { item: 'discount', description: 'Comp discount', amountCents: -12000, membershipId: null, enrollmentId: null, assignmentId: null },
    ]);
  });

  it('refuses a comp row whose tier has no real (non-comped) price anywhere in the file', () => {
    const rows = loadRows();
    const compOnlyRow = { ...rows.find((r) => r['Account ID'] === 'acct-3')!, Items: 'Young adult membership - Comp' };
    expect(() => planTransactionRow(compOnlyRow, existingState(), buildListPriceIndex(rows))).toThrow(RowRefusedError);
  });
});

describe('planTransactionRow: void', () => {
  it('records what would have moved, with no sign flip on the header amount', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-6')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.kind).toBe('void');
    expect(planned.amountTotalCents).toBe(9000);
    expect(planned.lines).toEqual([{ item: 'dues', description: 'Membership dues', amountCents: 9000, membershipId: null, enrollmentId: null, assignmentId: null }]);
  });
});

describe('planTransactionRow: donation', () => {
  it('leaves household_id null and snapshots the payer name/email instead', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Transaction Type'] === 'Donation')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.householdId).toBeNull();
    expect(planned.payerName).toBe('Anonymous Donor');
    expect(planned.payerEmail).toBe('donor@example.com');
    // Donation Sub-Total is fractional ($25.50) in the fixture -- 2550 cents, not 2500.
    expect(planned.lines).toEqual([{ item: 'donation', description: 'Donation', amountCents: 2550, membershipId: null, enrollmentId: null, assignmentId: null }]);
    // The fixture's donation row itself carries a blank Account ID -- FIX A's memo note.
    expect(planned.memo).toBe('blank Account ID');
  });
});

describe('planTransactionRow: blank Account ID (FIX A)', () => {
  it('never refuses a blank-Account-ID row, for a non-Donation Transaction Type either', () => {
    const rows = loadRows();
    const row = rows.find((r) => r.Items?.trim() === 'Voided' && r['Discount Code']?.trim() === 'sitetest')!;
    expect(row['Account ID']?.trim()).toBe('');
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.kind).toBe('void');
    expect(planned.householdId).toBeNull();
    expect(planned.amountTotalCents).toBe(0);
    // The discount code rides along in the memo, so the site-test void is self-describing.
    expect(planned.memo).toBe('blank Account ID (discount code: sitetest)');
  });
});

describe('planTransactionRow: unmatchable row', () => {
  it('refuses a Membership row whose account resolves to no household', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-unknown')!;
    expect(() => planTransactionRow(row, existingState(), buildListPriceIndex(rows))).toThrow(RowRefusedError);
  });
});

describe('planTransactionRow: all-comped event, no paid row for the key (FIX B)', () => {
  it('falls back to the class fee when the comp links to a minted historical class', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-7')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.source).toBe('comp');
    expect(planned.amountTotalCents).toBe(0);
    expect(planned.lines).toEqual([
      { item: 'class-fee', description: 'Class fee (comp)', amountCents: 10000, membershipId: null, enrollmentId: null, assignmentId: null },
      { item: 'discount', description: 'Comp discount', amountCents: -10000, membershipId: null, enrollmentId: null, assignmentId: null },
    ]);
    expect(planned.memo).toBeNull();
  });

  it('plans a 0-cent line with no discount line and a memo when no class fee is findable either', () => {
    const rows = loadRows();
    const row = rows.find((r) => r['Account ID'] === 'acct-8')!;
    const planned = planTransactionRow(row, existingState(), buildListPriceIndex(rows));
    expect(planned.source).toBe('comp');
    expect(planned.amountTotalCents).toBe(0);
    expect(planned.lines).toEqual([{ item: 'class-fee', description: 'Class fee (comp)', amountCents: 0, membershipId: null, enrollmentId: null, assignmentId: null }]);
    expect(planned.memo).toBe('list price unknown; comped');
  });
});

describe('linkRefunds', () => {
  it('links a refund to its most recent matching prior charge', () => {
    const rows = loadRows();
    const index = buildListPriceIndex(rows);
    const existing = existingState();
    const planned = rows
      .filter((r) => r['Account ID'] === 'acct-5')
      .map((row) => ({ ...planTransactionRow(row, existing, index), id: crypto.randomUUID(), refundsTransactionId: null as string | null }));
    const warnings = linkRefunds(planned);
    const charge = planned.find((t) => t.kind === 'charge')!;
    const refund = planned.find((t) => t.kind === 'refund')!;
    expect(refund.refundsTransactionId).toBe(charge.id);
    expect(warnings).toHaveLength(0);
  });

  it('leaves refundsTransactionId null and returns a loud warning when no matching prior charge exists', () => {
    const orphanRefund = {
      kind: 'refund' as const,
      refundLinkKey: 'Membership:acct-9:',
      amountTotalCents: 5000,
      id: 'r1',
      mwRef: 'mw-ledger:orphan',
      accountId: 'acct-9',
      refundsTransactionId: null as string | null,
    };
    const warnings = linkRefunds([orphanRefund] as never);
    expect(orphanRefund.refundsTransactionId).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('acct-9');
  });

  it('links a PARTIAL refund to its charge by matching Transaction Type, normalized Items text, and date, even when the Event Reference itself differs (FIX C)', () => {
    // Mirrors the real export's own quirk: a charge and its later PARTIAL refund can carry two
    // different Event Reference strings for the identical instance (the export's own `2st`/`2nd`
    // typo pair, in the real data) -- the fixture's charge and refund rows deliberately use two
    // different References, so this only passes if the fallback match ignores Reference and
    // groups on account + Transaction Type alone.
    const rows = loadRows();
    const index = buildListPriceIndex(rows);
    const existing = existingState();
    const acct9Rows = rows.filter((r) => r['Account ID'] === 'acct-9');
    expect(new Set(acct9Rows.map((r) => r.Reference)).size).toBe(2); // the charge and refund really do disagree on Reference
    const planned = acct9Rows.map((row) => ({ ...planTransactionRow(row, existing, index), id: crypto.randomUUID(), refundsTransactionId: null as string | null }));
    const warnings = linkRefunds(planned);
    const charge = planned.find((t) => t.kind === 'charge')!;
    const refund = planned.find((t) => t.kind === 'refund')!;
    expect(charge.amountTotalCents).toBe(20000);
    expect(refund.amountTotalCents).toBe(10000); // a PARTIAL refund -- not equal to the charge
    expect(refund.refundsTransactionId).toBe(charge.id);
    expect(warnings).toHaveLength(0);
  });

  it('links a refund to a charge already imported in a prior run, by its REAL database id', () => {
    // Simulates run 2: the DB already holds the charge (a fake existing-rows response carrying
    // its real id); this run's export adds the refund for the first time. The planned refund row
    // must carry the charge's REAL database id, not a throwaway id this run would otherwise mint
    // for a row it never re-inserts.
    const rows = loadRows();
    const chargeRow = rows.find((r) => r['Account ID'] === 'acct-5' && r['Transaction Total'] === '120')!;
    const chargeMwRef = deriveMwRef(chargeRow);
    const existing = {
      ...existingState(),
      existingMwRefs: new Set([chargeMwRef]),
      existingIdByMwRef: new Map([[chargeMwRef, 'db-charge-real-id']]),
    };
    const plan = planMwLedgerImport(rows, existing);

    // The charge itself is already imported -- not re-inserted.
    expect(plan.alreadyImported).toContainEqual({ mwRef: chargeMwRef });
    expect(plan.toInsert.find((t) => t.mwRef === chargeMwRef)).toBeUndefined();

    const refund = plan.toInsert.find((t) => t.kind === 'refund')!;
    expect(refund.refundsTransactionId).toBe('db-charge-real-id');
  });
});

describe('linkDomainRows', () => {
  it('links a dues line to the matching existing membership row', () => {
    const rows = loadRows();
    const index = buildListPriceIndex(rows);
    const existing = existingState();
    const row = rows.find((r) => r['Account ID'] === 'acct-1')!;
    const planned = [{ ...planTransactionRow(row, existing, index), id: 't1', refundsTransactionId: null }];
    linkDomainRows(planned, existing);
    expect(planned[0].lines.find((l) => l.item === 'dues')?.membershipId).toBe('membership-1');
  });

  it('links a class-fee line to the single matching enrollment sharing the processor ref', () => {
    const rows = loadRows();
    const index = buildListPriceIndex(rows);
    const existing = existingState();
    const row = rows.find((r) => r['Account ID'] === 'acct-4')!;
    const planned = [{ ...planTransactionRow(row, existing, index), id: 't2', refundsTransactionId: null }];
    linkDomainRows(planned, existing);
    expect(planned[0].lines.find((l) => l.item === 'class-fee')?.enrollmentId).toBe('enrollment-1');
  });
});

describe('planRepairs (partial-apply self-heal)', () => {
  it('re-derives lines for an existing header with zero transaction_lines rows', () => {
    const rows = loadRows();
    const chargeRow = rows.find((r) => r['Account ID'] === 'acct-1')!;
    const mwRef = deriveMwRef(chargeRow);
    const existing = {
      ...existingState(),
      existingMwRefs: new Set([mwRef]),
      existingIdByMwRef: new Map([[mwRef, 'db-txn-1']]),
      headersMissingLines: [{ id: 'db-txn-1', mwRef }],
    };
    const plan = planMwLedgerImport(rows, existing);

    expect(plan.repairs).toHaveLength(1);
    expect(plan.repairs[0].transactionId).toBe('db-txn-1');
    expect(plan.repairs[0].mwRef).toBe(mwRef);
    expect(plan.repairs[0].lines).toEqual([
      { item: 'dues', description: 'Membership dues', amountCents: 15000, membershipId: 'membership-1', enrollmentId: null, assignmentId: null },
      { item: 'asset-fee', description: 'Asset add-on', amountCents: 5000, membershipId: null, enrollmentId: null, assignmentId: null },
    ]);
    // The header row itself is already imported -- a repair never re-inserts the header.
    expect(plan.toInsert.find((t) => t.mwRef === mwRef)).toBeUndefined();
  });

  it('plans nothing for a fully-imported transaction (a header that already has its lines)', () => {
    const rows = loadRows();
    const chargeRow = rows.find((r) => r['Account ID'] === 'acct-2')!;
    const mwRef = deriveMwRef(chargeRow);
    const existing = {
      ...existingState(),
      existingMwRefs: new Set([mwRef]),
      existingIdByMwRef: new Map([[mwRef, 'db-txn-2']]),
      headersMissingLines: [], // this header already has its lines -- nothing to repair
    };
    const plan = planMwLedgerImport(rows, existing);
    expect(plan.repairs).toHaveLength(0);
  });

  it('leaves a header alone when its row is no longer present in this export', () => {
    const planned = planRepairs([], { headersMissingLines: [{ id: 'db-txn-9', mwRef: 'mw-ledger:gone' }] } as never);
    expect(planned).toHaveLength(0);
  });
});

describe('buildRepairLineStatements', () => {
  it('emits one transaction_lines INSERT per line and no transactions INSERT', () => {
    const repair = {
      transactionId: 'db-txn-1',
      mwRef: 'mw-ledger:test',
      lines: [
        { item: 'dues', description: 'Membership dues', amountCents: 15000, membershipId: 'membership-1', enrollmentId: null, assignmentId: null },
        { item: 'asset-fee', description: 'Asset add-on', amountCents: 5000, membershipId: null, enrollmentId: null, assignmentId: null },
      ],
      lineCount: 2,
    };
    const statements = buildRepairLineStatements(repair);
    expect(statements).toHaveLength(2);
    for (const s of statements) {
      expect(s).toContain('INSERT INTO transaction_lines');
      expect(s).not.toContain('INSERT INTO transactions ');
      expect(s).toContain("'db-txn-1'");
    }
  });
});

describe('planMwLedgerImport (integration)', () => {
  it('plans every category, refuses the unmatchable row, and links refunds/domain rows', () => {
    const rows = loadRows();
    const plan = planMwLedgerImport(rows, existingState());

    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0].reason).toContain('no household resolves');
    expect(plan.toInsert).toHaveLength(rows.length - 1);

    const bundle = plan.toInsert.find((t) => t.householdId === 'household-1')!;
    expect(bundle.lines.find((l) => l.item === 'dues')?.membershipId).toBe('membership-1');

    const refund = plan.toInsert.find((t) => t.kind === 'refund')!;
    const charge = plan.toInsert.find((t) => t.kind === 'charge' && t.householdId === 'household-5')!;
    expect(refund.refundsTransactionId).toBe(charge.id);

    const voidRow = plan.toInsert.find((t) => t.kind === 'void')!;
    expect(voidRow.amountTotalCents).toBe(9000);

    for (const t of plan.toInsert) {
      const sum = t.lines.reduce((s, l) => s + l.amountCents, 0);
      expect(sum).toBe(t.amountTotalCents);
    }

    expect(plan.warnings).toHaveLength(0); // the refund above links cleanly
    expect(plan.repairs).toHaveLength(0); // no already-imported header in this run
  });

  it('is idempotent: a second run against unchanged input plans zero inserts and zero repairs', () => {
    const rows = loadRows();
    const existing = existingState();
    const first = planMwLedgerImport(rows, existing);
    const secondExisting = {
      ...existing,
      existingMwRefs: new Set(first.toInsert.map((t) => t.mwRef)),
      // Every row this run wrote now carries the id the FIRST run assigned it -- the real
      // database id a live re-run would read back, per the id-assignment step's own contract.
      existingIdByMwRef: new Map(first.toInsert.map((t) => [t.mwRef, t.id])),
      headersMissingLines: [], // the clean apply wrote every header's lines -- nothing to repair
    };
    const second = planMwLedgerImport(rows, secondExisting);
    expect(second.toInsert).toHaveLength(0);
    expect(second.alreadyImported).toHaveLength(first.toInsert.length);
    expect(second.repairs).toHaveLength(0);
  });
});

describe('buildTransactionInsertStatements', () => {
  it('emits one transactions INSERT and one transaction_lines INSERT per line', () => {
    const t = {
      id: 'txn-1',
      mwRef: 'mw-ledger:test',
      kind: 'charge' as const,
      source: 'stripe' as const,
      occurredAt: '2026-01-10',
      amountTotalCents: 15000,
      feeCents: 600,
      processorRef: 'ch_fam1',
      refundsTransactionId: null,
      householdId: 'household-1',
      payerName: null,
      payerEmail: null,
      memo: null,
      lines: [{ item: 'dues', description: 'Membership dues', amountCents: 15000, membershipId: 'membership-1', enrollmentId: null, assignmentId: null }],
      refundLinkKey: null,
      itemsText: 'family membership - renewal',
      transactionType: 'Membership',
      accountId: 'acct-1',
    };
    const statements = buildTransactionInsertStatements(t);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('INSERT INTO transactions');
    expect(statements[0]).toContain("'txn-1'");
    expect(statements[1]).toContain('INSERT INTO transaction_lines');
    expect(statements[1]).toContain("'membership-1'");
  });
});

describe('formatReport', () => {
  it('never includes a payer name or email, only account ids and counts', () => {
    const rows = loadRows();
    const plan = planMwLedgerImport(rows, existingState());
    const report = formatReport(plan);
    expect(report).not.toContain('Unknown Household');
    expect(report).toContain('acct-unknown');
  });
});
