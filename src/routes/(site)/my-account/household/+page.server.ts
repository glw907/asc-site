// /my-account/household: primary only — members add/remove, per-member directory listing (the
// primary controls all, disclosed both ways), and the lean leave-the-club action (design doc's
// own "4. Household"). `ctx.isPrimary` (portal-action.ts) gates every write here; `load` also
// redirects a non-primary away, since this screen has nothing for them to do.
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  addHouseholdMember,
  getHouseholdAddress,
  getHouseholdInfo,
  leaveClub,
  listHouseholdMembers,
  removeHouseholdMember,
  setDirectoryVisibility,
  updateHouseholdAddress,
  type DirectoryVisibility,
} from '$member-portal/lib/household';
import { listHouseholdBoatsGroupedByOwner } from '$member-portal/lib/boats';
import { sendClubEmail, type EmailBindingEnv } from '$admin-club/lib/club-email';
import { portalAction } from '$member-portal/lib/portal-action';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

const VISIBILITY_VALUES: DirectoryVisibility[] = ['visible', 'partial', 'hidden'];
const BOARD_EMAIL = 'board@aksailingclub.org';

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) error(503, 'Not available right now.');

  const household = await getHouseholdInfo(db, member.householdId);
  if (household?.primaryMemberId !== member.id) {
    error(403, "Only your household's primary member can manage it. Contact the club to change the primary.");
  }

  const [members, boatGroups, address] = await Promise.all([
    listHouseholdMembers(db, member.householdId),
    listHouseholdBoatsGroupedByOwner(db, member.householdId),
    getHouseholdAddress(db, member.householdId),
  ]);
  return { csrf, household, members, boatGroups, address };
};

export const actions: Actions = {
  addMember: portalAction(async ({ form, ctx }) => {
    if (!ctx.isPrimary) return { error: 'Only the primary member can add household members.' };
    const name = String(form.get('name') ?? '').trim();
    if (!name) return { error: 'Please enter a name.' };
    const email = String(form.get('email') ?? '').trim() || null;
    const phone = String(form.get('phone') ?? '').trim() || null;
    const birthdate = String(form.get('birthdate') ?? '').trim() || null;
    await addHouseholdMember(ctx.db, ctx.member.householdId, { name, email, phone, birthdate });
    return { saved: true as const };
  }),

  removeMember: portalAction(async ({ form, ctx }) => {
    if (!ctx.isPrimary) return { error: 'Only the primary member can remove household members.' };
    const memberId = String(form.get('memberId') ?? '');
    if (!memberId) return { error: 'Missing member id.' };
    const result = await removeHouseholdMember(ctx.db, ctx.member.householdId, memberId);
    if ('error' in result) return { error: result.error };
    return { saved: true as const };
  }),

  // Either the member themself or the household's primary may set a member's own listing (the
  // design doc's own "override precedence, disclosed both ways"): the household screen is the
  // primary's own path to it for ANY member; a non-primary member sets only their own from
  // /my-account/profile instead.
  setVisibility: portalAction(async ({ form, ctx }) => {
    if (!ctx.isPrimary) return { error: 'Only the primary member can set another member\'s listing here.' };
    const memberId = String(form.get('memberId') ?? '');
    const visibility = String(form.get('visibility') ?? '');
    if (!memberId || !VISIBILITY_VALUES.includes(visibility as DirectoryVisibility)) return { error: 'Invalid request.' };
    await setDirectoryVisibility(ctx.db, memberId, visibility as DirectoryVisibility);
    return { saved: true as const };
  }),

  // The full household address (item 4 of T5's own outcome): primary-only, same plain
  // latest-write-wins shape `setDirectoryVisibility` already uses, no extra conflict machinery.
  updateAddress: portalAction(async ({ form, ctx }) => {
    if (!ctx.isPrimary) return { error: 'Only the primary member can update the household address.' };
    const result = await updateHouseholdAddress(ctx.db, ctx.member.householdId, {
      addressLine1: String(form.get('addressLine1') ?? ''),
      addressLine2: String(form.get('addressLine2') ?? ''),
      state: String(form.get('state') ?? ''),
      postalCode: String(form.get('postalCode') ?? ''),
    });
    if (!result.ok) return { error: result.error };
    return { saved: true as const };
  }),

  // The lean leave-the-club action (the symmetry rule's own "join implies leave"): stops the
  // (future) renewal-reminder cadence and flags the admin; archival stays the admin's own
  // deliberate act. Best-effort admin notify, degrading silently with no EMAIL binding (this
  // module's own convention throughout the pass).
  leave: portalAction(async ({ ctx, event }) => {
    if (!ctx.isPrimary) return { error: 'Only the primary member can do this.' };
    await leaveClub(ctx.db, ctx.member.householdId);
    const env = event.platform?.env as EmailBindingEnv | undefined;
    if (env?.EMAIL) {
      await sendClubEmail(ctx.db, env, {
        to: BOARD_EMAIL,
        raw: { subject: 'A household left the club', body: '{{member_name}} recorded their household leaving the club through the member portal.' },
        vars: { member_name: ctx.member.name },
      });
    }
    return { left: true as const };
  }),
};
