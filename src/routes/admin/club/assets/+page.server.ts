// The Club section's Assets screen (Part 2): the by-asset and by-person lenses over the same
// active-assignment read, the single polymorphic waitlist queue, and every write path (assign,
// release, record a payment, add/remove/move-to-end on the waitlist), all gated the same
// `clubAdminAction` way Classes and Events already establish. Replaces the structural placeholder
// this route previously shipped.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import {
  addToWaitlist,
  assignAsset,
  getAssignment,
  getWaitlistEntry,
  listActiveAssignments,
  listAssetTypes,
  listAssetWaitlist,
  listMemberOptions,
  listMembershipOptions,
  moveToEndOfWaitlist,
  recordPayment,
  releaseAssignment,
  removeFromWaitlist,
  type AssetTypeRow,
  type AssetWaitlistDisplayRow,
  type AssignmentDisplayRow,
  type MemberOption,
  type MembershipOption,
} from '$admin-club/lib/assets-store';
import { parseAssignForm, parsePaymentForm, parseWaitlistAddForm } from './assets-form-input';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return {
      assetTypes: [] as AssetTypeRow[],
      assignments: [] as AssignmentDisplayRow[],
      waitlist: [] as AssetWaitlistDisplayRow[],
      membershipOptions: [] as MembershipOption[],
      memberOptions: [] as MemberOption[],
      currentSeason: 0,
      error: 'CLUB_DB is not bound.',
    };
  }
  const currentSeason = await getCurrentSeason(db);
  const [assetTypes, assignments, waitlist, membershipOptions, memberOptions] = await Promise.all([
    listAssetTypes(db),
    listActiveAssignments(db, currentSeason),
    listAssetWaitlist(db),
    listMembershipOptions(db, currentSeason),
    listMemberOptions(db),
  ]);
  return { assetTypes, assignments, waitlist, membershipOptions, memberOptions, currentSeason, error: null as string | null };
};

const DENIED_MESSAGE = 'A club role is required to manage assets.';

export const actions: Actions = {
  assign: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseAssignForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'assign', entity: 'assignment', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = await assignAsset(ctx.db, parsed);
      ctx.audit({ action: 'assign', entity: 'assignment', entityId: id });
      return { ok: true };
    },
    { action: 'assign', entity: 'assignment', deniedMessage: DENIED_MESSAGE },
  ),

  release: clubAdminAction(
    async ({ form, ctx }) => {
      const id = form.get('assignmentId');
      if (typeof id !== 'string' || !id.trim()) {
        ctx.audit({ action: 'release', entity: 'assignment', detail: 'rejected: missing assignmentId' });
        return fail(400, { error: 'An assignment is required.' });
      }
      const existing = await getAssignment(ctx.db, id);
      if (!existing) {
        ctx.audit({ action: 'release', entity: 'assignment', entityId: id, detail: 'rejected: no such assignment' });
        return fail(404, { error: 'No such assignment.' });
      }
      await releaseAssignment(ctx.db, id);
      ctx.audit({ action: 'release', entity: 'assignment', entityId: id });
      return { ok: true };
    },
    { action: 'release', entity: 'assignment', deniedMessage: DENIED_MESSAGE },
  ),

  recordPayment: clubAdminAction(
    async ({ form, ctx }) => {
      const assignmentId = form.get('assignmentId');
      if (typeof assignmentId !== 'string' || !assignmentId.trim()) {
        ctx.audit({ action: 'record-payment', entity: 'asset-payment', detail: 'rejected: missing assignmentId' });
        return fail(400, { error: 'An assignment is required.' });
      }
      const existing = await getAssignment(ctx.db, assignmentId);
      if (!existing) {
        ctx.audit({ action: 'record-payment', entity: 'asset-payment', entityId: assignmentId, detail: 'rejected: no such assignment' });
        return fail(404, { error: 'No such assignment.' });
      }
      const parsed = parsePaymentForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'record-payment', entity: 'asset-payment', entityId: assignmentId, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const currentSeason = await getCurrentSeason(ctx.db);
      await recordPayment(ctx.db, { assignmentId, season: currentSeason, ...parsed });
      ctx.audit({ action: 'record-payment', entity: 'asset-payment', entityId: assignmentId, detail: `method=${parsed.method}` });
      return { ok: true };
    },
    { action: 'record-payment', entity: 'asset-payment', deniedMessage: DENIED_MESSAGE },
  ),

  waitlistAdd: clubAdminAction(
    async ({ form, ctx }) => {
      const parsed = parseWaitlistAddForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'add', entity: 'asset-waitlist', detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      const id = await addToWaitlist(ctx.db, parsed);
      ctx.audit({ action: 'add', entity: 'asset-waitlist', entityId: id });
      return { ok: true };
    },
    { action: 'add', entity: 'asset-waitlist', deniedMessage: DENIED_MESSAGE },
  ),

  waitlistRemove: clubAdminAction(
    async ({ form, ctx }) => {
      const id = form.get('waitlistId');
      if (typeof id !== 'string' || !id.trim()) {
        ctx.audit({ action: 'remove', entity: 'asset-waitlist', detail: 'rejected: missing waitlistId' });
        return fail(400, { error: 'A waitlist entry is required.' });
      }
      await removeFromWaitlist(ctx.db, id);
      ctx.audit({ action: 'remove', entity: 'asset-waitlist', entityId: id });
      return { ok: true };
    },
    { action: 'remove', entity: 'asset-waitlist', deniedMessage: DENIED_MESSAGE },
  ),

  waitlistMoveToEnd: clubAdminAction(
    async ({ form, ctx }) => {
      const id = form.get('waitlistId');
      if (typeof id !== 'string' || !id.trim()) {
        ctx.audit({ action: 'reorder', entity: 'asset-waitlist', detail: 'rejected: missing waitlistId' });
        return fail(400, { error: 'A waitlist entry is required.' });
      }
      const existing = await getWaitlistEntry(ctx.db, id);
      if (!existing) {
        ctx.audit({ action: 'reorder', entity: 'asset-waitlist', entityId: id, detail: 'rejected: no such waitlist entry' });
        return fail(404, { error: 'No such waitlist entry.' });
      }
      await moveToEndOfWaitlist(ctx.db, id, existing.assetType);
      ctx.audit({ action: 'reorder', entity: 'asset-waitlist', entityId: id });
      return { ok: true };
    },
    { action: 'reorder', entity: 'asset-waitlist', deniedMessage: DENIED_MESSAGE },
  ),
};
