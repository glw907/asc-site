import { describe, expect, it } from 'vitest';
import { keptOnFor, nameHintOwner, normalizeModel, planBoatSeed, resolveOwner } from '../../scripts/import/boat-seed.mjs';

describe('normalizeModel', () => {
  it('normalizes every Buccaneer spelling to the picker value', () => {
    expect(normalizeModel('BUCC')).toBe('Buccaneer 18');
    expect(normalizeModel('Blue Bucc')).toBe('Buccaneer 18');
    expect(normalizeModel('Purple Buccaneer 18 "Dionysus"')).toBe('Buccaneer 18');
    expect(normalizeModel('BUCC 2')).toBe('Buccaneer 18');
  });

  it('normalizes Laser, including casual "LASER II", to the picker value', () => {
    expect(normalizeModel('Yellow laser')).toBe('Laser');
    expect(normalizeModel('LASER II')).toBe('Laser');
    expect(normalizeModel('Laser Spirit of 76')).toBe('Laser');
  });

  it('falls back to the raw trimmed text as the free-typed model', () => {
    expect(normalizeModel('HOBI')).toBe('HOBI');
    expect(normalizeModel('DINGY')).toBe('DINGY');
    expect(normalizeModel('  sailboat  ')).toBe('sailboat');
  });

  it('returns null for an empty, whitespace-only, or missing description (a skip)', () => {
    expect(normalizeModel('')).toBeNull();
    expect(normalizeModel('   ')).toBeNull();
    expect(normalizeModel(null)).toBeNull();
    expect(normalizeModel(undefined)).toBeNull();
  });
});

describe('keptOnFor', () => {
  it('keeps a mooring assignment on the mooring', () => {
    expect(keptOnFor('mooring')).toBe('mooring');
  });

  it('keeps every other boat asset type on a trailer', () => {
    expect(keptOnFor('boat_parking')).toBe('trailer');
    expect(keptOnFor('small_boat')).toBe('trailer');
  });
});

describe('nameHintOwner', () => {
  const household = [
    { id: 'm-nancy', name: 'Nancy Black' },
    { id: 'm-darren', name: 'Darren Black' },
    { id: 'm-gabe', name: 'Gabe Black' },
    { id: 'm-jake', name: 'Jake Black' },
  ];

  it('matches a household member whose first name is a whole-word token in the description', () => {
    expect(nameHintOwner('BUCC Gabe', household)).toEqual({ id: 'm-gabe', name: 'Gabe Black' });
  });

  it('returns null when no household first name appears in the description', () => {
    expect(nameHintOwner('BUCC 2', household)).toBeNull();
  });

  it('does not false-match a first name that is only a substring of another word', () => {
    // "Jake" should not match inside "Jaker" or similar; whole-word boundary only.
    expect(nameHintOwner('Jakerson boat', household)).toBeNull();
  });

  it('returns null for an empty or missing description', () => {
    expect(nameHintOwner('', household)).toBeNull();
    expect(nameHintOwner(null, household)).toBeNull();
  });
});

describe('resolveOwner', () => {
  const membersByHousehold = new Map([
    ['hh-solo', [{ id: 'm-solo', name: 'Solo Sailor' }]],
    [
      'hh-multi',
      [
        { id: 'm-nancy', name: 'Nancy Black' },
        { id: 'm-gabe', name: 'Gabe Black' },
      ],
    ],
  ]);

  it('resolves a solo household automatically', () => {
    const owner = resolveOwner('a-1', 'hh-solo', membersByHousehold, {}, 'BUCC');
    expect(owner).toEqual({ memberId: 'm-solo', basis: 'solo' });
  });

  it('resolves a multi-member household from the resolutions file', () => {
    const resolutions = { owners: { 'a-2': 'm-gabe' } };
    const owner = resolveOwner('a-2', 'hh-multi', membersByHousehold, resolutions, 'BUCC Gabe');
    expect(owner).toEqual({ memberId: 'm-gabe', basis: 'resolved' });
  });

  it('holds a multi-member household with no resolution, reporting candidates and the name-hint suggestion', () => {
    const owner = resolveOwner('a-3', 'hh-multi', membersByHousehold, {}, 'BUCC Gabe');
    expect(owner).toEqual({
      memberId: null,
      basis: 'ambiguous',
      candidates: [
        { id: 'm-nancy', name: 'Nancy Black' },
        { id: 'm-gabe', name: 'Gabe Black' },
      ],
      suggestion: { id: 'm-gabe', name: 'Gabe Black' },
    });
  });

  it('holds with a null suggestion when no household first name matches', () => {
    const owner = resolveOwner('a-4', 'hh-multi', membersByHousehold, {}, 'BUCC 2');
    expect(owner).toMatchObject({ basis: 'ambiguous', suggestion: null });
  });

  it('ignores a resolutions.owners entry naming a member id outside the household', () => {
    const resolutions = { owners: { 'a-5': 'm-outsider' } };
    const owner = resolveOwner('a-5', 'hh-multi', membersByHousehold, resolutions, 'BUCC');
    expect(owner.basis).toBe('ambiguous');
  });
});

