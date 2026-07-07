// Proves `expireStaleOffersJob` correctly DELEGATES to `offers.ts`'s own exported functions
// (`expireStaleOffers`, `hasActiveOfferForClass`, `offerSpot`) rather than reimplementing any of
// their state-transition logic itself; see those functions' own test suite (`offers.test.ts`) for
// their internal behavior, which this suite does not re-prove.
import { describe, expect, it } from 'vitest';
import { fakeD1 } from './_fake-d1';
import { expireStaleOffersJob } from '../jobs/expire-stale-offers';

const FULL_CLASS = {
  id: 'full-class',
  season: 2026,
  name: 'Full Class',
  slug: 'full-class',
  track: 'adult-teen',
  capacity: 10,
  fee: 100,
  start_date: null,
  end_date: null,
  location: null,
  description: null,
  instructor_notes: null,
  hero_image: null,
  hero_image_alt: null,
  visible: 1,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  enrolled_count: 10,
  waitlist_count: 2,
};

const OPEN_CLASS = { ...FULL_CLASS, id: 'open-class', slug: 'open-class', name: 'Open Class', enrolled_count: 4, waitlist_count: 3 };
const NO_WAITLIST_CLASS = { ...FULL_CLASS, id: 'no-waitlist', slug: 'no-waitlist', name: 'No Waitlist', enrolled_count: 4, waitlist_count: 0 };

describe('expireStaleOffersJob.run', () => {
  it('sweeps stale offers first, then auto-offers the next waitlisted entry for a class with a free spot and no active offer', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM class_offers WHERE resolved IS NULL': [{ token: 'stale-hash', waitlist_id: 'wait-stale' }],
        'FROM classes': [FULL_CLASS, OPEN_CLASS, NO_WAITLIST_CLASS],
        'FROM class_waitlist WHERE class_id': [{ id: 'wait-next', class_id: OPEN_CLASS.id, position: 1 }],
      },
      firstResults: {
        // FULL_CLASS is skipped for being full, so `hasActiveOfferForClass` is only ever asked
        // about `open-class`; answering `null` for every class here still proves the point, since
        // a full or empty-waitlist class must never even reach that query (asserted below).
        'FROM class_offers WHERE class_id': null,
        'FROM classes WHERE id': OPEN_CLASS,
        'FROM class_waitlist WHERE id': { class_id: OPEN_CLASS.id },
        'FROM class_offers WHERE waitlist_id': null,
        "'offer_window_hours'": { value: '72' },
      },
    });

    const summary = await expireStaleOffersJob.run({}, { db, now: new Date('2026-07-07T00:00:00Z') });

    expect(summary.examined).toBe(3);
    expect(summary.detail).toBe('expired=1 auto-offered=1');
    expect(summary.acted).toBe(2);

    // The expiry sweep ran (delegated to `expireStaleOffers`).
    expect(calls.some((c) => c.sql.startsWith("UPDATE class_offers SET resolved = 'expired'"))).toBe(true);

    // The auto-offer minted a fresh token for the next-in-line entry on the one open, non-empty,
    // not-already-offered class only.
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO class_offers'));
    expect(insert?.args).toEqual([expect.any(String), 'wait-next', OPEN_CLASS.id, 'system:cron', expect.any(String)]);

    // `hasActiveOfferForClass` is only ever asked about the open class: a full class or one with
    // no waitlist never reaches it.
    const activeOfferChecks = calls.filter((c) => c.sql.includes('FROM class_offers WHERE class_id'));
    expect(activeOfferChecks).toHaveLength(1);
    expect(activeOfferChecks[0].args).toEqual([OPEN_CLASS.id]);
  });

  it('skips a class that already has an active offer outstanding, offering nothing new', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM classes': [OPEN_CLASS],
      },
      firstResults: {
        'FROM class_offers WHERE class_id': { one: 1 },
      },
    });

    const summary = await expireStaleOffersJob.run({}, { db, now: new Date('2026-07-07T00:00:00Z') });

    expect(summary).toEqual({ examined: 1, acted: 0, detail: 'expired=0 auto-offered=0' });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(false);
  });

  const CLASS_OFFER_TEMPLATE_ROW = {
    id: 'class_offer',
    subject: 'A spot is open -- {{item_display_name}}',
    reply_to: 'program-committee@aksailingclub.org',
    body: 'Hi {{person_name}}, claim: {{claim_url}} (expires {{expires_at}})',
    updated_at: '2026-07-07 00:00:00',
    updated_by: 'authored:pass-2-2',
  };

  it('notifies the next waitlisted entry when both EMAIL and PUBLIC_ORIGIN are wired', async () => {
    let sent: { to: string; text: string } | undefined;
    const send = async (message: { to: string; text: string }) => {
      sent = message;
    };
    const { db } = fakeD1({
      allResults: {
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM classes': [OPEN_CLASS],
        'FROM class_waitlist WHERE class_id': [{ id: 'wait-next', class_id: OPEN_CLASS.id, position: 1 }],
      },
      firstResults: {
        'FROM class_offers WHERE class_id': null,
        'FROM classes WHERE id': OPEN_CLASS,
        'FROM class_waitlist WHERE id': { class_id: OPEN_CLASS.id, member_id: null, applicant_name: 'Jamie', applicant_email: 'jamie@example.com' },
        'FROM class_offers WHERE waitlist_id': null,
        "'offer_window_hours'": { value: '72' },
        'FROM email_templates': CLASS_OFFER_TEMPLATE_ROW,
      },
    });

    await expireStaleOffersJob.run({ EMAIL: { send }, PUBLIC_ORIGIN: 'https://dev.aksailingclub.org' }, { db, now: new Date() });

    expect(sent?.to).toBe('jamie@example.com');
    expect(sent?.text).toContain('https://dev.aksailingclub.org/classes/offer/');
  });

  it('never resolves a contact or attempts a send when EMAIL or PUBLIC_ORIGIN is missing', async () => {
    const { db, calls } = fakeD1({
      allResults: {
        'FROM class_offers WHERE resolved IS NULL': [],
        'FROM classes': [OPEN_CLASS],
        'FROM class_waitlist WHERE class_id': [{ id: 'wait-next', class_id: OPEN_CLASS.id, position: 1 }],
      },
      firstResults: {
        'FROM class_offers WHERE class_id': null,
        'FROM classes WHERE id': OPEN_CLASS,
        'FROM class_waitlist WHERE id': { class_id: OPEN_CLASS.id, member_id: null, applicant_name: 'Jamie', applicant_email: 'jamie@example.com' },
        'FROM class_offers WHERE waitlist_id': null,
        "'offer_window_hours'": { value: '72' },
      },
    });

    // No PUBLIC_ORIGIN: `notify` stays undefined, so `offerSpot` never even looks up a template.
    const summary = await expireStaleOffersJob.run({}, { db, now: new Date() });

    expect(summary.acted).toBe(1); // the offer itself still mints; only the notify is gated
    expect(calls.some((c) => c.sql.includes('email_templates') || c.sql.includes('email_log'))).toBe(false);
  });
});
