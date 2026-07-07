// Mirrors offers.test.ts's own structure and fakeD1 conventions for member-auth's own D1 write
// paths. Synthetic fixtures only (no real member names/emails: this is a public repo).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  requestMemberLink,
  confirmMemberToken,
  getMemberSession,
  destroyMemberSession,
  type SendMemberLink,
} from '$member-auth/lib/auth';
import { hashMemberToken } from '$member-auth/lib/crypto';

const BRANDING = { origin: 'https://dev.aksailingclub.org', siteName: 'Alaska Sailing Club', from: 'noreply@aksailingclub.org' };

const ACTIVE_MEMBER = {
  id: 'mem-scratch-1',
  household_id: 'hh-scratch-1',
  name: 'Scratch Member',
  email: 'scratch-member@example.com',
  archived_at: null,
};

const ARCHIVED_MEMBER = { ...ACTIVE_MEMBER, id: 'mem-scratch-2', archived_at: '2026-01-01 00:00:00' };
const NO_EMAIL_MEMBER = { ...ACTIVE_MEMBER, id: 'mem-scratch-3', email: null };

describe('requestMemberLink: the enumeration-safety transition table', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers an unknown email with the generic sent response, sending nothing, auditing as public:auth/unknown', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } });
    const send = vi.fn<SendMemberLink>();
    const result = await requestMemberLink(db, 'nobody@example.com', send, BRANDING);
    expect(result).toEqual({ status: 'sent' });
    expect(send).not.toHaveBeenCalled();
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'request_link', 'member_auth', null, 'unknown']);
  });

  it('answers an archived member with the generic sent response, sending nothing (silence), auditing archived', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ARCHIVED_MEMBER } });
    const send = vi.fn<SendMemberLink>();
    const result = await requestMemberLink(db, ARCHIVED_MEMBER.email, send, BRANDING);
    expect(result).toEqual({ status: 'sent' });
    expect(send).not.toHaveBeenCalled();
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'request_link', 'member_auth', ARCHIVED_MEMBER.id, 'archived']);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO member_tokens'))).toBe(false);
  });

  it('answers a member with no email on file the same generic way, sending nothing', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': NO_EMAIL_MEMBER } });
    const send = vi.fn<SendMemberLink>();
    // A caller only ever has an email to look up BY, so this exercises the defensive branch
    // directly (a member row that somehow has no email once found).
    const result = await requestMemberLink(db, 'anything@example.com', send, BRANDING);
    expect(result).toEqual({ status: 'sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('mints a token, sends the link, and audits for a real, active member, storing only the token hash', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } });
    const send = vi.fn<SendMemberLink>().mockResolvedValue(undefined);
    const result = await requestMemberLink(db, ACTIVE_MEMBER.email, send, BRANDING);
    expect(result).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);

    const message = send.mock.calls[0][0];
    expect(message.to).toBe(ACTIVE_MEMBER.email);
    const linkMatch = message.text.match(/https:\/\/\S+/);
    expect(linkMatch?.[0]).toMatch(/^https:\/\/dev\.aksailingclub\.org\/my-account\/confirm\?token=/);
    const plaintextToken = decodeURIComponent(linkMatch![0].split('token=')[1]);

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO member_tokens'));
    expect(insert).toBeDefined();
    const storedHash = insert?.args[2];
    expect(storedHash).not.toBe(plaintextToken);
    expect(storedHash).toBe(await hashMemberToken(plaintextToken));
    expect(insert?.args[1]).toBe(ACTIVE_MEMBER.id);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'request_link', 'member_auth', ACTIVE_MEMBER.id, null]);
  });

  it('answers send_error, not sent, when the injected send genuinely fails for a real member', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } });
    const send = vi.fn<SendMemberLink>().mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await requestMemberLink(db, ACTIVE_MEMBER.email, send, BRANDING);
    expect(result).toEqual({ status: 'send_error' });
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'request_link_failed', 'member_auth', ACTIVE_MEMBER.id, null]);
    errorSpy.mockRestore();
  });

  it('the enumeration oracle: unknown, archived, and no-email members all answer byte-identically to a real send-ok member', async () => {
    const unknown = await requestMemberLink(
      fakeD1({ firstResults: { 'FROM members WHERE lower(email)': null } }).db,
      'unknown@example.com',
      vi.fn<SendMemberLink>(),
      BRANDING,
    );
    const archived = await requestMemberLink(
      fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ARCHIVED_MEMBER } }).db,
      ARCHIVED_MEMBER.email,
      vi.fn<SendMemberLink>(),
      BRANDING,
    );
    const noEmail = await requestMemberLink(
      fakeD1({ firstResults: { 'FROM members WHERE lower(email)': NO_EMAIL_MEMBER } }).db,
      'anything@example.com',
      vi.fn<SendMemberLink>(),
      BRANDING,
    );
    const active = await requestMemberLink(
      fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } }).db,
      ACTIVE_MEMBER.email,
      vi.fn<SendMemberLink>().mockResolvedValue(undefined),
      BRANDING,
    );
    expect(unknown).toEqual({ status: 'sent' });
    expect(archived).toEqual({ status: 'sent' });
    expect(noEmail).toEqual({ status: 'sent' });
    expect(active).toEqual({ status: 'sent' });
  });

  it('never logs, returns, or audits the plaintext token or its hash', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM members WHERE lower(email)': ACTIVE_MEMBER } });
    const send = vi.fn<SendMemberLink>().mockResolvedValue(undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await requestMemberLink(db, ACTIVE_MEMBER.email, send, BRANDING);

    const message = send.mock.calls[0][0];
    const plaintextToken = decodeURIComponent(message.text.match(/token=(\S+)/)![1]);
    const tokenHash = await hashMemberToken(plaintextToken);

    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).not.toContain(plaintextToken);
    expect(audit?.args).not.toContain(tokenHash);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining(plaintextToken));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(plaintextToken));
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('confirmMemberToken: single-use consume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consumes a fresh token, creates a session, and audits public:auth/confirm', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM member_tokens t JOIN members m': ACTIVE_MEMBER },
      runResults: { "UPDATE member_tokens SET consumed_at": { changes: 1 } },
    });
    const result = await confirmMemberToken(db, 'plaintext-token');
    expect(result).toEqual({ ok: true, sessionId: expect.any(String), member: expect.objectContaining({ id: ACTIVE_MEMBER.id }) });

    expect(calls.some((c) => c.sql.startsWith('INSERT INTO member_sessions'))).toBe(true);
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'confirm', 'member_auth', ACTIVE_MEMBER.id, null]);
  });

  it('refuses an expired or already-consumed token, pre-filling the email traced back from the row', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM member_tokens t JOIN members m': ACTIVE_MEMBER },
      runResults: { "UPDATE member_tokens SET consumed_at": { changes: 0 } },
    });
    const result = await confirmMemberToken(db, 'stale-token');
    expect(result).toEqual({ ok: false, prefillEmail: ACTIVE_MEMBER.email });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO member_sessions'))).toBe(false);
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:auth', 'confirm_failed', 'member_auth', ACTIVE_MEMBER.id, null]);
  });

  it('refuses an entirely unknown token, pre-filling nothing', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM member_tokens t JOIN members m': null },
      runResults: { "UPDATE member_tokens SET consumed_at": { changes: 0 } },
    });
    const result = await confirmMemberToken(db, 'no-such-token');
    expect(result).toEqual({ ok: false, prefillEmail: null });
  });

  it('refuses a concurrent double-consume: the second call sees changes=0 from the same compare-and-set UPDATE', async () => {
    let consumeAttempts = 0;
    const { db, calls } = fakeD1({
      firstResults: { 'FROM member_tokens t JOIN members m': ACTIVE_MEMBER },
      runResults: {
        'UPDATE member_tokens SET consumed_at': () => (++consumeAttempts === 1 ? { changes: 1 } : { changes: 0 }),
      },
    });
    const first = await confirmMemberToken(db, 'race-token');
    const second = await confirmMemberToken(db, 'race-token');
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, prefillEmail: ACTIVE_MEMBER.email });
    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO member_sessions'))).toHaveLength(1);
  });
});

describe('getMemberSession / destroyMemberSession', () => {
  it('resolves an active session to its member', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM member_sessions s JOIN members m': ACTIVE_MEMBER } });
    await expect(getMemberSession(db, 'sess-1')).resolves.toEqual(
      expect.objectContaining({ id: ACTIVE_MEMBER.id, email: ACTIVE_MEMBER.email }),
    );
  });

  it('resolves null for an unknown, expired, or now-archived-member session alike (the join finds no row)', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM member_sessions s JOIN members m': null } });
    await expect(getMemberSession(db, 'sess-gone')).resolves.toBeNull();
  });

  it('deletes the session and audits member:<id> when a row existed', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'DELETE FROM member_sessions': { member_id: ACTIVE_MEMBER.id } },
    });
    await destroyMemberSession(db, 'sess-1');
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual([`member:${ACTIVE_MEMBER.id}`, 'sign_out', 'member_auth', ACTIVE_MEMBER.id, null]);
  });

  it('is a silent no-op, with no audit row, when the session was already gone', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'DELETE FROM member_sessions': null } });
    await destroyMemberSession(db, 'sess-already-gone');
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO audit_log'))).toBe(false);
  });
});
