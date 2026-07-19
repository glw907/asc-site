// A member's own signature history (member-waivers T6, spec decision 8's "per-member signature
// history"): reachable from the household desk's own roster row and from any document
// drill-through's member list. Static sibling to `../[document]`, resolving ahead of it per
// SvelteKit's static-over-dynamic precedence.
//
// An unknown member or an unbound CLUB_DB is never thrown as a SvelteKit `error()` (it would
// bubble to the root `+error.svelte`'s public site chrome, not the admin shell -- see `../
// [document]/+page.server.ts`'s own header); it returns an honest `member: null` instead.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { documents } from '$chassis/content';
import { loadDocumentVersion } from '$theme/documents';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { getMemberIdentity, listMemberSignatureHistory, type MemberIdentityRow, type SignatureHistoryRow } from '$admin-club/lib/documents-store';

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return { member: null as MemberIdentityRow | null, history: [] as (SignatureHistoryRow & { title: string })[], error: 'CLUB_DB is not bound.' };
  }

  const member = await getMemberIdentity(db, event.params.memberId);
  if (!member) {
    return { member: null as MemberIdentityRow | null, history: [] as (SignatureHistoryRow & { title: string })[], error: 'No such member.' };
  }

  const history = await listMemberSignatureHistory(db, member.id);
  // Each row's own title, resolved by exact document/version off the content index -- the
  // history's own signed_at ordering already carries every version distinction, so the title only
  // needs to name what was signed, never re-derive when.
  const rows = history.map((row) => ({
    ...row,
    title: loadDocumentVersion(documents, row.documentId, row.version)?.frontmatter.title ?? row.documentId,
  }));

  return { member, history: rows, error: null as string | null };
};
