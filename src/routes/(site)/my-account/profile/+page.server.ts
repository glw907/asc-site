// /my-account/profile: the lean fields only (email, phone, birthdate) and directory visibility
// with a "how others see you" preview (design doc's own "3. Profile"). Every write goes through
// `$member-portal/lib/{profile,household}.ts`.
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { updateProfile } from '$member-portal/lib/profile';
import { setDirectoryVisibility, type DirectoryVisibility } from '$member-portal/lib/household';
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
  const row = db
    ? await db.prepare('SELECT email, phone, birthdate, directory_visibility FROM members WHERE id = ?1').bind(member.id).first<{
        email: string | null;
        phone: string | null;
        birthdate: string | null;
        directory_visibility: DirectoryVisibility;
      }>()
    : null;

  return {
    csrf,
    profile: row
      ? { email: row.email ?? '', phone: row.phone ?? '', birthdate: row.birthdate ?? '', directoryVisibility: row.directory_visibility }
      : { email: '', phone: '', birthdate: '', directoryVisibility: 'partial' as DirectoryVisibility },
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
};
