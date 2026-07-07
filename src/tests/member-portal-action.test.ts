import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { portalAction } from '$member-portal/lib/portal-action';

const MEMBER_ROW = { id: 'mem-1', household_id: 'hh-1', name: 'Scratch Member', email: 'scratch@example.com', archived_at: null };

function fakeEvent(opts: { csrfCookie?: string; csrfField?: string; sessionCookie?: string; db?: ReturnType<typeof fakeD1>['db'] }) {
  const form = new FormData();
  if (opts.csrfField !== undefined) form.append('csrf', opts.csrfField);
  const cookies: Record<string, string> = {};
  if (opts.csrfCookie) cookies['asc-member-csrf'] = opts.csrfCookie;
  if (opts.sessionCookie) cookies['asc-member'] = opts.sessionCookie;
  return {
    url: new URL('http://localhost/my-account'),
    request: { clone: () => ({ formData: async () => form }) } as unknown as Request,
    cookies: { get: (name: string) => cookies[name], set: () => {} },
    platform: { env: opts.db ? { CLUB_DB: opts.db } : {} },
  };
}

describe('portalAction', () => {
  it('refuses (403) a missing or mismatched CSRF token before touching the database', async () => {
    const handler = portalAction(async () => ({ ranHandler: true }));
    const event = fakeEvent({ csrfCookie: 'cookie-token', csrfField: 'different-token' });
    const result = await handler(event);
    expect(result).toEqual(expect.objectContaining({ status: 403 }));
  });

  it('fails closed (500) when CLUB_DB is not bound', async () => {
    const handler = portalAction(async () => ({ ranHandler: true }));
    const event = fakeEvent({ csrfCookie: 'token', csrfField: 'token' });
    const result = await handler(event);
    expect(result).toEqual(expect.objectContaining({ status: 500 }));
  });

  it('fails closed (401) with no live session', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM member_sessions': null } });
    const handler = portalAction(async () => ({ ranHandler: true }));
    const event = fakeEvent({ csrfCookie: 'token', csrfField: 'token', sessionCookie: 'sess-1', db });
    const result = await handler(event);
    expect(result).toEqual(expect.objectContaining({ status: 401 }));
  });

  it('resolves isPrimary against the household\'s own primary_member_id, then runs the handler', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-1' },
      },
    });
    const handler = portalAction(async ({ ctx }) => ({ member: ctx.member.id, isPrimary: ctx.isPrimary }));
    const event = fakeEvent({ csrfCookie: 'token', csrfField: 'token', sessionCookie: 'sess-1', db });
    const result = await handler(event);
    expect(result).toEqual({ member: 'mem-1', isPrimary: true });
  });

  it('resolves isPrimary false for a non-primary household member', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions': MEMBER_ROW,
        'FROM households WHERE id': { primary_member_id: 'mem-someone-else' },
      },
    });
    const handler = portalAction(async ({ ctx }) => ({ isPrimary: ctx.isPrimary }));
    const event = fakeEvent({ csrfCookie: 'token', csrfField: 'token', sessionCookie: 'sess-1', db });
    const result = await handler(event);
    expect(result).toEqual({ isPrimary: false });
  });
});
