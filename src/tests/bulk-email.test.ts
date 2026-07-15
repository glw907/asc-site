// bulk-email.ts's own coverage: blast recording (counts, log rows, blast:<id> linkage),
// per-recipient variable rendering, failure counting, and the test-send path. Follows
// announcements.test.ts's own sendAnnouncementEmails shape (fakeD1, a spy EMAIL.send).
import { describe, expect, it, vi } from 'vitest';
import { chunkRecipients, listBlasts, RECIPIENT_CHUNK_SIZE, sendBlastTest, sendSegmentBlast } from '$admin-club/lib/bulk-email';
import type { ResolvedSegment } from '$admin-club/lib/segments';
import { fakeD1 } from './_fake-d1';

const SEGMENT: ResolvedSegment = {
  key: 'current',
  label: 'Current members',
  recipients: [
    { email: 'alice@example.com', personName: 'Alice A', memberId: 'mem-alice' },
    { email: 'bob@example.com', personName: 'Bob B', memberId: 'mem-bob' },
  ],
};

describe('chunkRecipients', () => {
  it('splits into groups of RECIPIENT_CHUNK_SIZE (50), preserving order', () => {
    const items = Array.from({ length: 120 }, (_, i) => `member-${i}@example.com`);
    const chunks = chunkRecipients(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(RECIPIENT_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(20);
  });

  it('throws for a non-positive size', () => {
    expect(() => chunkRecipients([1], 0)).toThrow();
  });
});

describe('sendSegmentBlast', () => {
  it('sends one call per recipient with per-recipient variable substitution, and writes an honest email_blasts row', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await sendSegmentBlast(
      { EMAIL: { send }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' },
      db,
      {
        segment: SEGMENT,
        subject: 'Fleet update',
        body: 'Hi {{person_name}}, see {{portal_url}}. Questions? {{committee_email}}.',
        actor: 'admin@example.com',
      },
    );

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);

    const messages = send.mock.calls.map((call) => call[0] as { to: string; text: string });
    const alice = messages.find((m) => m.to === 'alice@example.com');
    expect(alice?.text).toContain('Hi Alice A,');
    expect(alice?.text).toContain('https://dev.aksailingclub.org/my-account');
    expect(alice?.text).toContain('membership-committee@aksailingclub.org');
    const bob = messages.find((m) => m.to === 'bob@example.com');
    expect(bob?.text).toContain('Hi Bob B,');

    const blastInsert = calls.find((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    expect(blastInsert?.args.slice(1)).toEqual([
      'current',
      'Current members',
      'Fleet update',
      'Hi {{person_name}}, see {{portal_url}}. Questions? {{committee_email}}.',
      2, // recipient_count
      'admin@example.com',
    ]);
    expect(result.blastId).toBe(blastInsert?.args[0]);

    const blastUpdate = calls.find((c) => c.sql.startsWith('UPDATE email_blasts'));
    expect(blastUpdate?.args).toEqual([2, 0, result.blastId]); // sent_count, failed_count, id
  });

  it('writes the email_blasts row BEFORE any send goes out, so a mid-run crash still leaves an audit row', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    await sendSegmentBlast({ EMAIL: { send } }, db, { segment: SEGMENT, subject: 'S', body: 'B', actor: 'a@example.com' });

    const insertIndex = calls.findIndex((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    const firstLogIndex = calls.findIndex((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(firstLogIndex).toBeGreaterThan(insertIndex);

    const insert = calls[insertIndex];
    expect(insert.args.slice(1)).toEqual(['current', 'Current members', 'S', 'B', 2, 'a@example.com']);
  });

  it('an UPDATE failure after the sends already went out never rejects the call, and still returns the real counts', async () => {
    const { db, calls } = fakeD1();
    const originalPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      if (sql.startsWith('UPDATE email_blasts')) {
        return {
          bind: () => ({ run: () => Promise.reject(new Error('D1_ERROR: database is locked')) }),
        };
      }
      return originalPrepare(sql);
    }) as typeof db.prepare;

    const send = vi.fn().mockResolvedValue(undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendSegmentBlast({ EMAIL: { send } }, db, { segment: SEGMENT, subject: 'S', body: 'B', actor: 'a@example.com' });

    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(0);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    expect(insert).toBeTruthy();
    expect(insert?.args.slice(1)).toEqual(['current', 'Current members', 'S', 'B', 2, 'a@example.com']);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('tags every email_log row with segment = blast:<id>', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await sendSegmentBlast({ EMAIL: { send } }, db, { segment: SEGMENT, subject: 'S', body: 'B', actor: 'a@example.com' });

    const logWrites = calls.filter((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrites).toHaveLength(2);
    for (const write of logWrites) expect(write.args[2]).toBe(`blast:${result.blastId}`);
  });

  it('counts a failed send without aborting the run, and records the honest counts on the blast row', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn().mockImplementation((message: { to: string }) =>
      message.to === 'bob@example.com' ? Promise.reject(new Error('E_DELIVERY_FAILED')) : Promise.resolve(undefined),
    );
    const result = await sendSegmentBlast({ EMAIL: { send } }, db, { segment: SEGMENT, subject: 'S', body: 'B', actor: 'a@example.com' });

    expect(result.sentCount).toBe(1);
    expect(result.failedCount).toBe(1);
    const blastInsert = calls.find((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    expect(blastInsert?.args[5]).toBe(2); // recipient_count: the resolved segment size, never re-derived from outcomes
    const blastUpdate = calls.find((c) => c.sql.startsWith('UPDATE email_blasts'));
    expect(blastUpdate?.args).toEqual([1, 1, result.blastId]); // sent_count, failed_count
  });

  it('writes recipient_count 0 and never calls EMAIL.send for an empty segment', async () => {
    const { db, calls } = fakeD1();
    const send = vi.fn();
    const emptySegment: ResolvedSegment = { key: 'lapsed', label: 'Lapsed members', recipients: [] };
    const result = await sendSegmentBlast({ EMAIL: { send } }, db, { segment: emptySegment, subject: 'S', body: 'B', actor: 'a@example.com' });

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ blastId: result.blastId, sentCount: 0, failedCount: 0 });
    const blastInsert = calls.find((c) => c.sql.startsWith('INSERT INTO email_blasts'));
    expect(blastInsert?.args[5]).toBe(0);
    const blastUpdate = calls.find((c) => c.sql.startsWith('UPDATE email_blasts'));
    expect(blastUpdate?.args).toEqual([0, 0, result.blastId]);
  });
});

describe('sendBlastTest', () => {
  it('sends to the given recipient only, resolves {{person_name}} from a matching member, logs segment = blast-test, and writes no blast row', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE email': { name: 'Editor Name' } } });
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await sendBlastTest({ EMAIL: { send } }, db, { recipient: 'editor@example.com', subject: 'Test', body: 'Hi {{person_name}}!' });

    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { to: string; text: string };
    expect(message.to).toBe('editor@example.com');
    expect(message.text).toContain('Hi Editor Name!');

    const logWrite = calls.find((c) => c.sql.startsWith('INSERT INTO email_log'));
    expect(logWrite?.args[2]).toBe('blast-test');
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO email_blasts'))).toBe(false);
  });

  it('falls back to a sample name when the recipient matches no member on file', async () => {
    const { db } = fakeD1();
    const send = vi.fn().mockResolvedValue(undefined);
    await sendBlastTest({ EMAIL: { send } }, db, { recipient: 'unknown@example.com', subject: 'Test', body: 'Hi {{person_name}}!' });
    const message = send.mock.calls[0][0] as { text: string };
    expect(message.text).toContain('Hi Sample Member!');
  });

  it('answers ok:false without throwing when the send itself fails', async () => {
    const { db } = fakeD1();
    const send = vi.fn().mockRejectedValue(new Error('E_DELIVERY_FAILED'));
    const result = await sendBlastTest({ EMAIL: { send } }, db, { recipient: 'editor@example.com', subject: 'Test', body: 'Body' });
    expect(result).toEqual({ ok: false, error: 'E_DELIVERY_FAILED' });
  });
});

describe('listBlasts', () => {
  it('camelCases rows, newest first (as the fake already returns them)', async () => {
    const ROW = {
      id: 'blast-1',
      segment_key: 'current',
      segment_label: 'Current members',
      subject: 'Fleet update',
      body: 'Hi {{person_name}}',
      recipient_count: 42,
      sent_count: 40,
      failed_count: 2,
      actor: 'admin@example.com',
      created_at: '2026-07-14 12:00:00',
    };
    const { db } = fakeD1({ allResults: { 'FROM email_blasts': [ROW] } });
    const rows = await listBlasts(db);
    expect(rows).toEqual([
      {
        id: 'blast-1',
        segmentKey: 'current',
        segmentLabel: 'Current members',
        subject: 'Fleet update',
        body: 'Hi {{person_name}}',
        recipientCount: 42,
        sentCount: 40,
        failedCount: 2,
        actor: 'admin@example.com',
        createdAt: '2026-07-14 12:00:00',
      },
    ]);
  });
});
