import { describe, expect, it, vi } from 'vitest';
import { isActionFailure } from '@sveltejs/kit';
import type { Editor } from '@glw907/cairn-cms';
import type { AdminActionAuditRecord } from '@glw907/cairn-cms/sveltekit';
import { actions } from '../routes/admin/club/settings/+page.server';
import { access } from '$theme/cairn.config.js';
import { fakeD1 } from './_fake-d1';

const admin: Editor = { email: 'admin@example.com', displayName: 'Admin', role: 'Club manager', capability: 'editor' };
// `clubAdminAction`'s ownerOnly gate now reads the engine's own verified `capability`
// (initiative 5 Task 2), not a `club_roles` DB row, so this fixture carries owner capability
// directly rather than relying on the fake DB response to distinguish it from `admin`. Named
// `'Administrator'` (T2, docs/2026-07-19-asc-roles-adoption.md): the reserved `owner` role stays
// declared but carries no club access, so a fixture exercising the granted ownerOnly path must use
// the real granted owner-capability role name, not the phantom.
const owner: Editor = { email: 'owner@example.com', displayName: 'Owner', role: 'Administrator', capability: 'owner' };

const CSRF_COOKIE_NAME = '__Host-cairn_csrf';
const CSRF_TOKEN = 'test-csrf-token';

type SettingsActionEvent = Parameters<typeof actions.updateOfferWindow>[0];

/** A fake POST event carrying exactly what `adminAction` and these handlers read, plus the
 *  `CLUB_DB` binding the handlers resolve off `event.platform.env` (see `resolveClubDb`'s own
 *  header comment for why that read needs a cast rather than a typed field). */
function postEvent(
  editor: Editor | null,
  fields: Record<string, string>,
  opts: { db?: unknown; auditSink?: (record: AdminActionAuditRecord) => void } = {},
): SettingsActionEvent {
  const formData = new FormData();
  formData.set('csrf', CSRF_TOKEN);
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  const url = 'https://x.dev/admin/club/settings';
  const request = new Request(url, { method: 'POST', body: formData });
  return {
    url: new URL(url),
    request,
    cookies: {
      get: (name: string) => (name === CSRF_COOKIE_NAME ? CSRF_TOKEN : undefined),
      set: () => undefined,
      delete: () => undefined,
    },
    platform: { env: { CLUB_DB: opts.db } },
    locals: { editor, auditSink: opts.auditSink, cairnAccess: access },
  } as unknown as SettingsActionEvent;
}

describe('club settings actions: owner gate', () => {
  it('updateOfferWindow refuses a club admin (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.updateOfferWindow(postEvent(admin, { offerWindowHours: '48' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('updateOfferWindow fails 400 on a non-positive-integer value, still audited', async () => {
    const { db } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateOfferWindow(
      postEvent(owner, { offerWindowHours: 'not-a-number' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update-offer-window', entity: 'setting', editor: owner.email }),
    );
  });

  it('updateOfferWindow succeeds for an owner and audits the new value', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateOfferWindow(
      postEvent(owner, { offerWindowHours: '48' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') && c.args[0] === '48')).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'update-offer-window',
      entity: 'setting',
      entityId: 'offer_window_hours',
      detail: '48',
      editor: owner.email,
    });
  });

  it('updateClassRegistrationOpens refuses a club admin (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.updateClassRegistrationOpens(
      postEvent(admin, { classRegistrationOpens: '2026-03-15' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('updateClassRegistrationOpens fails 400 on a malformed date, still audited, and writes nothing', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateClassRegistrationOpens(
      postEvent(owner, { classRegistrationOpens: 'not-a-date' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update-class-registration-opens', entity: 'setting', editor: owner.email }),
    );
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings'))).toBe(false);
  });

  it('updateClassRegistrationOpens succeeds for an owner with a valid date and audits it', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateClassRegistrationOpens(
      postEvent(owner, { classRegistrationOpens: '2026-03-15' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') && c.args[0] === '2026-03-15')).toBe(true);
    expect(sink).toHaveBeenCalledWith({
      action: 'update-class-registration-opens',
      entity: 'setting',
      entityId: 'class_registration_opens',
      detail: '2026-03-15',
      editor: owner.email,
    });
  });

  it('updateClassRegistrationOpens succeeds for an owner clearing the gate to an empty string', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateClassRegistrationOpens(
      postEvent(owner, { classRegistrationOpens: '' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') && c.args[0] === '')).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update-class-registration-opens', detail: 'cleared', editor: owner.email }),
    );
  });

  it('updateTierPrices refuses a club admin (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.updateTierPrices(
      postEvent(admin, { individual: '250', family: '500', youngAdult: '100' }, { db }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('updateTierPrices fails 400 on a non-positive-integer tier price, still audited, and writes nothing', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateTierPrices(
      postEvent(owner, { individual: '250', family: 'not-a-number', youngAdult: '100' }, { db, auditSink: sink }),
    );
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'update-tier-prices', editor: owner.email }));
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings'))).toBe(false);
  });

  it('updateTierPrices succeeds for an owner, writing all three tiers and auditing once', async () => {
    const { db, calls } = fakeD1();
    const sink = vi.fn();
    const result = await actions.updateTierPrices(
      postEvent(owner, { individual: '275', family: '525', youngAdult: '110' }, { db, auditSink: sink }),
    );
    expect(result).toEqual({ ok: true });
    const writes = calls.filter((c) => c.sql.startsWith('UPDATE settings'));
    expect(writes).toHaveLength(3);
    expect(writes.map((w) => w.args[0]).sort()).toEqual(['110', '275', '525']);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update-tier-prices',
        entity: 'setting',
        detail: 'individual=275, family=525, young-adult=110',
        editor: owner.email,
      }),
    );
  });

  it('rollover refuses a club admin (403)', async () => {
    const { db } = fakeD1();
    const result = await actions.rollover(postEvent(admin, { typedYear: '2027' }, { db }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(403);
  });

  it('rollover fails 400 on a mismatched typed year, still audited, and writes nothing', async () => {
    const { db, calls } = fakeD1({
      firstResults: { "key = 'current_season'": { value: '2026' }, 'FROM classes': { n: 0 }, 'FROM class_waitlist': { n: 0 } },
    });
    const sink = vi.fn();
    const result = await actions.rollover(postEvent(owner, { typedYear: '2099' }, { db, auditSink: sink }));
    expect(isActionFailure(result)).toBe(true);
    expect((result as { status: number }).status).toBe(400);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ action: 'season-rollover', editor: owner.email }));
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') || c.sql.startsWith('INSERT INTO audit_log'))).toBe(
      false,
    );
  });

  it('rollover succeeds for an owner with the correctly typed year, auditing the advance', async () => {
    const { db, calls } = fakeD1({
      firstResults: { "key = 'current_season'": { value: '2026' }, 'FROM classes': { n: 4 }, 'FROM class_waitlist': { n: 9 } },
    });
    const sink = vi.fn();
    const result = await actions.rollover(postEvent(owner, { typedYear: '2027' }, { db, auditSink: sink }));
    expect(result).toEqual({
      ok: true,
      rollover: { nextSeason: 2027, classesFallingOutOfCurrency: 4, waitlistFallingOutOfCurrency: 9 },
    });
    expect(calls.some((c) => c.sql.startsWith('UPDATE settings') && c.args[0] === '2027')).toBe(true);
    expect(calls.some((c) => c.sql.startsWith('INSERT INTO audit_log') && c.args[1] === 'season-rollover')).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'season-rollover', entityId: '2027', editor: owner.email }),
    );
  });
});
