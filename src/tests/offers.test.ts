import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';
import {
  cancelActiveOffer,
  claimOffer,
  declineOffer,
  expireStaleOffers,
  hashOfferToken,
  offerSpot,
} from '$admin-club/lib/offers';

const CLASS_ROW = {
  id: 'fleet-tune-up-weekend',
  season: 2026,
  name: 'Fleet Tune-Up Weekend',
  slug: 'fleet-tune-up-weekend',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  visible: 1 as const,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

const NOT_FULL = { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE class_id': { n: 9 }, 'FROM class_waitlist WHERE class_id': { n: 1 } };
const FULL = { 'FROM classes WHERE id': CLASS_ROW, 'FROM class_enrollments WHERE class_id': { n: 10 }, 'FROM class_waitlist WHERE class_id': { n: 1 } };

const WAITLIST_ID = 'wait-1';

describe('offerSpot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses when the class has no free capacity', async () => {
    const { db, calls } = fakeD1({ firstResults: FULL });
    const result = await offerSpot(db, { classId: CLASS_ROW.id, waitlistId: WAITLIST_ID, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ error: expect.stringContaining('no free spot') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(false);
  });

  it('refuses when an active (unresolved, unexpired) offer already exists for the entry', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        ...NOT_FULL,
        'FROM class_waitlist WHERE id': { class_id: CLASS_ROW.id },
        'FROM class_offers WHERE waitlist_id': {
          token_hash: 'existing-hash',
          waitlist_id: WAITLIST_ID,
          class_id: CLASS_ROW.id,
          offered_by: 'admin@example.com',
          offered_at: '2026-07-01 00:00:00',
          expires_at: '2999-01-01 00:00:00',
          resolved: null,
          resolved_at: null,
        },
      },
    });
    const result = await offerSpot(db, { classId: CLASS_ROW.id, waitlistId: WAITLIST_ID, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ error: expect.stringContaining('already active') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(false);
  });

  it('mints a token when a free spot exists and no active offer blocks it, storing only its hash', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        ...NOT_FULL,
        'FROM class_waitlist WHERE id': { class_id: CLASS_ROW.id },
        'FROM class_offers WHERE waitlist_id': null,
        "'offer_window_hours'": { value: '72' },
      },
    });
    const result = await offerSpot(db, { classId: CLASS_ROW.id, waitlistId: WAITLIST_ID, actorEmail: 'admin@example.com' });
    expect('token' in result).toBe(true);
    const { token, expiresAt } = result as { token: string; expiresAt: string };
    expect(token).toBeTruthy();
    expect(expiresAt).toBeTruthy();

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO class_offers'));
    expect(insert).toBeDefined();
    const storedToken = insert?.args[0];
    expect(storedToken).not.toBe(token);
    expect(storedToken).toBe(await hashOfferToken(token));
    expect(insert?.args).toEqual([storedToken, WAITLIST_ID, CLASS_ROW.id, 'admin@example.com', expiresAt]);
  });

  it('proceeds once a previously active offer has resolved (a decline or expiry frees the entry)', async () => {
    const { db } = fakeD1({
      firstResults: {
        ...NOT_FULL,
        'FROM class_waitlist WHERE id': { class_id: CLASS_ROW.id },
        'FROM class_offers WHERE waitlist_id': null, // no unresolved row: the prior one already resolved
        "'offer_window_hours'": { value: '72' },
      },
    });
    const result = await offerSpot(db, { classId: CLASS_ROW.id, waitlistId: WAITLIST_ID, actorEmail: 'admin@example.com' });
    expect('token' in result).toBe(true);
  });
});

