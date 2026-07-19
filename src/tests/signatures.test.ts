// Server tests for the signing record write (member-waivers T4, signatures.ts): the byte-identical
// snapshot and its matching hash, the auth-event fields, the minor fields, the empty-name refusal,
// and the already-satisfied no-op. Uses the repo's `fakeD1` double (a SQL-substring-keyed stub,
// _fake-d1.ts): it records every prepared-statement call and its bound args, so a test drives the
// module's real SQL and asserts exactly what it sent to the database.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fakeD1, type FakeD1Call } from './_fake-d1';
import {
  applyContactUpdate,
  normalizeContact,
  recordContactConfirmation,
  recordSignature,
  resolveSessionAuthEvent,
  type RecordSignatureInput,
} from '$member-portal/lib/signatures';
import type { SignableDocument } from '$theme/documents';

function nodeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const releaseDoc = {
  id: 'general-release-v1',
  body: 'The signable release text.\n\nParagraph two, with a nonascii dash — and an accent é.',
  frontmatter: { document: 'general-release', version: 3, kind: 'release', audience: 'all-members', season: 2027, status: 'published', title: 'Release of Liability' },
} as unknown as SignableDocument;

function baseInput(overrides: Partial<RecordSignatureInput> = {}): RecordSignatureInput {
  return {
    member: { id: 'm-1', email: 'Dana@Example.com' },
    document: releaseDoc,
    season: 2027,
    context: 'renewal',
    typedName: 'Dana Rivers',
    ipAddress: '203.0.113.7',
    buildHash: 'build-abc',
    authEvent: { tokenId: 'tok-9', issuedAt: '2026-05-14 10:00:00', consumedAt: '2026-05-14 10:00:05' },
    ...overrides,
  };
}

/** The single INSERT into `waiver_acceptances` a recorded run made, or throw if none. */
function insertCall(calls: FakeD1Call[]): FakeD1Call {
  const call = calls.find((c) => c.sql.includes('INSERT INTO waiver_acceptances'));
  if (!call) throw new Error('no waiver_acceptances insert was recorded');
  return call;
}

describe('recordSignature', () => {
  it('rejects an empty or whitespace typed name without writing anything', async () => {
    const { db, calls } = fakeD1();
    const result = await recordSignature(db, baseInput({ typedName: '   ' }));
    expect(result).toEqual({ ok: false, error: 'Type your full legal name to sign.' });
    expect(calls.some((c) => c.sql.includes('INSERT INTO waiver_acceptances'))).toBe(false);
  });

  it('is a no-op (no insert) when the requirement is already satisfied', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'SELECT 1 AS present FROM waiver_acceptances': { present: 1 } } });
    const result = await recordSignature(db, baseInput());
    expect(result).toEqual({ ok: true, noop: true });
    expect(calls.some((c) => c.sql.includes('INSERT INTO waiver_acceptances'))).toBe(false);
  });

  it('writes the exact document body as the snapshot, with a hash that matches it byte-for-byte', async () => {
    const { db, calls } = fakeD1();
    const result = await recordSignature(db, baseInput());
    expect(result).toEqual({ ok: true, noop: false });

    const args = insertCall(calls).args;
    // Column order in the INSERT: ...content_hash(5), content_snapshot(6), person_name(7), person_email(8)...
    const contentHash = args[5];
    const snapshot = args[6];
    expect(snapshot).toBe(releaseDoc.body);
    expect(contentHash).toBe(nodeSha256(releaseDoc.body));
    // The recomputed hash from the stored snapshot still matches, the record-integrity property.
    expect(nodeSha256(snapshot as string)).toBe(contentHash);
  });

  it('records the document identity, context, IP, build hash, member, and normalized email', async () => {
    const { db, calls } = fakeD1();
    await recordSignature(db, baseInput());
    const args = insertCall(calls).args;
    // id(0), document_id(1), version(2), season(3), kind(4)
    expect(args[1]).toBe('general-release');
    expect(args[2]).toBe(3);
    expect(args[3]).toBe(2027);
    expect(args[4]).toBe('release');
    // person_name(7), person_email(8), context(9), ip_address(10), member_id(11)
    expect(args[7]).toBe('Dana Rivers');
    expect(args[8]).toBe('Dana@Example.com');
    expect(args[9]).toBe('renewal');
    expect(args[10]).toBe('203.0.113.7');
    expect(args[11]).toBe('m-1');
    // build_hash(15)
    expect(args[15]).toBe('build-abc');
  });

  it('captures the auth event on the row', async () => {
    const { db, calls } = fakeD1();
    await recordSignature(db, baseInput());
    const args = insertCall(calls).args;
    // auth_token_id(12), auth_issued_at(13), auth_consumed_at(14)
    expect(args[12]).toBe('tok-9');
    expect(args[13]).toBe('2026-05-14 10:00:00');
    expect(args[14]).toBe('2026-05-14 10:00:05');
  });

  it('writes null auth fields when no auth event resolved, still recording the signature', async () => {
    const { db, calls } = fakeD1();
    const result = await recordSignature(db, baseInput({ authEvent: null }));
    expect(result).toEqual({ ok: true, noop: false });
    const args = insertCall(calls).args;
    expect(args[12]).toBeNull();
    expect(args[13]).toBeNull();
    expect(args[14]).toBeNull();
  });

  it('records the minor id and attested relationship for a Part Two, keyed on the minor for the no-op check', async () => {
    const { db, calls } = fakeD1();
    await recordSignature(db, baseInput({ minor: { memberId: 'kid-1', relationship: 'parent' } }));

    // The existence check keyed on the minor, not the adult.
    const existsCall = calls.find((c) => c.sql.includes('SELECT 1 AS present') && c.sql.includes('minor_member_id = ?3'));
    expect(existsCall?.args).toEqual(['general-release', 2027, 'kid-1']);

    const args = insertCall(calls).args;
    // signer_relationship(16), minor_member_id(17)
    expect(args[16]).toBe('parent');
    expect(args[17]).toBe('kid-1');
    // member_id(11) is still the signing adult.
    expect(args[11]).toBe('m-1');
  });

  it('falls back to an empty person_email when the member has none on file (NOT NULL column)', async () => {
    const { db, calls } = fakeD1();
    await recordSignature(db, baseInput({ member: { id: 'm-2', email: null } }));
    expect(insertCall(calls).args[8]).toBe('');
  });
});

