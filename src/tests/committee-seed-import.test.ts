import { describe, expect, it } from 'vitest';
import {
  MEMBERSHIP_EVENTS_NAME,
  SEED_CHAIRS,
  SEED_COMMITTEES,
  SEED_OFFICERS,
  directorEntriesFromResolutions,
  matchMemberByName,
  planCommitteeInserts,
  planCommitteeMemberSeed,
  planPositionSeed,
  slugify,
} from '../../scripts/import/committee-seed.mjs';

describe('slugify', () => {
  it('kebab-cases a plain committee name', () => {
    expect(slugify('Finance Committee')).toBe('finance-committee');
  });

  it('collapses non-alphanumeric runs, including "&", to one hyphen', () => {
    expect(slugify('Membership & Events')).toBe('membership-events');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  Site Committee  ')).toBe('site-committee');
  });
});

describe('SEED_COMMITTEES', () => {
  it('seeds exactly the seven committees from the published page, in At-a-Glance order', () => {
    expect(SEED_COMMITTEES.map((c) => c.name)).toEqual([
      'Finance Committee',
      'Board Development Committee',
      'Program Committee',
      MEMBERSHIP_EVENTS_NAME,
      'Site Committee',
      'Harbor Committee',
      'Fleet Committee',
    ]);
  });

  it('marks Finance and Board Development standing, the rest established', () => {
    const kindByName = new Map(SEED_COMMITTEES.map((c) => [c.name, c.kind]));
    expect(kindByName.get('Finance Committee')).toBe('standing');
    expect(kindByName.get('Board Development Committee')).toBe('standing');
    expect(kindByName.get('Program Committee')).toBe('established');
    expect(kindByName.get(MEMBERSHIP_EVENTS_NAME)).toBe('established');
    expect(kindByName.get('Site Committee')).toBe('established');
    expect(kindByName.get('Harbor Committee')).toBe('established');
    expect(kindByName.get('Fleet Committee')).toBe('established');
  });

  it('numbers sort_order 1-7 following the published table order', () => {
    expect(SEED_COMMITTEES.map((c) => c.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('never includes a "(chaired by ...)" parenthetical or a chair name in a description', () => {
    for (const committee of SEED_COMMITTEES) {
      expect(committee.description).not.toMatch(/\(chaired by/i);
      expect(committee.description).not.toMatch(/Matt Flickinger|Geoff Wright|Christopher Cryan|Jonathan Ramirez|Emily Ramirez|TL Stanbro|Steve Ryan/);
    }
  });

  it('derives each slug from its own name', () => {
    for (const committee of SEED_COMMITTEES) {
      expect(committee.slug).toBe(slugify(committee.name));
    }
  });
});

describe('SEED_OFFICERS and SEED_CHAIRS', () => {
  it('lists the four officers in Commodore/Vice Commodore/Secretary/Treasurer order', () => {
    expect(SEED_OFFICERS.map((o) => `${o.title}: ${o.name}`)).toEqual([
      'Commodore: Nancy Black',
      'Vice Commodore: David Johnson',
      'Secretary: Angie Oberlitner',
      'Treasurer: Matthew Flickinger',
    ]);
  });

  it('gives the Membership & Events committee both a chair and a co-chair', () => {
    const rows = SEED_CHAIRS.filter((c) => c.committeeName === MEMBERSHIP_EVENTS_NAME);
    expect(rows).toEqual([
      { committeeName: MEMBERSHIP_EVENTS_NAME, memberName: 'Jonathan Ramirez', role: 'chair' },
      { committeeName: MEMBERSHIP_EVENTS_NAME, memberName: 'Emily Ramirez', role: 'co-chair' },
    ]);
  });

  it('gives every other committee exactly one chair', () => {
    const others = SEED_CHAIRS.filter((c) => c.committeeName !== MEMBERSHIP_EVENTS_NAME);
    const byCommittee = new Map<string, number>();
    for (const c of others) byCommittee.set(c.committeeName, (byCommittee.get(c.committeeName) ?? 0) + 1);
    expect([...byCommittee.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(others.every((c) => c.role === 'chair')).toBe(true);
  });
});

describe('matchMemberByName', () => {
  const members = [
    { id: 'm-1', name: 'Nancy Black' },
    { id: 'm-2', name: 'nancy black' },
    { id: 'm-3', name: 'Geoff Wright' },
  ];

  it('matches exactly, case-insensitively', () => {
    expect(matchMemberByName('NANCY BLACK', [{ id: 'm-3', name: 'Geoff Wright' }, { id: 'm-1', name: 'Nancy Black' }])).toEqual({
      status: 'matched',
      member: { id: 'm-1', name: 'Nancy Black' },
    });
  });

  it('reports a miss for a name matching nobody', () => {
    expect(matchMemberByName('Dave Johnson', members)).toEqual({ status: 'missed' });
  });

  it('reports an ambiguity, with every candidate, when more than one member shares a name', () => {
    const result = matchMemberByName('Nancy Black', members);
    expect(result).toEqual({
      status: 'ambiguous',
      candidates: [
        { id: 'm-1', name: 'Nancy Black' },
        { id: 'm-2', name: 'nancy black' },
      ],
    });
  });

  it('never fuzzy-matches an initialism or word-order variant (e.g. "TL Stanbro" vs. "Stanbro TL")', () => {
    expect(matchMemberByName('TL Stanbro', [{ id: 'm-4', name: 'Stanbro TL' }])).toEqual({ status: 'missed' });
  });
});

describe('planCommitteeInserts', () => {
  const seed = [
    { slug: 'finance-committee', name: 'Finance Committee', description: 'd', kind: 'standing' as const, sort_order: 1 },
    { slug: 'site-committee', name: 'Site Committee', description: 'd', kind: 'established' as const, sort_order: 5 },
  ];

  it('inserts every committee whose slug is not already present', () => {
    const plan = planCommitteeInserts(seed, new Set());
    expect(plan.insert.map((c) => c.slug)).toEqual(['finance-committee', 'site-committee']);
    expect(plan.skip).toEqual([]);
  });

  it('skips a committee whose slug already exists, converging to a no-op on a re-run', () => {
    const plan = planCommitteeInserts(seed, new Set(['finance-committee']));
    expect(plan.insert.map((c) => c.slug)).toEqual(['site-committee']);
    expect(plan.skip.map((c) => c.slug)).toEqual(['finance-committee']);
  });
});

describe('planPositionSeed', () => {
  const members = [
    { id: 'm-nancy', name: 'Nancy Black' },
    { id: 'm-geoff', name: 'Geoff Wright' },
    { id: 'm-dup-a', name: 'Pat Lee' },
    { id: 'm-dup-b', name: 'Pat Lee' },
  ];
  const entries = [
    { name: 'Nancy Black', title: 'Commodore', kind: 'officer' as const, sort_order: 1 },
    { name: 'Dave Johnson', title: 'Vice Commodore', kind: 'officer' as const, sort_order: 2 },
    { name: 'Pat Lee', title: 'Director', kind: 'director' as const, sort_order: 5 },
  ];

  it('resolves a matched entry to its member id', () => {
    const plan = planPositionSeed(entries, members, new Set());
    expect(plan.insert).toEqual([{ member_id: 'm-nancy', memberName: 'Nancy Black', kind: 'officer', title: 'Commodore', sort_order: 1 }]);
  });

  it('reports a missed name with its reason', () => {
    const plan = planPositionSeed(entries, members, new Set());
    expect(plan.miss).toContainEqual({ memberName: 'Dave Johnson', title: 'Vice Commodore', reason: 'missed', candidates: undefined });
  });

  it('reports an ambiguous name with every candidate, never guessing one', () => {
    const plan = planPositionSeed(entries, members, new Set());
    expect(plan.miss).toContainEqual({
      memberName: 'Pat Lee',
      title: 'Director',
      reason: 'ambiguous',
      candidates: [
        { id: 'm-dup-a', name: 'Pat Lee' },
        { id: 'm-dup-b', name: 'Pat Lee' },
      ],
    });
  });

  it('skips a (member_id, title) pair already present, converging to a no-op on a re-run', () => {
    const plan = planPositionSeed(entries, members, new Set(['m-nancy|Commodore']));
    expect(plan.insert).toEqual([]);
    expect(plan.skip).toEqual([{ member_id: 'm-nancy', memberName: 'Nancy Black', kind: 'officer', title: 'Commodore', sort_order: 1 }]);
  });
});

describe('planCommitteeMemberSeed', () => {
  const members = [
    { id: 'm-matt', name: 'Matt Flickinger' },
    { id: 'm-jon', name: 'Jonathan Ramirez' },
  ];
  const committeeIdByName = new Map([['Finance Committee', 'c-finance']]);
  const entries = [
    { committeeName: 'Finance Committee', memberName: 'Matt Flickinger', role: 'chair' as const },
    { committeeName: 'Harbor Committee', memberName: 'TL Stanbro', role: 'chair' as const },
    { committeeName: 'Program Committee', memberName: 'Jonathan Ramirez', role: 'chair' as const },
  ];

  it('resolves a matched name and a known committee to a committee_members row', () => {
    const plan = planCommitteeMemberSeed(entries, members, committeeIdByName, new Set());
    expect(plan.insert).toContainEqual({
      committee_id: 'c-finance',
      committeeName: 'Finance Committee',
      member_id: 'm-matt',
      memberName: 'Matt Flickinger',
      role: 'chair',
    });
  });

  it('reports a missed member name', () => {
    const plan = planCommitteeMemberSeed(entries, members, committeeIdByName, new Set());
    expect(plan.miss).toContainEqual({ memberName: 'TL Stanbro', committeeName: 'Harbor Committee', reason: 'missed', candidates: undefined });
  });

  it('reports a missing-committee reason when the committee id cannot be resolved', () => {
    const plan = planCommitteeMemberSeed(entries, members, committeeIdByName, new Set());
    expect(plan.miss).toContainEqual({ memberName: 'Jonathan Ramirez', committeeName: 'Program Committee', reason: 'missing-committee' });
  });

  it('skips a (committee_id, member_id) pair already present, converging to a no-op on a re-run', () => {
    const plan = planCommitteeMemberSeed(entries, members, committeeIdByName, new Set(['c-finance|m-matt']));
    expect(plan.insert.find((r) => r.memberName === 'Matt Flickinger')).toBeUndefined();
    expect(plan.skip).toContainEqual({
      committee_id: 'c-finance',
      committeeName: 'Finance Committee',
      member_id: 'm-matt',
      memberName: 'Matt Flickinger',
      role: 'chair',
    });
  });
});

describe('directorEntriesFromResolutions', () => {
  it('returns an empty list when the resolutions file has no directors', () => {
    expect(directorEntriesFromResolutions({ directors: [] })).toEqual([]);
    expect(directorEntriesFromResolutions({})).toEqual([]);
  });

  it('turns each name into a director position entry, sort_order continuing after the four officers', () => {
    const entries = directorEntriesFromResolutions({ directors: ['Alex Rivera', 'Sam Choi'] });
    expect(entries).toEqual([
      { name: 'Alex Rivera', title: 'Director', kind: 'director', sort_order: 5 },
      { name: 'Sam Choi', title: 'Director', kind: 'director', sort_order: 6 },
    ]);
  });
});
