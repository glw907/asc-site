// The frozen signed text (member-waivers T6, spec "The signature record": "A rendered
// certificate-of-completion view ... is generated on demand from the row"; this is the plainer
// sibling view, the exact text a signature snapshot carries, rendered the same way the signing
// moment itself rendered it). Read-only, evidence-only: no edit or delete path exists anywhere on
// a signature row.
//
// An unknown id or an unbound CLUB_DB is never thrown as a SvelteKit `error()` (it would bubble to
// the root `+error.svelte`'s public site chrome, not the admin shell -- see `../../[document]/
// +page.server.ts`'s own header); it returns an honest `detail: null` instead.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { documents } from '$chassis/content';
import { loadDocumentVersion } from '$theme/documents';
import { renderMarkdown } from '$theme/cairn.config';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { getSignatureDetail, type SignatureDetailRow } from '$admin-club/lib/documents-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { detail: null as SignatureDetailRow | null, documentTitle: null as string | null, bodyHtml: null as string | null, error: 'CLUB_DB is not bound.' };
  }

  const detail = await getSignatureDetail(db, event.params.id);
  if (!detail) {
    return { detail: null as SignatureDetailRow | null, documentTitle: null as string | null, bodyHtml: null as string | null, error: 'No such signature.' };
  }

  const documentTitle = loadDocumentVersion(documents, detail.documentId, detail.version)?.frontmatter.title ?? detail.documentId;
  const bodyHtml = detail.contentSnapshot ? await renderMarkdown(detail.contentSnapshot) : null;

  return { detail, documentTitle, bodyHtml, error: null as string | null };
};
