import { describe, expect, it, vi } from 'vitest';
import {
  announceChannelOptions,
  buildAnnouncementEmailContent,
  chunkRecipients,
  currentMemberEmails,
  dedupeEmails,
  defaultAnnounceChannel,
  deriveAnnouncementSummary,
  latestAnnouncementByPost,
  listAnnouncements,
  recordAnnouncement,
  sendAnnouncementEmails,
  type AnnouncementRow,
} from '$admin-club/lib/announcements';
import { fakeD1 } from './_fake-d1';

describe('deriveAnnouncementSummary', () => {
  it('an explicit description frontmatter wins verbatim, untrimmed even past the budget', () => {
    const longDescription = 'A hand-written summary. '.repeat(20).trim(); // well past 280 chars
    const result = deriveAnnouncementSummary('Whatever the body says.', longDescription);
    expect(result).toBe(longDescription);
  });

  it('flows a one-word lead paragraph into the following text rather than stopping at it', () => {
    const body = `Ahoy!\n\n${'We had a wonderful turnout for the regatta this year. '.repeat(6).trim()}`;
    const result = deriveAnnouncementSummary(body, undefined);
    expect(result.length).toBeGreaterThan('Ahoy!'.length);
    expect(result).toContain('regatta');
  });

  it('cuts at the last sentence terminator within budget, dropping the ellipsis, when one exists past the minimum', () => {
    const sentences = [
      'Great turnout at the fall work party this weekend.',
      'We fixed the north dock and painted the clubhouse trim.',
      'Thanks to everyone who brought tools and snacks.',
      'The next work party is scheduled for early May.',
      'Watch your inbox for the exact date and time.',
      'We could still use a few more volunteers for haul-out.',
      'Reach out if you can lend a hand for an hour or two.',
      'Every bit of help keeps the club running smoothly.',
    ];
    const body = sentences.join(' ');
    expect(body.length).toBeGreaterThan(280); // truncation must actually be triggered

    const result = deriveAnnouncementSummary(body, undefined);
    expect(result.endsWith('…')).toBe(false);
    expect(result.endsWith('.')).toBe(true);
    expect(body.startsWith(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(280);
  });

  it('the ten-sentence run-on case cuts at the LAST terminator within budget, not the first', () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i + 1} about the club.`);
    const body = sentences.join(' ');
    const result = deriveAnnouncementSummary(body, undefined);
    expect(result.endsWith('…')).toBe(false);
    expect(result.endsWith('.')).toBe(true);
    // More than just the first sentence survived the cut.
    expect(result.split('.').length).toBeGreaterThan(2);
    expect(result).not.toBe('This is sentence number 1 about the club.');
  });

  it('keeps the ellipsis fallback when no sentence terminator exists within budget (a true run-on)', () => {
    const body = Array.from({ length: 60 }, (_, i) => `word${i}`).join(', '); // commas only, no terminators
    expect(body.length).toBeGreaterThan(280);
    const result = deriveAnnouncementSummary(body, undefined);
    expect(result.endsWith('…')).toBe(true);
  });

  it('keeps the ellipsis fallback when the only terminator falls before the sentence-cut minimum', () => {
    const body = `Hi. ${Array.from({ length: 60 }, (_, i) => `word${i}`).join(', ')}`; // one early period, then a run-on
    expect(body.length).toBeGreaterThan(280);
    const result = deriveAnnouncementSummary(body, undefined);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns the text unchanged (no ellipsis, no cut) when it already fits inside the budget', () => {
    const body = 'A short update: the boat launch went smoothly this morning.';
    const result = deriveAnnouncementSummary(body, undefined);
    expect(result).toBe(body);
  });
});

describe('dedupeEmails', () => {
  it('keeps the first-seen casing and drops a case-insensitive repeat', () => {
    expect(dedupeEmails(['Erik@Example.com', 'other@example.com', 'erik@example.com'])).toEqual([
      'Erik@Example.com',
      'other@example.com',
    ]);
  });

  it('drops blank entries', () => {
    expect(dedupeEmails(['a@example.com', '', '  ', 'b@example.com'])).toEqual(['a@example.com', 'b@example.com']);
  });

  it('answers an empty list for no input', () => {
    expect(dedupeEmails([])).toEqual([]);
  });
});

describe('currentMemberEmails', () => {
  it('includes a current member with an email on file', () => {
    expect(currentMemberEmails()).toContain('erik.larsen@example.com');
  });

  it('excludes a lapsed household (no current-season membership row)', () => {
    expect(currentMemberEmails()).not.toContain('tom.whitfield@example.com');
    expect(currentMemberEmails()).not.toContain('ada.okonkwo@example.com');
  });

  it('excludes an individually archived member even though their household is current', () => {
    // Vera Petrova: archivedAt set, household (the Petrovs) otherwise current.
    expect(currentMemberEmails()).not.toContain('vera.petrova@example.com');
    expect(currentMemberEmails()).toContain('dimitri.petrov@example.com');
  });

  it('answers a deduplicated list (no repeats even though the fixture has none by construction)', () => {
    const emails = currentMemberEmails();
    expect(new Set(emails).size).toBe(emails.length);
  });
});

describe('chunkRecipients', () => {
  it('splits into groups of the default size (50), preserving order', () => {
    const items = Array.from({ length: 120 }, (_, i) => `member-${i}@example.com`);
    const chunks = chunkRecipients(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toHaveLength(50);
    expect(chunks[2]).toHaveLength(20);
    expect(chunks[0][0]).toBe('member-0@example.com');
    expect(chunks[2][chunks[2].length - 1]).toBe('member-119@example.com');
  });

  it('respects a custom chunk size', () => {
    expect(chunkRecipients([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('answers a single empty chunk list for no recipients', () => {
    expect(chunkRecipients([])).toEqual([]);
  });

  it('answers one chunk when everything fits under the size', () => {
    expect(chunkRecipients([1, 2, 3], 50)).toEqual([[1, 2, 3]]);
  });

  it('throws for a non-positive size', () => {
    expect(() => chunkRecipients([1], 0)).toThrow();
  });
});

describe('buildAnnouncementEmailContent', () => {
  it('composes a greeting-free body: the summary, a rule, then the read-more link', () => {
    const { subject, body } = buildAnnouncementEmailContent({
      subject: 'Fleet Tune-Up recap',
      message: 'A great turnout this year.',
      url: 'https://dev.aksailingclub.org/posts/2026-fleet-tune-up/',
    });
    expect(subject).toBe('Fleet Tune-Up recap');
    expect(body).toBe(
      'A great turnout this year.\n\n---\n\nRead the full post: https://dev.aksailingclub.org/posts/2026-fleet-tune-up/',
    );
  });

  it('trims the subject and message', () => {
    const { subject, body } = buildAnnouncementEmailContent({ subject: '  Title  ', message: '  Body  ', url: 'https://x.dev/a' });
    expect(subject).toBe('Title');
    expect(body.startsWith('Body\n\n')).toBe(true);
  });
});

describe('sendAnnouncementEmails', () => {
  it('sends one call per recipient, in chunks, and counts successes', async () => {
    const { db } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    const recipients = ['a@example.com', 'b@example.com', 'c@example.com'];
    const result = await sendAnnouncementEmails(db, { EMAIL: { send } }, {
      postId: 'post-1',
      subject: 'A post',
      message: 'A summary.',
      url: 'https://x.dev/posts/a/',
      recipients,
    });
    expect(result).toEqual({ sentCount: 3, failedCount: 0 });
    expect(send).toHaveBeenCalledTimes(3);
    const sentTo = send.mock.calls.map((call) => (call[0] as { to: string }).to);
    expect(sentTo.sort()).toEqual([...recipients].sort());
  });

  it('chunks recipients into groups of RECIPIENT_CHUNK_SIZE (50)', async () => {
    const { db } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    const recipients = Array.from({ length: 62 }, (_, i) => `member-${i}@example.com`);
    const result = await sendAnnouncementEmails(db, { EMAIL: { send } }, {
      postId: 'post-1',
      subject: 'A post',
      message: 'A summary.',
      url: 'https://x.dev/posts/a/',
      recipients,
    });
    expect(result.sentCount).toBe(62);
    expect(send).toHaveBeenCalledTimes(62);
  });

  it('counts a failed send without throwing (one bad recipient does not block the rest)', async () => {
    const { db } = fakeD1();
    const send = vi.fn().mockImplementation((message: { to: string }) => {
      if (message.to === 'bad@example.com') return Promise.reject(new Error('E_DELIVERY_FAILED'));
      return Promise.resolve(undefined);
    });
    const result = await sendAnnouncementEmails(db, { EMAIL: { send } }, {
      postId: 'post-1',
      subject: 'A post',
      message: 'A summary.',
      url: 'https://x.dev/posts/a/',
      recipients: ['good@example.com', 'bad@example.com'],
    });
    expect(result).toEqual({ sentCount: 1, failedCount: 1 });
  });

  it('degrades to failed sends (never throws) when EMAIL is unbound', async () => {
    const { db } = fakeD1();
    const result = await sendAnnouncementEmails(db, {}, {
      postId: 'post-1',
      subject: 'A post',
      message: 'A summary.',
      url: 'https://x.dev/posts/a/',
      recipients: ['a@example.com'],
    });
    expect(result).toEqual({ sentCount: 0, failedCount: 1 });
  });

  it('tags every email_log row with the post id as its segment', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    await sendAnnouncementEmails(db, { EMAIL: { send } }, {
      postId: 'welcome-aboard',
      subject: 'A post',
      message: 'A summary.',
      url: 'https://x.dev/posts/a/',
      recipients: ['a@example.com'],
    });
    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[2]).toBe('announce:welcome-aboard'); // segment
  });
});

describe('listAnnouncements / latestAnnouncementByPost', () => {
  const ROW_OLD = {
    id: 'ann-1',
    post_id: 'post-a',
    post_title: 'Post A',
    emailed: 1,
    email_count: 10,
    discord_channel: 'fleet',
    actor: 'admin@example.com',
    created_at: '2026-07-01 00:00:00',
  };
  const ROW_NEW = {
    id: 'ann-2',
    post_id: 'post-a',
    post_title: 'Post A',
    emailed: 1,
    email_count: 12,
    discord_channel: null,
    actor: 'admin@example.com',
    created_at: '2026-07-05 00:00:00',
  };

  it('camelCases rows, newest first (as the fake already returns them)', async () => {
    const { db } = fakeD1({ allResults: { 'FROM announcements': [ROW_NEW, ROW_OLD] } });
    const rows = await listAnnouncements(db);
    expect(rows).toEqual([
      {
        id: 'ann-2',
        postId: 'post-a',
        postTitle: 'Post A',
        emailed: true,
        emailCount: 12,
        discordChannel: null,
        actor: 'admin@example.com',
        createdAt: '2026-07-05 00:00:00',
      },
      {
        id: 'ann-1',
        postId: 'post-a',
        postTitle: 'Post A',
        emailed: true,
        emailCount: 10,
        discordChannel: 'fleet',
        actor: 'admin@example.com',
        createdAt: '2026-07-01 00:00:00',
      },
    ]);
  });

  it('latestAnnouncementByPost keeps only the first (newest) row per post', () => {
    const rows: AnnouncementRow[] = [
      { id: 'ann-2', postId: 'post-a', postTitle: 'Post A', emailed: true, emailCount: 12, discordChannel: null, actor: 'x', createdAt: '2026-07-05 00:00:00' },
      { id: 'ann-1', postId: 'post-a', postTitle: 'Post A', emailed: true, emailCount: 10, discordChannel: 'fleet', actor: 'x', createdAt: '2026-07-01 00:00:00' },
      { id: 'ann-3', postId: 'post-b', postTitle: 'Post B', emailed: false, emailCount: 0, discordChannel: 'general', actor: 'x', createdAt: '2026-07-04 00:00:00' },
    ];
    const byPost = latestAnnouncementByPost(rows);
    expect(byPost.get('post-a')?.id).toBe('ann-2');
    expect(byPost.get('post-b')?.id).toBe('ann-3');
    expect(byPost.get('post-c')).toBeUndefined();
  });
});

describe('recordAnnouncement', () => {
  it('writes an announcements row with the given fields', async () => {
    const { db, calls } = fakeD1();
    await recordAnnouncement(db, {
      postId: 'post-a',
      postTitle: 'Post A',
      emailed: true,
      emailCount: 18,
      discordChannel: 'fleet',
      actor: 'admin@example.com',
    });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO announcements'));
    expect(insert?.args.slice(1)).toEqual(['post-a', 'Post A', 1, 18, 'fleet', 'admin@example.com']);
  });

  it('stores a null discord_channel when Discord was not selected', async () => {
    const { db, calls } = fakeD1();
    await recordAnnouncement(db, {
      postId: 'post-a',
      postTitle: 'Post A',
      emailed: true,
      emailCount: 5,
      discordChannel: null,
      actor: 'admin@example.com',
    });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO announcements'));
    expect(insert?.args[5]).toBeNull();
  });
});

describe('the channel map: configured, unconfigured, and the default fallback', () => {
  it('marks each of the nine options configured or not, per the env', () => {
    const env = {
      DISCORD_WEBHOOK_GENERAL: 'https://discord.com/api/webhooks/general',
      DISCORD_WEBHOOK_FLEET: 'https://discord.com/api/webhooks/fleet',
    };
    const options = announceChannelOptions(env);
    expect(options).toHaveLength(9);
    const byValue = Object.fromEntries(options.map((o) => [o.value, o.configured]));
    expect(byValue.leadership).toBe(false);
    expect(byValue.general).toBe(true);
    expect(byValue.fleet).toBe(true);
    expect(byValue['buccaneer-18']).toBe(false);
  });

  it('defaults to leadership when it is configured', () => {
    expect(defaultAnnounceChannel({ DISCORD_WEBHOOK_LEADERSHIP: 'https://x' })).toBe('leadership');
  });

  it('falls back to the first configured channel when general is not configured', () => {
    // With general unset, the fallback walks ANNOUNCE_CHANNELS order and lands on the first
    // channel that can actually send.
    expect(defaultAnnounceChannel({ DISCORD_WEBHOOK_FLEET: 'https://x', DISCORD_WEBHOOK_SITE: 'https://y' })).toBe('site');
  });

  it('falls back to general (unconfigured) when nothing at all is configured, so the gap stays visible', () => {
    expect(defaultAnnounceChannel({})).toBe('general');
  });
});
