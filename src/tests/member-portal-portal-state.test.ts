import { describe, expect, it } from 'vitest';
import { portalState, valueMirror, RENEWAL_WINDOW_DAYS } from '$member-portal/lib/portal-state';
import type { MemberStanding } from '$member-auth/lib/standing';
import type { HouseholdMemberRow } from '$member-portal/lib/household';
import type { HouseholdAssignmentRow } from '$member-portal/lib/assets';

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

describe('portalState', () => {
  const TODAY = new Date('2026-07-07T00:00:00Z');

  it('rules a null standing renewal-window (no membership on file)', () => {
    expect(
      portalState({ standing: null, seasonHasLiveEvents: true, classRegistrationOpens: '', hasWeightedActionRows: true, today: TODAY }),
    ).toEqual({ kind: 'renewal-window', standingStatus: null });
  });

  it('rules grace standing renewal-window regardless of expiry date', () => {
    expect(
      portalState({
        standing: standing({ status: 'grace', expiresOn: '2027-12-01 00:00:00' }),
        seasonHasLiveEvents: true,
        classRegistrationOpens: '',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'renewal-window', standingStatus: 'grace' });
  });

  it('rules lapsed standing renewal-window regardless of expiry date', () => {
    expect(
      portalState({
        standing: standing({ status: 'lapsed', expiresOn: '2027-12-01 00:00:00' }),
        seasonHasLiveEvents: true,
        classRegistrationOpens: '',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'renewal-window', standingStatus: 'lapsed' });
  });

  it('rules current standing renewal-window on the expiry day itself', () => {
    const expiresOn = '2026-07-07 00:00:00';
    expect(
      portalState({ standing: standing({ status: 'current', expiresOn }), seasonHasLiveEvents: true, classRegistrationOpens: '', hasWeightedActionRows: false, today: TODAY }),
    ).toEqual({ kind: 'renewal-window', standingStatus: 'current' });
  });

  it(`rules current standing renewal-window at exactly ${RENEWAL_WINDOW_DAYS} days out (inclusive boundary)`, () => {
    const expiresOn = '2026-09-05 00:00:00'; // 60 days after 2026-07-07
    expect(
      portalState({ standing: standing({ status: 'current', expiresOn }), seasonHasLiveEvents: true, classRegistrationOpens: '', hasWeightedActionRows: false, today: TODAY }),
    ).toEqual({ kind: 'renewal-window', standingStatus: 'current' });
  });

  it(`rules current standing NOT renewal-window at ${RENEWAL_WINDOW_DAYS + 1} days out`, () => {
    const expiresOn = '2026-09-06 00:00:00'; // 61 days after 2026-07-07
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn }),
        seasonHasLiveEvents: true,
        classRegistrationOpens: '',
        hasWeightedActionRows: true,
        today: TODAY,
      }),
    ).toEqual({ kind: 'in-season-needs-you' });
  });

  it('rules off-season when no live season events remain, even with a real action row pending', () => {
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: false,
        classRegistrationOpens: '2027-03-15',
        hasWeightedActionRows: true,
        today: TODAY,
      }),
    ).toEqual({ kind: 'off-season', classRegistrationOpens: '2027-03-15' });
  });

  it('treats a class_registration_opens date already in the past as unscheduled, never a stale future promise', () => {
    // Nothing clears `class_registration_opens` across a season rollover (`rollover.ts`'s own
    // header), so a value left over from last season -- 2026-03-01, read on 2026-12-15 -- is the
    // natural steady state, not a contrived input.
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: false,
        classRegistrationOpens: '2026-03-01',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'off-season', classRegistrationOpens: '' });
  });

  it('carries a class_registration_opens date still ahead of today through unchanged', () => {
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: false,
        classRegistrationOpens: '2026-07-07',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'off-season', classRegistrationOpens: '2026-07-07' });
  });

  it('carries the empty-gate class_registration_opens value through unchanged', () => {
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: false,
        classRegistrationOpens: '',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'off-season', classRegistrationOpens: '' });
  });

  it('rules in-season-needs-you when in season, well outside the renewal window, with a real action row', () => {
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: true,
        classRegistrationOpens: '',
        hasWeightedActionRows: true,
        today: TODAY,
      }),
    ).toEqual({ kind: 'in-season-needs-you' });
  });

  it('rules in-season-clear when in season, outside the renewal window, with no real action row', () => {
    expect(
      portalState({
        standing: standing({ status: 'current', expiresOn: '2027-06-01 00:00:00' }),
        seasonHasLiveEvents: true,
        classRegistrationOpens: '',
        hasWeightedActionRows: false,
        today: TODAY,
      }),
    ).toEqual({ kind: 'in-season-clear' });
  });

  it('defaults today to the current clock when omitted', () => {
    const result = portalState({
      standing: standing({ status: 'current', expiresOn: '2099-01-01 00:00:00' }),
      seasonHasLiveEvents: true,
      classRegistrationOpens: '',
      hasWeightedActionRows: false,
    });
    expect(result.kind).toBe('in-season-clear');
  });
});

