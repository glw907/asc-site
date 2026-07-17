// /my-account/gear: the gear-and-moorings home (T2b of the portal redesign pass, "the gear
// door" ruling in docs/design-benchmark/decisions.md). Absorbs the landing's own asset verbs
// (release a held assignment, request an asset, cancel a pending request) verbatim from
// `/my-account/+page.server.ts`: their logic, validation, and CSRF handling are unchanged, only
// their route moved. `?/payAssetFee` and `?/payRequest` stay on the landing (the design doc's
// own weighted "Needs your attention" row); this page's own rows POST to those landing actions
// by their full route-relative path when a fee is outstanding, matching `ActionRow.svelte`'s own
// established cross-route action precedent, rather than duplicating either checkout call site.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCurrentSeason } from '$admin-club/lib/club-settings';
import {
  cancelAssetRequest,
  createAssetRequest,
  listHouseholdAssignments,
  listHouseholdRequests,
  listHouseholdWaitlistEntries,
  listRequestableAssetTypes,
  releaseHouseholdAssignment,
} from '$member-portal/lib/assets';
import { portalAction } from '$member-portal/lib/portal-action';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, assignments: [], waitlistEntries: [], requests: [], assetTypes: [] };

  const currentSeason = await getCurrentSeason(db);
  const [assignments, waitlistEntries, requests, assetTypes] = await Promise.all([
    listHouseholdAssignments(db, member.householdId, currentSeason),
    listHouseholdWaitlistEntries(db, member.householdId),
    listHouseholdRequests(db, member.householdId),
    listRequestableAssetTypes(db),
  ]);

  return { csrf, assignments, waitlistEntries, requests, assetTypes };
};

export const actions: Actions = {
  // Moved from `/my-account/+page.server.ts` unchanged (T2b): the two-step confirm this page's
  // own template adds in front of the submit is presentation only, still this same action.
  releaseAsset: portalAction(async ({ form, ctx }) => {
    const assignmentId = String(form.get('assignmentId') ?? '');
    if (!assignmentId) return fail(400, { error: 'Missing assignment id.' });
    const result = await releaseHouseholdAssignment(ctx.db, assignmentId, ctx.member.householdId);
    if ('error' in result) return fail(400, { error: result.error });
    return { released: true as const };
  }),

  cancelRequest: portalAction(async ({ form, ctx }) => {
    const requestId = String(form.get('requestId') ?? '');
    if (!requestId) return fail(400, { error: 'Missing request id.' });
    const result = await cancelAssetRequest(ctx.db, requestId, ctx.member.householdId, ctx.member.id);
    if ('error' in result) return fail(400, { error: result.error });
    return { cancelled: true as const };
  }),

  // Request an asset (design doc's own "Request an asset": a type picker plus a one-line note; any
  // adult member may). Always `kind: 'new'` here: the year-to-year retention ask surfaces IN the
  // renewal flow instead (this pass's own scope note), not from this general request form.
  requestAsset: portalAction(async ({ form, ctx }) => {
    const assetType = String(form.get('assetType') ?? '').trim();
    if (!assetType) return fail(400, { error: 'Please choose an asset type.' });
    const note = String(form.get('note') ?? '').trim() || null;
    await createAssetRequest(ctx.db, { assetType, householdId: ctx.member.householdId, requestedBy: ctx.member.id, kind: 'new', note });
    return { requested: true as const };
  }),
};
