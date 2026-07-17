// `/my-account/gear`'s own server actions (T2b of the portal redesign pass): `releaseAsset`,
// `cancelRequest`, and `requestAsset` moved here verbatim from `/my-account/+page.server.ts`,
// where they carried no dedicated route-level test of their own (`my-account-actions.test.ts`
// only ever covered `?/requestLink`, `?/renew`, `?/payAssetFee`, `?/payRequest`). This file
// proves the wiring at the new route: CSRF/session gating via `portalAction`, and delegation to
// `$member-portal/lib/assets`'s already-tested pure functions (`member-portal-assets.test.ts`
// owns their own logic; this file only proves the route composes them correctly).
import { describe, expect, it } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import { actions } from '../routes/(site)/my-account/gear/+page.server';
import { fakeD1 } from './_fake-d1';

const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1', name: 'Scratch Member', email: 'scratch@example.com', archived_at: null };

function fakeEvent(form: Record<string, string>, db: unknown) {
  const fd = new FormData();
  fd.append('csrf', 'token');
  for (const [key, value] of Object.entries(form)) fd.append(key, value);
  const cookies: Record<string, string> = { 'asc-member-csrf': 'token', 'asc-member': 'sess-1' };
  return {
    url: new URL('http://localhost/my-account/gear'),
    request: { clone: () => ({ formData: async () => fd }) } as unknown as Request,
    cookies: { get: (name: string) => cookies[name], set: () => {} },
    platform: { env: { CLUB_DB: db } },
  };
}

const SESSION_FIRST_RESULTS = {
  'FROM member_sessions': MEMBER_ROW,
  'FROM households WHERE id': { primary_member_id: 'mem-1' },
};

describe('?/releaseAsset', () => {
  it('refuses a missing assignment id before touching the database', async () => {
    const { db, calls } = fakeD1({ firstResults: SESSION_FIRST_RESULTS });
    const result = await actions.releaseAsset(fakeEvent({}, db) as never);
    expect(isActionFailure(result)).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE asset_assignments'))).toBe(false);
  });

  it('refuses an assignment that is not the household\'s own', async () => {
    const { db } = fakeD1({
      firstResults: { ...SESSION_FIRST_RESULTS, 'FROM asset_assignments aa': null },
    });
    const result = await actions.releaseAsset(fakeEvent({ assignmentId: 'aa-1' }, db) as never);
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
  });

  it('releases the household\'s own assignment', async () => {
    const { db, calls } = fakeD1({
      firstResults: { ...SESSION_FIRST_RESULTS, 'FROM asset_assignments aa': { id: 'aa-1' } },
    });
    const result = await actions.releaseAsset(fakeEvent({ assignmentId: 'aa-1' }, db) as never);
    expect(result).toEqual({ released: true });
    const update = calls.find((c) => c.sql.startsWith("UPDATE asset_assignments SET status = 'released'"));
    expect(update?.args).toEqual(['aa-1']);
  });
});

describe('?/cancelRequest', () => {
  it('refuses a missing request id before touching the database', async () => {
    const { db, calls } = fakeD1({ firstResults: SESSION_FIRST_RESULTS });
    const result = await actions.cancelRequest(fakeEvent({}, db) as never);
    expect(isActionFailure(result)).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('UPDATE asset_requests'))).toBe(false);
  });

  it('refuses a request that has already moved past pending', async () => {
    const { db } = fakeD1({
      firstResults: SESSION_FIRST_RESULTS,
      runResults: { "SET status = 'cancelled'": { changes: 0 } },
    });
    const result = await actions.cancelRequest(fakeEvent({ requestId: 'req-1' }, db) as never);
    expect(result).toEqual(expect.objectContaining({ status: 400 }));
  });

  it('cancels the household\'s own pending request', async () => {
    const { db, calls } = fakeD1({ firstResults: SESSION_FIRST_RESULTS });
    const result = await actions.cancelRequest(fakeEvent({ requestId: 'req-1' }, db) as never);
    expect(result).toEqual({ cancelled: true });
    const update = calls.find((c) => c.sql.startsWith('UPDATE asset_requests'));
    expect(update?.args).toEqual(['mem-1', 'req-1', 'hh-1']);
  });
});

describe('?/requestAsset', () => {
  it('refuses a missing asset type before touching the database', async () => {
    const { db, calls } = fakeD1({ firstResults: SESSION_FIRST_RESULTS });
    const result = await actions.requestAsset(fakeEvent({}, db) as never);
    expect(isActionFailure(result)).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO asset_requests'))).toBe(false);
  });

  it('records a new-kind request for the household', async () => {
    const { db, calls } = fakeD1({ firstResults: SESSION_FIRST_RESULTS });
    const result = await actions.requestAsset(fakeEvent({ assetType: 'mooring', note: 'Slip near the ramp' }, db) as never);
    expect(result).toEqual({ requested: true });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO asset_requests'));
    expect(insert?.args).toEqual([expect.any(String), 'mooring', 'hh-1', 'mem-1', 'new', 'Slip near the ramp']);
  });
});
