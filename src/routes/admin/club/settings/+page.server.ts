// The Club section's Settings screen (Task 4): role management (grant, change, or revoke an
// owner/admin seat by email) and the waitlist offer window. The parent layout guard
// (../+layout.server.ts) admits any club role into this section, so an admin can still see the
// roster and the window's current value; every WRITE here independently re-checks the acting
// editor's own club role and refuses (403) anyone but an owner, since granting or revoking a
// seat is a different trust level than the day-to-day admin work the rest of Club allows.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminAction, requireSession } from '@glw907/cairn-cms/sveltekit';
import {
  getClubRole,
  LastOwnerError,
  listClubRoles,
  removeClubRole,
  resolveClubDb,
  setClubRole,
  type ClubRoleGrant,
} from '$admin-club/lib/club-roles';
import { getOfferWindowHours, setOfferWindowHours } from '$admin-club/lib/club-settings';

export const load: PageServerLoad = async (event) => {
  const editor = requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { roles: [] as ClubRoleGrant[], offerWindowHours: null, isOwner: false, error: 'CLUB_DB is not bound.' };
  }
  const [roles, offerWindowHours, role] = await Promise.all([
    listClubRoles(db),
    getOfferWindowHours(db),
    getClubRole(db, editor.email),
  ]);
  return { roles, offerWindowHours, isOwner: role === 'owner', error: null as string | null };
};

/** A missing `CLUB_DB` binding is a deployment misconfiguration, not a normal refusal; every
 *  action fails the same way and still audits the rejected attempt. */
const MISSING_DB = { error: 'CLUB_DB is not bound.' } as const;

export const actions: Actions = {
  setRole: adminAction(async ({ event, form, ctx }) => {
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'set-role', entity: 'club-role', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, MISSING_DB);
    }
    if ((await getClubRole(db, ctx.editor.email)) !== 'owner') {
      ctx.audit({ action: 'set-role', entity: 'club-role', detail: 'rejected: not owner' });
      return fail(403, { error: 'Only a club owner can manage roles.' });
    }
    const email = form.get('email');
    const role = form.get('role');
    if (typeof email !== 'string' || !email.trim() || (role !== 'owner' && role !== 'admin')) {
      ctx.audit({ action: 'set-role', entity: 'club-role', detail: 'rejected: bad input' });
      return fail(400, { error: 'A valid email and role are required.' });
    }
    const grantedEmail = email.trim();
    try {
      await setClubRole(db, grantedEmail, role, ctx.editor.email);
    } catch (err) {
      if (err instanceof LastOwnerError) {
        ctx.audit({ action: 'set-role', entity: 'club-role', entityId: grantedEmail, detail: 'rejected: last owner' });
        return fail(400, { error: err.message });
      }
      throw err;
    }
    ctx.audit({ action: 'set-role', entity: 'club-role', entityId: grantedEmail, detail: role });
    return { ok: true };
  }),

  removeRole: adminAction(async ({ event, form, ctx }) => {
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'remove-role', entity: 'club-role', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, MISSING_DB);
    }
    if ((await getClubRole(db, ctx.editor.email)) !== 'owner') {
      ctx.audit({ action: 'remove-role', entity: 'club-role', detail: 'rejected: not owner' });
      return fail(403, { error: 'Only a club owner can manage roles.' });
    }
    const email = form.get('email');
    if (typeof email !== 'string' || !email.trim()) {
      ctx.audit({ action: 'remove-role', entity: 'club-role', detail: 'rejected: missing email' });
      return fail(400, { error: 'An email is required.' });
    }
    const revokedEmail = email.trim();
    try {
      await removeClubRole(db, revokedEmail);
    } catch (err) {
      if (err instanceof LastOwnerError) {
        ctx.audit({ action: 'remove-role', entity: 'club-role', entityId: revokedEmail, detail: 'rejected: last owner' });
        return fail(400, { error: err.message });
      }
      throw err;
    }
    ctx.audit({ action: 'remove-role', entity: 'club-role', entityId: revokedEmail });
    return { ok: true };
  }),

  updateOfferWindow: adminAction(async ({ event, form, ctx }) => {
    const db = resolveClubDb(event.platform?.env);
    if (!db) {
      ctx.audit({ action: 'update-offer-window', entity: 'setting', detail: 'rejected: CLUB_DB not bound' });
      return fail(500, MISSING_DB);
    }
    if ((await getClubRole(db, ctx.editor.email)) !== 'owner') {
      ctx.audit({ action: 'update-offer-window', entity: 'setting', detail: 'rejected: not owner' });
      return fail(403, { error: 'Only a club owner can change this setting.' });
    }
    const raw = form.get('offerWindowHours');
    const hours = typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isInteger(hours) || hours <= 0) {
      ctx.audit({ action: 'update-offer-window', entity: 'setting', detail: 'rejected: invalid hours' });
      return fail(400, { error: 'Enter a whole number of hours greater than zero.' });
    }
    await setOfferWindowHours(db, hours, ctx.editor.email);
    ctx.audit({
      action: 'update-offer-window',
      entity: 'setting',
      entityId: 'offer_window_hours',
      detail: String(hours),
    });
    return { ok: true };
  }),
};
