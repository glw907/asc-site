// The same-price transfer flow (Classes pass Task 5, docs/2026-07-21-classes-pass-design.md):
// `transferEnrollment` (the store function) plus the `?/transfer` route action that wraps it.
// Mirrors `classes-detail.test.ts`'s own combined store-then-route-action shape.
import { describe, expect, it } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/classes/[id]/+page.server';
import { transferEnrollment } from '$admin-club/lib/class-transfer';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

function rawClass(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 'x',
    season: 2026,
    name: 'X',
    slug: 'x',
    track: 'adult-teen',
    capacity: 10,
    fee: 150,
    start_date: null,
    end_date: null,
    location: null,
    description: null,
    instructor_notes: null,
    custom_note: null,
    hero_image: null,
    hero_image_alt: null,
    visible: 1 as const,
    drop_in: 0 as const,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

const SOURCE = rawClass({ id: 'wed-keelboat', name: 'Wednesday Keelboat', slug: 'wed-keelboat', fee: 150 });
const DEST_SAME_FEE = rawClass({ id: 'thu-keelboat', name: 'Thursday Keelboat', slug: 'thu-keelboat', fee: 150 });
const DEST_DIFF_FEE = rawClass({ id: 'thu-keelboat', name: 'Thursday Keelboat', slug: 'thu-keelboat', fee: 200 });

const ENROLLMENT_ROW = { id: 'enr-1', class_id: SOURCE.id, member_id: 'mem-1', household_id: 'hh-1' };

/** Every fixture `transferEnrollment` needs before it reaches its own domain write: the
 *  enrollment lookup, both classes (a function-responder keyed on the bound `id`, since source
 *  and destination share the same query text -- `_fake-d1.ts`'s own header names this exact
 *  shape), their (unused-by-guard-logic) counts, and no destination duplicate. Each test overrides
 *  only what it needs to differ. */
function baseFixture(destRow: ReturnType<typeof rawClass>) {
  return {
    'FROM class_enrollments e JOIN members m': ENROLLMENT_ROW,
    'FROM classes WHERE id': (args: unknown[]) => (args[0] === SOURCE.id ? SOURCE : args[0] === destRow.id ? destRow : null),
    'FROM class_enrollments WHERE class_id = ?1': { n: 3 },
    // `countWaitlist`'s own `... WHERE class_id = ?1` (unused by any of this module's own guard
    // logic) is deliberately left unfixtured: fakeD1's `null` fallback resolves to a waitlist
    // count of 0 either way, and defining it here would collide as a substring prefix of
    // `triggerFreedSpotOffer`'s own next-in-line read below (`_fake-d1.ts`'s own "two keys can
    // collide when one is a prefix of the other" trap) -- `ORDER BY position ASC LIMIT 1` is the
    // one, deliberately disjoint substring that query alone carries.
    'FROM class_enrollments ce': null,
    'ORDER BY position ASC LIMIT 1': null,
  };
}

describe('transferEnrollment', () => {
  it('moves a same-fee enrollment: UPDATEs class_id only, records a zero-amount void ledger entry', async () => {
    const { db, calls } = fakeD1({ firstResults: baseFixture(DEST_SAME_FEE) });
    const result = await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ ok: true, autoOfferedTo: null });

    const update = calls.find((c) => c.sql.startsWith('UPDATE class_enrollments'));
    expect(update?.sql).toBe('UPDATE class_enrollments SET class_id = ?1 WHERE id = ?2');
    expect(update?.args).toEqual([DEST_SAME_FEE.id, 'enr-1']);

    const txInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txInsert?.args).toContain(0);
    expect(txInsert?.args).toContain('hh-1');
    expect(txInsert?.args).toContain('other');
    expect(txInsert?.args).toContain('Transfer: Wednesday Keelboat -> Thursday Keelboat');
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO transaction_lines'))).toBe(false);
  });

  it('carries fee_paid, stripe_ref, guardian_contact, interests, and enrolled_at for free: the ' +
    'UPDATE never names them, only class_id', async () => {
    const { db, calls } = fakeD1({ firstResults: baseFixture(DEST_SAME_FEE) });
    await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    const update = calls.find((c) => c.sql.startsWith('UPDATE class_enrollments'));
    for (const column of ['fee_paid', 'stripe_ref', 'guardian_contact', 'interests', 'enrolled_at']) {
      expect(update?.sql).not.toContain(column);
    }
  });

  it('refuses an unknown enrollment, writing nothing', async () => {
    const { db, calls } = fakeD1({ firstResults: { 'FROM class_enrollments e JOIN members m': null } });
    const result = await transferEnrollment(db, { enrollmentId: 'nope', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ error: 'No such enrollment.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('refuses a fee mismatch without confirmFeeMismatch, naming the exact difference', async () => {
    const { db, calls } = fakeD1({ firstResults: baseFixture(DEST_DIFF_FEE) });
    const result = await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_DIFF_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ error: 'Wednesday Keelboat is $150; Thursday Keelboat is $200. Confirm to move anyway.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('proceeds on a fee mismatch once confirmFeeMismatch is set, the memo recording the ' +
    'confirmed difference', async () => {
    const { db, calls } = fakeD1({ firstResults: baseFixture(DEST_DIFF_FEE) });
    const result = await transferEnrollment(db, {
      enrollmentId: 'enr-1',
      destinationClassId: DEST_DIFF_FEE.id,
      actorEmail: 'admin@example.com',
      confirmFeeMismatch: true,
    });
    expect(result).toEqual({ ok: true, autoOfferedTo: null });
    const txInsert = calls.find((c) => c.sql.startsWith('INSERT INTO transactions'));
    expect(txInsert?.args).toContain('Transfer: Wednesday Keelboat ($150) -> Thursday Keelboat ($200), difference confirmed and settled out-of-band');
  });

  it('refuses a duplicate (the destination already holds this member) as a friendly error, ' +
    'never a 500 from the schema\'s own UNIQUE constraint', async () => {
    const { db, calls } = fakeD1({ firstResults: { ...baseFixture(DEST_SAME_FEE), 'FROM class_enrollments ce': { n: 1 } } });
    const result = await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ error: 'Already enrolled in Thursday Keelboat.' });
    expect(calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('triggers the source\'s freed-spot auto-offer when its waitlist is nonempty', async () => {
    const { db, calls } = fakeD1({
      firstResults: {
        ...baseFixture(DEST_SAME_FEE),
        'ORDER BY position ASC LIMIT 1': { id: 'wait-1' },
        'FROM class_waitlist WHERE id': { class_id: SOURCE.id, member_id: 'mem-2', applicant_name: null, applicant_email: null },
        'FROM class_offers WHERE waitlist_id': null,
      },
    });
    const result = await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ ok: true, autoOfferedTo: 'wait-1' });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(true);
  });

  it('reports no auto-offer, and mints no offer, when the source\'s waitlist is empty', async () => {
    const { db, calls } = fakeD1({ firstResults: baseFixture(DEST_SAME_FEE) });
    const result = await transferEnrollment(db, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id, actorEmail: 'admin@example.com' });
    expect(result).toEqual({ ok: true, autoOfferedTo: null });
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO class_offers'))).toBe(false);
  });
});

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
const noRole: Editor = { email: 'no-role@example.com', displayName: 'No Role', role: 'Instructor', capability: 'none' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type DetailActionEvent = Parameters<typeof actions.transfer>[0];

/** Mirrors `classes-detail.test.ts`'s own `postEvent`. */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; id?: string; auditSink?: (record: AdminActionAuditRecord) => void } = {},
) {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/classes';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    params: { id: opts.id ?? SOURCE.id },
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as DetailActionEvent;
}