describe('claimOffer', () => {
  const NOW = new Date('2026-07-10T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ACTIVE_OFFER_ROW = {
    token_hash: 'the-hash',
    waitlist_id: WAITLIST_ID,
    class_id: CLASS_ROW.id,
    offered_by: 'admin@example.com',
    offered_at: '2026-07-09 00:00:00',
    expires_at: '2026-07-12 00:00:00',
    resolved: null,
    resolved_at: null,
  };

  it('enrolls the waitlisted person and removes their waitlist row, auditing public:claim', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM class_waitlist WHERE id': {
          id: WAITLIST_ID,
          applicant_name: 'Jamie Rivera',
          applicant_email: 'jamie@example.com',
          member_id: null,
        },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({
      enrollmentId: expect.any(String),
      classId: CLASS_ROW.id,
      className: CLASS_ROW.name,
      personName: 'Jamie Rivera',
      personEmail: 'jamie@example.com',
    });

    const enrollInsert = calls.find((c) => c.sql.startsWith('INSERT INTO class_enrollments'));
    expect(enrollInsert?.args).toEqual([(result as { enrollmentId: string }).enrollmentId, CLASS_ROW.id, 'jamie@example.com']);
    expect(calls.some((c) => c.sql === 'DELETE FROM class_waitlist WHERE id = ?1')).toBe(true);
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'claimed'"))).toBe(true);
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:claim', 'claim', 'offer', WAITLIST_ID, `class=${CLASS_ROW.id}`]);
  });

  it('refuses a second claim of an already-resolved token', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { ...ACTIVE_OFFER_ROW, resolved: 'claimed', resolved_at: '2026-07-10 00:00:00' } },
    });
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('already been used') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
  });

  it('refuses an expired token, lazily marking it expired and auditing system', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { ...ACTIVE_OFFER_ROW, expires_at: '2026-07-09 00:00:00' } },
    });
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('expired') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'expired'"))).toBe(true);
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['system', 'expire', 'offer', WAITLIST_ID, null]);
  });

  it('refuses an unknown token', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_offers WHERE token': null } });
    const result = await claimOffer(db, 'no-such-token');
    expect(result).toEqual({ error: expect.stringContaining('not valid') });
  });

  it('refuses when the class has filled up since this offer was made (a different waitlist ' +
    'entry claimed the last spot first)', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM classes WHERE id': CLASS_ROW,
        'FROM class_enrollments WHERE class_id': { n: CLASS_ROW.capacity }, // now full
      },
    });
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('filled up') });
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'claimed'"))).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
  });

  it('refuses a concurrent double-claim: the losing call sees changes=0 from the atomic ' +
    'consume UPDATE and refuses cleanly instead of double-enrolling', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM classes WHERE id': CLASS_ROW,
      },
      // The preview read still sees the offer as pending (a stale, pre-race snapshot); the
      // atomic consume itself is what reports the loss, because by the time IT runs the
      // winning call has already flipped `resolved`.
      runResults: { "UPDATE class_offers SET resolved = 'claimed'": { changes: 0 } },
    });
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('already been used') });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_enrollments'))).toBe(false);
    expect(calls.some((c) => c.sql === 'DELETE FROM class_waitlist WHERE id = ?1')).toBe(false);
  });

  it('answers a clean refusal, not a 500, when the enrollment batch fails after a committed ' +
    'consume (e.g. the person is already enrolled some other way)', async () => {
    const { db } = fakeD1({
      firstResults: {
        'FROM class_offers WHERE token': ACTIVE_OFFER_ROW,
        'FROM class_waitlist WHERE id': {
          id: WAITLIST_ID,
          applicant_name: 'Jamie Rivera',
          applicant_email: 'jamie@example.com',
          member_id: null,
        },
        'FROM classes WHERE id': CLASS_ROW,
      },
    });
    db.batch = () =>
      Promise.reject(new Error('UNIQUE constraint failed: class_enrollments.class_id, class_enrollments.member_id'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await claimOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('already enrolled') });
    errorSpy.mockRestore();
  });
});

describe('declineOffer', () => {
  it('resolves the offer as declined, auditing public:decline, and frees exactly one row', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { waitlist_id: WAITLIST_ID, resolved: null } },
    });
    const result = await declineOffer(db, 'plaintext-token');
    expect(result).toEqual({ ok: true });
    const updates = calls.filter((c) => c.sql.startsWith('UPDATE'));
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("resolved = 'declined'");
    const audit = calls.find((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audit?.args).toEqual(['public:decline', 'decline', 'offer', WAITLIST_ID, null]);
  });

  it('refuses an already-resolved token', async () => {
    const { db } = fakeD1({
      firstResults: { 'FROM class_offers WHERE token': { waitlist_id: WAITLIST_ID, resolved: 'declined' } },
    });
    const result = await declineOffer(db, 'plaintext-token');
    expect(result).toEqual({ error: expect.stringContaining('already been used') });
  });

  it('refuses an unknown token', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_offers WHERE token': null } });
    const result = await declineOffer(db, 'no-such-token');
    expect(result).toEqual({ error: expect.stringContaining('not valid') });
  });
});

describe('cancelActiveOffer (the admin cancel/expire-now action)', () => {
  it('resolves the entry\'s active offer as declined, without writing its own audit row', async () => {
    const { db, calls } = fakeD1({
      firstResults: { 'FROM class_offers WHERE waitlist_id': { token: 'the-hash' } },
    });
    const result = await cancelActiveOffer(db, WAITLIST_ID);
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'declined'"))).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO audit_log'))).toBe(false);
  });

  it('refuses when there is no active offer to cancel', async () => {
    const { db } = fakeD1({ firstResults: { 'FROM class_offers WHERE waitlist_id': null } });
    const result = await cancelActiveOffer(db, WAITLIST_ID);
    expect(result).toEqual({ error: expect.stringContaining('no active offer') });
  });
});

describe('expireStaleOffers', () => {
  it('expires every unresolved, past-expiry offer, auditing each as system', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM class_offers WHERE resolved IS NULL': [
          { token: 'hash-a', waitlist_id: 'wait-a' },
          { token: 'hash-b', waitlist_id: 'wait-b' },
        ],
      },
    });
    const result = await expireStaleOffers(db);
    expect(result).toEqual({ expiredCount: 2 });
    const updates = calls.filter((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'expired'"));
    expect(updates).toHaveLength(2);
    const audits = calls.filter((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.args[0] === 'system' && a.args[1] === 'expire')).toBe(true);
  });

  it('does nothing when no offer has passed its window', async () => {
    const { db, calls } = fakeD1({ allResults: { 'FROM class_offers WHERE resolved IS NULL': [] } });
    const result = await expireStaleOffers(db);
    expect(result).toEqual({ expiredCount: 0 });
    expect(calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
  });
});
