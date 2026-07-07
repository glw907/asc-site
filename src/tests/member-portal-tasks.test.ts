import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { buildTaskList } from '$member-portal/lib/tasks';
import type { MemberStanding } from '$member-auth/lib/standing';
import type { HouseholdRequestRow } from '$member-portal/lib/assets';

function standing(overrides: Partial<MemberStanding>): MemberStanding {
  return {
    memberId: 'mem-1',
    memberName: 'Scratch Member',
    householdId: 'hh-1',
    householdName: 'The Scratches',
    status: 'current',
    tier: 'individual',
    season: 2026,
    expiresOn: '2027-06-01 00:00:00',
    graceEndsOn: '2027-07-01 00:00:00',
    statusLine: 'Current through June 1, 2027',
    ...overrides,
  };
}

describe('buildTaskList', () => {
  const NOW = new Date('2026-07-07T00:00:00Z');
  beforeEach(() => vi.useFakeTimers().setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it('is empty (not a placeholder) when nothing needs doing', () => {
    expect(buildTaskList({ standing: standing({ expiresOn: '2027-12-01 00:00:00' }), creditBalance: 0, assetRequests: [] })).toEqual([]);
  });

  it('includes a renew task in grace or lapsed standing', () => {
    expect(buildTaskList({ standing: standing({ status: 'grace' }), creditBalance: 0, assetRequests: [] })).toEqual([
      { id: 'renew', label: 'Renew your membership', href: '/my-account#renew' },
    ]);
    expect(buildTaskList({ standing: standing({ status: 'lapsed' }), creditBalance: 0, assetRequests: [] })).toEqual([
      { id: 'renew', label: 'Renew your membership', href: '/my-account#renew' },
    ]);
  });

  it('includes a renew task when current but within the renewal window', () => {
    expect(buildTaskList({ standing: standing({ status: 'current', expiresOn: '2026-07-20 00:00:00' }), creditBalance: 0, assetRequests: [] })).toEqual([
      { id: 'renew', label: 'Renew before your membership lapses', href: '/my-account#renew' },
    ]);
  });

  it('omits renew when current and well outside the window', () => {
    expect(buildTaskList({ standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }), creditBalance: 0, assetRequests: [] })).toEqual([]);
  });

  it('includes a use-credit task, singular vs plural phrasing', () => {
    expect(buildTaskList({ standing: null, creditBalance: 1, assetRequests: [] })).toEqual([
      { id: 'use-credit', label: 'Use your class credit', href: '/my-account/classes' },
    ]);
    expect(buildTaskList({ standing: null, creditBalance: 2, assetRequests: [] })).toEqual([
      { id: 'use-credit', label: 'Use your 2 class credits', href: '/my-account/classes' },
    ]);
  });

  it('includes one pay task per approved-awaiting-payment asset request, ignoring other stages', () => {
    const requests: HouseholdRequestRow[] = [
      { id: 'req-1', assetType: 'mooring', assetTypeName: 'Mooring', kind: 'retention', status: 'approved_awaiting_payment', note: null, denyReason: null, fee: 300, createdAt: '2026-01-01' },
      { id: 'req-2', assetType: 'rv-parking', assetTypeName: 'RV Parking', kind: 'new', status: 'pending', note: null, denyReason: null, fee: 150, createdAt: '2026-01-01' },
    ];
    expect(buildTaskList({ standing: null, creditBalance: 0, assetRequests: requests })).toEqual([
      { id: 'pay-req-1', label: 'Pay for your mooring — $300', href: '/my-account#assets' },
    ]);
  });

  it('orders renew, then credit, then pay tasks', () => {
    const tasks = buildTaskList({
      standing: standing({ status: 'lapsed' }),
      creditBalance: 1,
      assetRequests: [{ id: 'req-1', assetType: 'mooring', assetTypeName: 'Mooring', kind: 'retention', status: 'approved_awaiting_payment', note: null, denyReason: null, fee: 300, createdAt: '2026-01-01' }],
    });
    expect(tasks.map((t) => t.id)).toEqual(['renew', 'use-credit', 'pay-req-1']);
  });
});