describe('resolveSessionAuthEvent', () => {
  it('maps the traced token row to the auth event', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM member_sessions s': { token_id: 'tok-42', issued_at: '2026-05-14 09:59:58', consumed_at: '2026-05-14 10:00:00' },
      },
    });
    expect(await resolveSessionAuthEvent(db, 'sess-1')).toEqual({
      tokenId: 'tok-42',
      issuedAt: '2026-05-14 09:59:58',
      consumedAt: '2026-05-14 10:00:00',
    });
  });

  it('returns null when no consumed token traces back to the session', async () => {
    const { db } = fakeD1();
    expect(await resolveSessionAuthEvent(db, 'sess-1')).toBeNull();
  });
});

describe('normalizeContact', () => {
  it('lowercases the email, parses the phone to E.164, and nulls empty fields', () => {
    const values = normalizeContact({
      email: '  Dana@Example.COM ',
      phone: '9075551234',
      addressLine1: ' 1 Dock Rd ',
      addressLine2: '',
      city: 'Anchorage',
      state: 'AK',
      postalCode: '99501',
    });
    expect(values.email).toBe('dana@example.com');
    expect(values.phone).toBe('+19075551234');
    expect(values.addressLine1).toBe('1 Dock Rd');
    expect(values.addressLine2).toBeNull();
    expect(values.city).toBe('Anchorage');
  });

  it('keeps the trimmed raw phone when it does not parse (never blocks a confirmation)', () => {
    const values = normalizeContact({ email: '', phone: 'call the marina', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '' });
    expect(values.phone).toBe('call the marina');
    expect(values.email).toBeNull();
  });
});

describe('applyContactUpdate', () => {
  it('writes the normalized email and phone to the member and the address to the household, then returns the snapshot', async () => {
    const { db, calls } = fakeD1();
    const values = await applyContactUpdate(db, 'm-1', 'h-1', {
      email: 'DANA@example.com',
      phone: '9075551234',
      addressLine1: '1 Dock Rd',
      addressLine2: '',
      city: 'Anchorage',
      state: 'AK',
      postalCode: '99501',
    });
    expect(values.email).toBe('dana@example.com');

    const memberUpdate = calls.find((c) => c.sql.includes('UPDATE members SET email'));
    expect(memberUpdate?.args).toEqual(['dana@example.com', '+19075551234', 'm-1']);
    const householdUpdate = calls.find((c) => c.sql.includes('UPDATE households SET address_line1'));
    expect(householdUpdate?.args).toEqual(['1 Dock Rd', null, 'Anchorage', 'AK', '99501', 'h-1']);
  });
});

describe('recordContactConfirmation', () => {
  it('inserts a confirmation snapshotting the confirmed values', async () => {
    const { db, calls } = fakeD1();
    await recordContactConfirmation(db, {
      memberId: 'm-1',
      householdId: 'h-1',
      season: 2027,
      context: 'storage-fee',
      values: { email: 'dana@example.com', phone: '+19075551234', addressLine1: '1 Dock Rd', addressLine2: null, city: 'Anchorage', state: 'AK', postalCode: '99501' },
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO contact_confirmations'));
    expect(insert).toBeDefined();
    // member_id(1), household_id(2), season(3), context(4), email(5)
    expect(insert?.args[1]).toBe('m-1');
    expect(insert?.args[2]).toBe('h-1');
    expect(insert?.args[3]).toBe(2027);
    expect(insert?.args[4]).toBe('storage-fee');
    expect(insert?.args[5]).toBe('dana@example.com');
  });
});
