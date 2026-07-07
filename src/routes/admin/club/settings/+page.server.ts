// The Club section's Settings screen (Task 4, extended pass 2.2): role management (grant,
// change, or revoke an owner/admin seat by email), the waitlist offer window, the three
// membership tier prices, and the season rollover. The parent layout guard
// (../+layout.server.ts) admits any club role into this section, so an admin can still see the
// roster and every current value; every WRITE here is owner-only through `clubAdminAction`'s
// `ownerOnly` option (Task 6's rider 1), since granting or revoking a seat, changing a price, and
// rolling the season over are all a different trust level than the day-to-day admin work the
// rest of Club allows.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import {
  getClubRole,
  LastOwnerError,
  listClubRoles,
  removeClubRole,
  resolveClubDb,
  setClubRole,
  type ClubRoleGrant,
} from '$admin-club/lib/club-roles';
import { getOfferWindowHours, getTierPrices, setOfferWindowHours, setTierPrice } from '$admin-club/lib/club-settings';
import type { MembershipTier } from '$admin-club/lib/demo-members';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { getRolloverPreview, runSeasonRollover, SeasonMismatchError, type RolloverPreview } from '$admin-club/lib/rollover';

export const load: PageServerLoad = async (event) => {
  const editor = requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return {
      roles: [] as ClubRoleGrant[],
      offerWindowHours: null,
      tierPrices: null,
      rollover: null as RolloverPreview | null,
      isOwner: false,
      error: 'CLUB_DB is not bound.',
    };
  }
  const [roles, offerWindowHours, tierPrices, rollover, role] = await Promise.all([
    listClubRoles(db),
    getOfferWindowHours(db),
    getTierPrices(db),
    getRolloverPreview(db),
    getClubRole(db, editor.email),
  ]);
  return { roles, offerWindowHours, tierPrices, rollover, isOwner: role === 'owner', error: null as string | null };
};

const TIER_FIELD: Record<MembershipTier, string> = {
  individual: 'individual',
  family: 'family',
  'young-adult': 'youngAdult',
};

/** Parse one tier's submitted price as a positive whole-dollar integer, or an error string
 *  naming which tier failed (so the action can report exactly one bad field, not a generic
 *  refusal). */
function parseTierPrice(form: FormData, tier: MembershipTier): number | { error: string } {
  const raw = form.get(TIER_FIELD[tier]);
  const dollars = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(dollars) || dollars <= 0) {
    return { error: `Enter a whole-dollar price for the ${tier} tier.` };
  }
  return dollars;
}

/** A real type predicate (unlike a bare `typeof v === 'object'` inline check), since TypeScript's
 *  `in` operator narrowing refuses a union that includes a primitive like `number`. */
function isTierPriceError(value: number | { error: string }): value is { error: string } {
  return typeof value === 'object';
}

const ROLE_DENIED_MESSAGE = 'Only a club owner can manage roles.';

