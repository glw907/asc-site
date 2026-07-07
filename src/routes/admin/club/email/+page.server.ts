// The Club section's Email screen: the template list and the send log. The detail route
// (`email/[id]`) is the edit screen (pass 2.3): subject/body, a variable palette, a sample-data
// preview, and reset-to-default.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { listEmailLog, listEmailTemplates, type EmailLogRow, type EmailTemplateRow } from '$admin-club/lib/club-email';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { templates: [] as EmailTemplateRow[], log: [] as EmailLogRow[], error: 'CLUB_DB is not bound.' };
  }
  try {
    const [templates, log] = await Promise.all([listEmailTemplates(db), listEmailLog(db)]);
    return { templates, log, error: null as string | null };
  } catch (err) {
    console.error('admin/club/email: CLUB_DB read failed', err);
    return { templates: [] as EmailTemplateRow[], log: [] as EmailLogRow[], error: 'Could not read the email tables.' };
  }
};
