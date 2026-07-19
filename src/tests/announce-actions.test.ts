// The Announce screen's routes: the list load's own "already announced" marker, the detail
// load's channel options and re-announce warning data, and the send action's role gate,
// validation, and successful sends (email, Discord, both), each auditing correctly. Mirrors
// `classes-actions.test.ts`'s own `postEvent` fake-request idiom (both wrap `clubAdminAction`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { load as listLoad, type AnnounceListRow } from '../routes/admin/club/announce/+page.server';
import { actions, load as detailLoad } from '../routes/admin/club/announce/[id]/+page.server';
import { deriveAnnouncementSummary, type AnnounceChannelOption } from '$admin-club/lib/announcements';
import { posts, ORIGIN } from '$chassis/content';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// 'Instructor' carries no club role; clubAdminAction's gate now reads `editor.role` directly
// (initiative 5 Task 2), not a `club_roles` row.
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

// A real, committed post: the id/title/permalink these tests assert against come straight from
// the content the site actually ships, rather than a synthetic fixture the content index has
// never seen (`posts.byId` reads the real glob, same as production).
const REAL_POST = posts.all()[0];

type ListLoadEvent = Parameters<typeof listLoad>[0];
type DetailLoadEvent = Parameters<typeof detailLoad>[0];
type SendActionEvent = Parameters<typeof actions.send>[0];
// Both `load`s are typed to return `void | {...}` by SvelteKit's own generated `$types` (a load
// can, in general, return nothing); the same `Exclude<..., void>` idiom
// `events-detail-route.test.ts` already uses, since every real branch here always returns data.
type ListLoadResult = Exclude<Awaited<ReturnType<typeof listLoad>>, void>;
type DetailLoadResult = Exclude<Awaited<ReturnType<typeof detailLoad>>, void>;

function listEventFor(editor: Editor | null, db: unknown): ListLoadEvent {
  return { locals: { editor }, platform: { env: { CLUB_DB: db } } } as unknown as ListLoadEvent;
}

function detailLoadEventFor(editor: Editor | null, id: string, db: unknown, env: Record<string, unknown> = {}): DetailLoadEvent {
  return {
    params: { id },
    locals: { editor },
    platform: { env: { CLUB_DB: db, ...env } },
  } as unknown as DetailLoadEvent;
}

async function runListLoad(event: ListLoadEvent): Promise<ListLoadResult> {
  return (await listLoad(event)) as ListLoadResult;
}

async function runDetailLoad(event: DetailLoadEvent): Promise<DetailLoadResult> {
  return (await detailLoad(event)) as DetailLoadResult;
}

function postEvent(
  editor: Editor | null,
  id: string,
  fields: Record<string, string>,
  opts: { db?: unknown; env?: Record<string, unknown>; auditSink?: (record: AdminActionAuditRecord) => void } = {},
): SendActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/announce';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id },
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db, ...opts.env } },
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as SendActionEvent;
}

describe('/admin/club/announce list load', () => {
  it('lists the recent posts and marks a prior announcement', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM announcements': [
          {
            id: 'ann-1',
            post_id: REAL_POST.id,
            post_title: REAL_POST.title,
            emailed: 1,
            email_count: 7,
            discord_channel: 'fleet',
            actor: 'admin@example.com',
            created_at: '2026-07-01 00:00:00',
          },
        ],
      },
    });
    const result = await runListLoad(listEventFor(admin, db));
    expect(result.error).toBeNull();
    const row = result.posts.find((p: AnnounceListRow) => p.id === REAL_POST.id);
    expect(row?.announced).toEqual({ createdAt: '2026-07-01 00:00:00', emailCount: 7, discordChannel: 'fleet' });
  });

  it('shows no announcement for a post with no row', async () => {
    const { db } = fakeD1({ allResults: { 'FROM announcements': [] } });
    const result = await runListLoad(listEventFor(admin, db));
    const row = result.posts.find((p: AnnounceListRow) => p.id === REAL_POST.id);
    expect(row?.announced).toBeNull();
  });

  it('reports the CLUB_DB-unbound error, degrading to no announcements', async () => {
    const result = await runListLoad(listEventFor(admin, undefined));
    expect(result.error).toBe('CLUB_DB is not bound.');
    expect(result.posts.every((p: AnnounceListRow) => p.announced === null)).toBe(true);
  });
});

