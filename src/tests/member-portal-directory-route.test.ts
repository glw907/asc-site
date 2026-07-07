// /my-account/directory's own `load`: the member-session gate (redirects a signed-out visitor
// the same way every other /my-account/** page does) and the degraded-vs-empty distinction
// (`households` is `null` only when CLUB_DB itself is unavailable).
import { describe, expect, it } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import type { Redirect } from '@sveltejs/kit';
import { load } from '../routes/(site)/my-account/directory/+page.server';
import { fakeD1 } from './_fake-d1';
import type { MemberRow } from '$member-auth/lib/store';

type LoadEvent = Parameters<typeof load>[0];
type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

const MEMBER: MemberRow = { id: 'mem-1', householdId: 'hh-1', name: 'Vera Visible', email: 'vera@example.com', archivedAt: null };

function eventFor(member: MemberRow | null, db: unknown): LoadEvent {
  return {
    parent: async () => ({ member }),
    platform: { env: db === undefined ? {} : { CLUB_DB: db } },
  } as unknown as LoadEvent;
}

async function catchThrown(value: unknown): Promise<unknown> {
  try {
    return await value;
  } catch (err) {
    return err;
  }
}

describe('/my-account/directory load', () => {
  it('redirects a signed-out visitor to /my-account', async () => {
    const caught = await catchThrown(load(eventFor(null, undefined)));
    expect(isRedirect(caught)).toBe(true);
    expect((caught as Redirect).location).toBe('/my-account');
  });

  it('returns households: null when CLUB_DB is not bound (the degraded state)', async () => {
    const result = (await load(eventFor(MEMBER, undefined))) as LoadResult;
    expect(result.households).toBeNull();
  });

  it('returns an empty list when no member is currently listed (the empty state)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM members m': [] } });
    const result = (await load(eventFor(MEMBER, db))) as LoadResult;
    expect(result.households).toEqual([]);
  });

  it('returns the directory for a signed-in member', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM members m': [
          {
            household_id: 'hh-1',
            household_name: 'The Scratches',
            household_city: 'Anchorage',
            member_id: 'mem-1',
            member_name: 'Vera Visible',
            email: 'vera@example.com',
            phone: '+19075550100',
            directory_visibility: 'visible',
          },
        ],
      },
    });
    const result = (await load(eventFor(MEMBER, db))) as LoadResult;
    expect(result.households).toHaveLength(1);
    expect(result.households![0].members[0].name).toBe('Vera Visible');
  });
});
