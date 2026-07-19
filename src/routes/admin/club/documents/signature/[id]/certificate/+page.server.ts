// The certificate-of-completion view (member-waivers T6, "The signature record": "A rendered
// certificate-of-completion view (snapshot, hash, timestamps, auth metadata in one human-readable
// artifact) is generated on demand from the row, supporting self-authentication if a record is
// ever litigated"). Shares `getSignatureDetail` with the plainer signed-text view; the certificate
// additionally surfaces the hash, IP, and the full auth event, and its own +page.svelte renders
// print-friendly with the admin chrome hidden under `@media print`.
//
// An unknown id or an unbound CLUB_DB is never thrown as a SvelteKit `error()` (it would bubble to
// the root `+error.svelte`'s public site chrome, not the admin shell -- see `../../../[document]/
// +page.server.ts`'s own header); it returns an honest `detail: null` instead.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { documents } from '$chassis/content';
import { loadDocumentVersion } from '$theme/documents';
import { SIGNER_RELATIONSHIPS } from '$member-portal/lib/signatures';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { getSignatureDetail, type SignatureDetailRow } from '$admin-club/lib/documents-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { detail: null as SignatureDetailRow | null, documentTitle: null as string | null, relationshipLabel: null as string | null, error: 'CLUB_DB is not bound.' };
  }

  const detail = await getSignatureDetail(db, event.params.id);
  if (!detail) {
    return { detail: null as SignatureDetailRow | null, documentTitle: null as string | null, relationshipLabel: null as string | null, error: 'No such signature.' };
  }

  const documentTitle = loadDocumentVersion(documents, detail.documentId, detail.version)?.frontmatter.title ?? detail.documentId;
  const relationshipLabel = SIGNER_RELATIONSHIPS.find((r) => r.value === detail.signerRelationship)?.label ?? null;
  return { detail, documentTitle, relationshipLabel, error: null as string | null };
};
