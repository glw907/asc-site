// The Club section's Email screen (pass 2.2's email port): the template list (office idiom) and
// the send log, both read-only this pass. Template EDITING in the cairn editor with a variables
// palette is 2.3's own full feature (the design suite's own naming); this pass's detail route
// (`email/[id]`) is a read-only preview only, and says so on-screen.
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