export const actions: Actions = {
  setRole: clubAdminAction(
    async ({ form, ctx }) => {
      const email = form.get('email');
      const role = form.get('role');
      if (typeof email !== 'string' || !email.trim() || (role !== 'owner' && role !== 'admin')) {
        ctx.audit({ action: 'set-role', entity: 'club-role', detail: 'rejected: bad input' });
        return fail(400, { error: 'A valid email and role are required.' });
      }
      const grantedEmail = email.trim();
      try {
        await setClubRole(ctx.db, grantedEmail, role, ctx.editor.email);
      } catch (err) {
        if (err instanceof LastOwnerError) {
          ctx.audit({ action: 'set-role', entity: 'club-role', entityId: grantedEmail, detail: 'rejected: last owner' });
          return fail(400, { error: err.message });
        }
        throw err;
      }
      ctx.audit({ action: 'set-role', entity: 'club-role', entityId: grantedEmail, detail: role });
      return { ok: true };
    },
    { ownerOnly: true, action: 'set-role', entity: 'club-role', deniedMessage: ROLE_DENIED_MESSAGE },
  ),

  removeRole: clubAdminAction(
    async ({ form, ctx }) => {
      const email = form.get('email');
      if (typeof email !== 'string' || !email.trim()) {
        ctx.audit({ action: 'remove-role', entity: 'club-role', detail: 'rejected: missing email' });
        return fail(400, { error: 'An email is required.' });
      }
      const revokedEmail = email.trim();
      try {
        await removeClubRole(ctx.db, revokedEmail);
      } catch (err) {
        if (err instanceof LastOwnerError) {
          ctx.audit({ action: 'remove-role', entity: 'club-role', entityId: revokedEmail, detail: 'rejected: last owner' });
          return fail(400, { error: err.message });
        }
        throw err;
      }
      ctx.audit({ action: 'remove-role', entity: 'club-role', entityId: revokedEmail });
      return { ok: true };
    },
    { ownerOnly: true, action: 'remove-role', entity: 'club-role', deniedMessage: ROLE_DENIED_MESSAGE },
  ),

  updateOfferWindow: clubAdminAction(
    async ({ form, ctx }) => {
      const raw = form.get('offerWindowHours');
      const hours = typeof raw === 'string' ? Number(raw) : NaN;
      if (!Number.isInteger(hours) || hours <= 0) {
        ctx.audit({ action: 'update-offer-window', entity: 'setting', detail: 'rejected: invalid hours' });
        return fail(400, { error: 'Enter a whole number of hours greater than zero.' });
      }
      await setOfferWindowHours(ctx.db, hours, ctx.editor.email);
      ctx.audit({
        action: 'update-offer-window',
        entity: 'setting',
        entityId: 'offer_window_hours',
        detail: String(hours),
      });
      return { ok: true };
    },
    { ownerOnly: true, action: 'update-offer-window', entity: 'setting', deniedMessage: 'Only a club owner can change this setting.' },
  ),

  updateTierPrices: clubAdminAction(
    async ({ form, ctx }) => {
      const individual = parseTierPrice(form, 'individual');
      if (isTierPriceError(individual)) {
        ctx.audit({ action: 'update-tier-prices', entity: 'setting', detail: `rejected: ${individual.error}` });
        return fail(400, { error: individual.error });
      }
      const family = parseTierPrice(form, 'family');
      if (isTierPriceError(family)) {
        ctx.audit({ action: 'update-tier-prices', entity: 'setting', detail: `rejected: ${family.error}` });
        return fail(400, { error: family.error });
      }
      const youngAdult = parseTierPrice(form, 'young-adult');
      if (isTierPriceError(youngAdult)) {
        ctx.audit({ action: 'update-tier-prices', entity: 'setting', detail: `rejected: ${youngAdult.error}` });
        return fail(400, { error: youngAdult.error });
      }
      await Promise.all([
        setTierPrice(ctx.db, 'individual', individual, ctx.editor.email),
        setTierPrice(ctx.db, 'family', family, ctx.editor.email),
        setTierPrice(ctx.db, 'young-adult', youngAdult, ctx.editor.email),
      ]);
      ctx.audit({
        action: 'update-tier-prices',
        entity: 'setting',
        detail: `individual=${individual}, family=${family}, young-adult=${youngAdult}`,
      });
      return { ok: true };
    },
    { ownerOnly: true, action: 'update-tier-prices', entity: 'setting', deniedMessage: 'Only a club owner can change tier prices.' },
  ),

  rollover: clubAdminAction(
    async ({ form, ctx }) => {
      const typedYear = form.get('typedYear');
      if (typeof typedYear !== 'string' || !typedYear.trim()) {
        ctx.audit({ action: 'season-rollover', entity: 'season', detail: 'rejected: no year typed' });
        return fail(400, { error: 'Type the new season year to confirm.' });
      }
      try {
        const result = await runSeasonRollover(ctx.db, { typedYear, confirmedBy: ctx.editor.email });
        // No separate ctx.audit call here: runSeasonRollover's own db.batch already wrote the
        // authoritative, atomic audit_log row (rollover.ts's own header on why that write can't
        // ride the engine's fire-and-forget auditSink). adminAction still requires at least one
        // ctx.audit emit per handler (its own unconditional contract), so this records a lighter,
        // structurally-required companion entry rather than skip the requirement.
        ctx.audit({ action: 'season-rollover', entity: 'season', entityId: String(result.nextSeason) });
        return { ok: true, rollover: result };
      } catch (err) {
        if (err instanceof SeasonMismatchError) {
          ctx.audit({ action: 'season-rollover', entity: 'season', detail: `rejected: ${err.message}` });
          return fail(400, { error: err.message });
        }
        throw err;
      }
    },
    { ownerOnly: true, action: 'season-rollover', entity: 'season', deniedMessage: 'Only a club owner can roll the season over.' },
  ),
};
