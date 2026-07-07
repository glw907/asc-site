import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEASON,
  getHousehold,
  getHouseholdMembers,
  getMember,
  getMembershipsForMember,
  getPaymentForMembership,
  households,
  memberships,
  members,
  payments,
  standingForMember,
} from '$admin-club/lib/demo-members';

describe('demo-members schema integrity', () => {
  it('gives every member a real household', () => {
    for (const member of members) {
      expect(getHousehold(member.householdId), `${member.name} has no household`).toBeDefined();
    }
  });

  it('gives every membership a real member', () => {
    for (const membership of memberships) {
      expect(getMember(membership.memberId), `${membership.id} has no member`).toBeDefined();
    }
  });

  it('gives every payment a real membership', () => {
    const membershipIds = new Set(memberships.map((m) => m.id));
    for (const payment of payments) {
      expect(membershipIds.has(payment.membershipId), `${payment.id} has no membership`).toBe(true);
    }
  });

  it('has at least one multi-member household', () => {
    const sizes = households.map((h) => getHouseholdMembers(h.id).length);
    expect(Math.max(...sizes)).toBeGreaterThan(2);
  });

  it('covers all three directory-visibility values', () => {
    const values = new Set(members.map((m) => m.directoryVisibility));
    expect(values).toEqual(new Set(['visible', 'partial', 'hidden']));
  });
});

describe('standingForMember', () => {
  it('reads current for a paid current-season membership', () => {
    expect(standingForMember('mem-erik-larsen')).toBe('current');
  });

  it('reads pending for an invoiced-but-unpaid current-season membership', () => {
    expect(standingForMember('mem-nikolai-petrov')).toBe('pending');
    expect(standingForMember('mem-bjorn-halvorsen')).toBe('pending');
  });

  it('reads lapsed when there is no current-season membership row at all', () => {
    expect(standingForMember('mem-ada-okonkwo')).toBe('lapsed');
  });

  it('covers all three standings across the demo roster', () => {
    const standings = new Set(members.map((m) => standingForMember(m.id)));
    expect(standings).toEqual(new Set(['current', 'pending', 'lapsed']));
  });
});

describe('getMembershipsForMember', () => {
  it('sorts most-recent season first', () => {
    const seasons = getMembershipsForMember('mem-erik-larsen').map((m) => m.season);
    expect(seasons).toEqual([...seasons].sort((a, b) => b - a));
    expect(seasons[0]).toBe(CURRENT_SEASON);
  });
});

describe('getPaymentForMembership', () => {
  it('finds the payment for a real membership', () => {
    const [membership] = getMembershipsForMember('mem-erik-larsen');
    expect(getPaymentForMembership(membership.id)?.status).toBe('paid');
  });

  it('returns undefined for a bad membership id', () => {
    expect(getPaymentForMembership('ms-does-not-exist')).toBeUndefined();
  });
});
