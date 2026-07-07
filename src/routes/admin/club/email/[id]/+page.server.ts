// The Email template detail screen (pass 2.2): a read-only preview only. Editing IN the cairn
// editor with a variables palette is 2.3's own full feature (`email/+page.server.ts`'s own header);
// this load exists to fetch the one template and nothing else.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { getEmailTemplate, type EmailTemplateRow } from '$admin-club/lib/club-email';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { template: null as EmailTemplateRow | null, error: 'CLUB_DB is not bound.' };
  }
  const template = await getEmailTemplate(db, event.params.id);
  return { template, error: null as string | null };
};