function member(overrides: Partial<HouseholdMemberRow>): HouseholdMemberRow {
  return {
    id: 'mem-1',
    name: 'Scratch Member',
    email: 'scratch@example.com',
    phone: null,
    birthdate: null,
    directoryVisibility: 'visible',
    isPrimary: true,
    archivedAt: null,
    ...overrides,
  };
}

function assignment(overrides: Partial<HouseholdAssignmentRow>): HouseholdAssignmentRow {
  return {
    id: 'aa-1',
    assetType: 'mooring',
    assetTypeName: 'Mooring',
    description: null,
    paymentStanding: 'paid',
    feeCents: null,
    ...overrides,
  };
}

describe('valueMirror', () => {
  it('renders every segment, in order, when all three have something to say', () => {
    expect(
      valueMirror({
        householdMembers: [member({ id: 'a' }), member({ id: 'b', archivedAt: null })],
        assets: [assignment({ description: 'B-Dock 12' })],
        creditBalance: 1,
      }),
    ).toEqual(['Mooring', '2 household members', '1 class credit available']);
  });

  // The regression this guards, verified against all 40 live assignments 2026-07-16: `description`
  // is free text about the member's own boat, never a slot identifier, so concatenating it onto the
  // type name renders "Mooring Sailboat" and 'Trailered Boat Parking Purple Buccaneer 18 "Dionysus"'
  // into the calm recognition line. These are real live values, not invented ones.
  it('never concatenates the free-text description onto the type name', () => {
    expect(
      valueMirror({
        householdMembers: [],
        assets: [
          assignment({ assetTypeName: 'Mooring', description: 'Sailboat' }),
          assignment({ id: 'x', assetTypeName: 'Trailered Boat Parking', description: 'Purple Buccaneer 18 "Dionysus"' }),
        ],
        creditBalance: 0,
      }),
    ).toEqual(['Mooring', 'Trailered Boat Parking']);
  });

  // A household holding two of the same type (two trailered-boat spots) is real: 19 of the 40 live
  // assignments are Trailered Boat Parking. The mirror is a summary, so the type reads once; the
  // rail's own two-line rows still list every assignment with its description.
  it('names a repeated asset type once', () => {
    expect(
      valueMirror({
        householdMembers: [],
        assets: [
          assignment({ assetTypeName: 'Trailered Boat Parking', description: 'BUCC' }),
          assignment({ id: 'x', assetTypeName: 'Trailered Boat Parking', description: 'DINGY' }),
        ],
        creditBalance: 0,
      }),
    ).toEqual(['Trailered Boat Parking']);
  });

  it('omits the assets segment when the household holds no assets', () => {
    expect(
      valueMirror({
        householdMembers: [member({ id: 'a' })],
        assets: [],
        creditBalance: 2,
      }),
    ).toEqual(['1 household member', '2 class credits available']);
  });

  it('omits the household segment when every member is archived (nothing active to count)', () => {
    expect(
      valueMirror({
        householdMembers: [member({ id: 'a', archivedAt: '2026-01-01 00:00:00' })],
        assets: [assignment({ assetTypeName: 'Locker', description: '14' })],
        creditBalance: 0,
      }),
    ).toEqual(['Locker']);
  });

  it('omits the credits segment when the balance is zero', () => {
    expect(
      valueMirror({
        householdMembers: [member({ id: 'a' })],
        assets: [],
        creditBalance: 0,
      }),
    ).toEqual(['1 household member']);
  });

  it('renders an asset with no description as just its type name', () => {
    expect(
      valueMirror({
        householdMembers: [],
        assets: [assignment({ assetTypeName: 'RV Parking', description: null })],
        creditBalance: 0,
      }),
    ).toEqual(['RV Parking']);
  });

  it('returns an empty array when every segment is empty', () => {
    expect(valueMirror({ householdMembers: [], assets: [], creditBalance: 0 })).toEqual([]);
  });
});