describe('/admin/club/announce/[id] detail load', () => {
  it('resolves a real published post, with its derived summary and full URL', async () => {
    const { db } = fakeD1({ allResults: { 'FROM announcements': [] } });
    const result = await runDetailLoad(detailLoadEventFor(admin, REAL_POST.id, db));
    const entry = posts.byId(REAL_POST.id);
    expect(result.post).toEqual({
      id: REAL_POST.id,
      title: REAL_POST.title,
      summary: deriveAnnouncementSummary(entry!.body, entry!.frontmatter.description),
      url: `${ORIGIN}${REAL_POST.permalink}`,
    });
  });

  it('answers post: null for an id matching no post', async () => {
    const { db } = fakeD1();
    const result = await runDetailLoad(detailLoadEventFor(admin, 'no-such-post', db));
    expect(result.post).toBeNull();
  });

  it('surfaces the latest prior announcement for the re-announce warning', async () => {
    const { db } = fakeD1({
      allResults: {
        'FROM announcements': [
          {
            id: 'ann-1',
            post_id: REAL_POST.id,
            post_title: REAL_POST.title,
            emailed: 1,
            email_count: 3,
            discord_channel: null,
            actor: 'admin@example.com',
            created_at: '2026-07-01 00:00:00',
          },
        ],
      },
    });
    const result = await runDetailLoad(detailLoadEventFor(admin, REAL_POST.id, db));
    expect(result.previous?.emailCount).toBe(3);
  });

  it('answers null (not a warning) for a post never announced', async () => {
    const { db } = fakeD1({ allResults: { 'FROM announcements': [] } });
    const result = await runDetailLoad(detailLoadEventFor(admin, REAL_POST.id, db));
    expect(result.previous).toBeNull();
  });

  it('defaults to general, falling back to the first configured channel when general is not', async () => {
    const { db } = fakeD1();
    const bare = await runDetailLoad(detailLoadEventFor(admin, REAL_POST.id, db));
    expect(bare.defaultChannel).toBe('general');
    expect(bare.channelOptions.find((o: AnnounceChannelOption) => o.value === 'general')?.configured).toBe(false);

    const generalConfigured = await runDetailLoad(
      detailLoadEventFor(admin, REAL_POST.id, db, { DISCORD_WEBHOOK_GENERAL: 'https://x' }),
    );
    expect(generalConfigured.defaultChannel).toBe('general');
    expect(generalConfigured.channelOptions.find((o: AnnounceChannelOption) => o.value === 'general')?.configured).toBe(true);

    const leadershipOnly = await runDetailLoad(
      detailLoadEventFor(admin, REAL_POST.id, db, { DISCORD_WEBHOOK_LEADERSHIP: 'https://x' }),
    );
    expect(leadershipOnly.defaultChannel).toBe('leadership');
  });
});

describe('/admin/club/announce/[id] send action', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A current household plus one member with an email on file, so `currentMemberEmails`'s own
  // grounding-and-members query pair has a real recipient to find (the emailAll tests below).
  const asAdmin = {
    allResults: {
      'FROM households h': [{ household_id: 'hh-larsen', paid_at: new Date().toISOString().slice(0, 10) }],
      'FROM members': [{ email: 'erik.larsen@example.com' }],
    },
  };

  it('refuses an editor with no club role (403), auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.send(
      postEvent(noRole, REAL_POST.id, { message: 'A summary.' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'announce', entity: 'post', editor: noRole.email }));
  });

  it('404s an unknown post id', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(
      postEvent(admin, 'no-such-post', { message: 'A summary.', emailAll: 'on' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(404);
  });

  it('fails 400 on an empty summary', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(postEvent(admin, REAL_POST.id, { message: '  ', emailAll: 'on' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 400 when neither email nor Discord is selected', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(postEvent(admin, REAL_POST.id, { message: 'A summary.' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('fails 400 when Discord is checked with no channel chosen', async () => {
    const { db } = fakeD1(asAdmin);
    const result = await actions.send(
      postEvent(admin, REAL_POST.id, { message: 'A summary.', notifyDiscord: 'on', discordChannel: '' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
  });

  it('emails every current member, records the announcement, and audits it', async () => {
    const { db, calls } = fakeD1(asAdmin);
    const send = vi.fn().mockResolvedValue(undefined);
    const sink = vi.fn();
    const result = await actions.send(
      postEvent(
        admin,
        REAL_POST.id,
        { message: 'A great turnout.', subject: 'A recap', emailAll: 'on' },
        { db, auditSink: sink, env: { EMAIL: { send } } },
      ),
    );
    expect(result).toMatchObject({ ok: true, discordChannel: null });
    expect((result as { emailCount: number }).emailCount).toBeGreaterThan(0);
    expect(send).toHaveBeenCalled();

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO announcements'));
    expect(insert?.args[1]).toBe(REAL_POST.id); // post_id
    expect(insert?.args[3]).toBe(1); // emailed
    expect(insert?.args[5]).toBeNull(); // discord_channel

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'announce', entity: 'post', entityId: REAL_POST.id, editor: admin.email }),
    );
  });

  it('notifies Discord only, recording the chosen channel and no email', async () => {
    const { db, calls } = fakeD1(asAdmin);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);
    const result = await actions.send(
      postEvent(
        admin,
        REAL_POST.id,
        { message: 'A great turnout.', notifyDiscord: 'on', discordChannel: 'fleet' },
        { db, env: { DISCORD_WEBHOOK_FLEET: 'https://discord.com/api/webhooks/fleet' } },
      ),
    );
    expect(result).toMatchObject({ ok: true, emailCount: 0, discordChannel: 'fleet' });
    expect(fetchSpy).toHaveBeenCalledWith('https://discord.com/api/webhooks/fleet', expect.anything());

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO announcements'));
    expect(insert?.args[3]).toBe(0); // emailed
    expect(insert?.args[5]).toBe('fleet'); // discord_channel
    vi.unstubAllGlobals();
  });

  it('sends both email and Discord in one submit', async () => {
    const { db } = fakeD1(asAdmin);
    const send = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchSpy);
    const result = await actions.send(
      postEvent(
        admin,
        REAL_POST.id,
        { message: 'A great turnout.', emailAll: 'on', notifyDiscord: 'on', discordChannel: 'general' },
        {
          db,
          env: { EMAIL: { send }, DISCORD_WEBHOOK_GENERAL: 'https://discord.com/api/webhooks/general' },
        },
      ),
    );
    expect(result).toMatchObject({ ok: true, discordChannel: 'general' });
    expect(send).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