describe('planBoatSeed (synthetic fixture)', () => {
  const membersByHousehold = new Map([
    ['hh-solo', [{ id: 'm-solo', name: 'Solo Sailor' }]],
    [
      'hh-multi',
      [
        { id: 'm-nancy', name: 'Nancy Black' },
        { id: 'm-gabe', name: 'Gabe Black' },
      ],
    ],
  ]);

  const assignments = [
    // solo household, Buccaneer -> seed
    { id: 'ops-assignment-1', asset_type: 'boat_parking', description: 'BUCC', household_id: 'hh-solo' },
    // multi household, no resolution -> held
    { id: 'ops-assignment-2', asset_type: 'boat_parking', description: 'BUCC Gabe', household_id: 'hh-multi' },
    // multi household, resolved via file -> seed
    { id: 'ops-assignment-3', asset_type: 'mooring', description: 'Yellow laser', household_id: 'hh-multi' },
    // solo household, empty description -> skipped
    { id: 'ops-assignment-4', asset_type: 'small_boat', description: '  ', household_id: 'hh-solo' },
    // solo household, dropped by review -> dropped
    { id: 'ops-assignment-5', asset_type: 'boat_parking', description: 'BUCC', household_id: 'hh-solo' },
    // solo household, model override -> seed with overridden model
    { id: 'ops-assignment-6', asset_type: 'boat_parking', description: 'HOBI', household_id: 'hh-solo' },
  ];

  const resolutions = {
    owners: { 'ops-assignment-3': 'm-gabe' },
    drop: ['ops-assignment-5'],
    model: { 'ops-assignment-6': 'Hobie Cat' },
  };

  it('buckets each assignment into exactly one of seed/held/dropped/skipped', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    expect(plan.seed.map((r) => r.sourceAssignmentId)).toEqual(['ops-assignment-1', 'ops-assignment-3', 'ops-assignment-6']);
    expect(plan.held.map((r) => r.sourceAssignmentId)).toEqual(['ops-assignment-2']);
    expect(plan.dropped.map((r) => r.sourceAssignmentId)).toEqual(['ops-assignment-5']);
    expect(plan.skipped.map((r) => r.sourceAssignmentId)).toEqual(['ops-assignment-4']);
  });

  it('follows the locked boat id scheme (boat-<assignment id>)', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    expect(plan.seed.map((r) => r.id)).toEqual(['boat-ops-assignment-1', 'boat-ops-assignment-3', 'boat-ops-assignment-6']);
  });

  it('always seeds name=null and sail_number=null', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    for (const row of plan.seed) {
      expect(row.name).toBeNull();
      expect(row.sail_number).toBeNull();
    }
  });

  it('sets kept_on from the source asset type', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    const moored = plan.seed.find((r) => r.sourceAssignmentId === 'ops-assignment-3');
    expect(moored?.kept_on).toBe('mooring');
    const trailered = plan.seed.find((r) => r.sourceAssignmentId === 'ops-assignment-1');
    expect(trailered?.kept_on).toBe('trailer');
  });

  it('applies a resolutions.model override in place of the parsed model', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    const overridden = plan.seed.find((r) => r.sourceAssignmentId === 'ops-assignment-6');
    expect(overridden).toMatchObject({ model: 'Hobie Cat' });
  });

  it('carries the owner basis and the household onto a held row', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    expect(plan.held[0]).toMatchObject({
      householdId: 'hh-multi',
      model: 'Buccaneer 18',
      suggestion: { id: 'm-gabe', name: 'Gabe Black' },
    });
  });

  it('resolves a resolved-from-file owner with basis "resolved"', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    const resolved = plan.seed.find((r) => r.sourceAssignmentId === 'ops-assignment-3');
    expect(resolved).toMatchObject({ member_id: 'm-gabe', ownerBasis: 'resolved' });
  });

  it('resolves a solo owner with basis "solo"', () => {
    const plan = planBoatSeed(assignments, { membersByHousehold, resolutions });
    const solo = plan.seed.find((r) => r.sourceAssignmentId === 'ops-assignment-1');
    expect(solo).toMatchObject({ member_id: 'm-solo', ownerBasis: 'solo' });
  });
});