describe('transfer action', () => {
  it('refuses an editor with no club role (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.transfer(postEvent(noRole, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('fails 400 when destinationClassId is missing, auditing the rejected attempt', async () => {
    const { db } = fakeD1();
    const calls: AdminActionAuditRecord[] = [];
    const result = await actions.transfer(postEvent(admin, { enrollmentId: 'enr-1' }, { db, auditSink: (record) => calls.push(record) }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(calls).toContainEqual(expect.objectContaining({ action: 'transfer', entity: 'enrollment' }));
  });

  it('succeeds, auditing the source, destination, and enrollment', async () => {
    const { db } = fakeD1({ firstResults: baseFixture(DEST_SAME_FEE) });
    const auditCalls: AdminActionAuditRecord[] = [];
    const result = await actions.transfer(
      postEvent(admin, { enrollmentId: 'enr-1', destinationClassId: DEST_SAME_FEE.id }, { db, auditSink: (record) => auditCalls.push(record) }),
    );
    expect(result).toEqual({ ok: true, transferred: true });
    expect(auditCalls).toContainEqual(
      expect.objectContaining({ action: 'transfer', entity: 'enrollment', entityId: 'enr-1', detail: `to=${DEST_SAME_FEE.id}` }),
    );
  });

  it('fails 400 and audits the rejection on a fee mismatch with no confirmation', async () => {
    const { db } = fakeD1({ firstResults: baseFixture(DEST_DIFF_FEE) });
    const auditCalls: AdminActionAuditRecord[] = [];
    const result = await actions.transfer(
      postEvent(admin, { enrollmentId: 'enr-1', destinationClassId: DEST_DIFF_FEE.id }, { db, auditSink: (record) => auditCalls.push(record) }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(auditCalls).toContainEqual(expect.objectContaining({ action: 'transfer', entity: 'enrollment', entityId: 'enr-1' }));
  });
});
