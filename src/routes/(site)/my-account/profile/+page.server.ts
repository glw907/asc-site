// /my-account/profile: the lean fields only (email, phone, birthdate) and directory visibility
// with a "how others see you" preview (design doc's own "3. Profile"). Every write goes through
// `$member-portal/lib/{profile,household}.ts`.
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { updateProfile } from '$member-portal/lib/profile';
import { addBoat, listMemberBoats, removeBoat, updateBoat } from '$member-portal/lib/boats';
import { getHouseholdAddress, setDirectoryVisibility, type DirectoryVisibility } from '$member-portal/lib/household';
import type { ProfilePreviewFacts } from '$member-portal/lib/profile-preview';
import { portalAction } from '$member-portal/lib/portal-action';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

const VISIBILITY_VALUES: DirectoryVisibility[] = ['visible', 'partial', 'hidden'];

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) {
    return {
      csrf,
      profile: { email: '', phone: '', birthdate: '', directoryVisibility: 'partial' as DirectoryVisibility },
      boats: [],
      preview: { hasPositions: false, hasMemberships: false, boatCount: 0, hasAddress: false } satisfies ProfilePreviewFacts,
    };
  }

  const [row, boats, positionCount, membershipCount, address] = await Promise.all([
    db.prepare('SELECT email, phone, birthdate, directory_visibility FROM members WHERE id = ?1').bind(member.id).first<{
      email: string | null;
      phone: string | null;
      birthdate: string | null;
      directory_visibility: DirectoryVisibility;
    }>(),
    listMemberBoats(db, member.id),
    db.prepare('SELECT COUNT(*) AS n FROM member_positions WHERE member_id = ?1').bind(member.id).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM committee_members WHERE member_id = ?1 AND status = 'active'").bind(member.id).first<{ n: number }>(),
    getHouseholdAddress(db, member.householdId),
  ]);

  return {
    csrf,
    profile: row
      ? { email: row.email ?? '', phone: row.phone ?? '', birthdate: row.birthdate ?? '', directoryVisibility: row.directory_visibility }
      : { email: '', phone: '', birthdate: '', directoryVisibility: 'partial' as DirectoryVisibility },
    boats,
    preview: {
      hasPositions: (positionCount?.n ?? 0) > 0,
      hasMemberships: (membershipCount?.n ?? 0) > 0,
      boatCount: boats.length,
      hasAddress: Boolean(address?.addressLine1),
    } satisfies ProfilePreviewFacts,
  };
};

export const actions: Actions = {
  updateProfile: portalAction(async ({ form, ctx }) => {
    const result = await updateProfile(ctx.db, ctx.member.id, {
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      birthdate: String(form.get('birthdate') ?? ''),
    });
    if ('error' in result) return { error: result.error };
    return { saved: true as const };
  }),

  updateVisibility: portalAction(async ({ form, ctx }) => {
    const visibility = String(form.get('visibility') ?? '');
    if (!VISIBILITY_VALUES.includes(visibility as DirectoryVisibility)) return { error: 'Invalid visibility.' };
    await setDirectoryVisibility(ctx.db, ctx.member.id, visibility as DirectoryVisibility);
    return { saved: true as const };
  }),

  // Boat capture belongs to its owner (migration 0027_directory_domain's own supersession):
  // every one of these three actions writes only the signed-in member's own rows, `ownerId`
  // never travels from the form.
  addBoat: portalAction(async ({ form, ctx }) => {
    const result = await addBoat(ctx.db, ctx.member.id, {
      name: String(form.get('name') ?? ''),
      modelPicker: String(form.get('modelPicker') ?? ''),
      otherModel: String(form.get('otherModel') ?? ''),
      sailNumber: String(form.get('sailNumber') ?? ''),
      keptOn: String(form.get('keptOn') ?? ''),
    });
    if ('error' in result) return { error: result.error };
    return { saved: true as const };
  }),

  updateBoat: portalAction(async ({ form, ctx }) => {
    const boatId = String(form.get('boatId') ?? '');
    if (!boatId) return { error: 'Missing boat id.' };
    const result = await updateBoat(ctx.db, ctx.member.id, boatId, {
      name: String(form.get('name') ?? ''),
      modelPicker: String(form.get('modelPicker') ?? ''),
      otherModel: String(form.get('otherModel') ?? ''),
      sailNumber: String(form.get('sailNumber') ?? ''),
      keptOn: String(form.get('keptOn') ?? ''),
    });
    if ('error' in result) return { error: result.error };
    return { saved: true as const };
  }),

  removeBoat: portalAction(async ({ form, ctx }) => {
    const boatId = String(form.get('boatId') ?? '');
    if (!boatId) return { error: 'Missing boat id.' };
    const result = await removeBoat(ctx.db, ctx.member.id, boatId);
    if ('error' in result) return { error: result.error };
    return { saved: true as const };
  }),
};
