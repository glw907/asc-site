// /admin/club: the section's own landing (portal-capstone's own scope item 6), carrying the
// needs-attention strip (design doc: "pending asset requests + offers nearing expiry, each a
// count clicking through to its inbox — the dashboard spec's every-number-drills rule"). The
// signup-review card retired (pass B T2: joins are automatic and self-serve, the board is
// notified of every paid join by `board_join_notice`, so the queue reviewed nothing). Pass B T7
// reshapes the strip to the three ruled attention sources (design decision 7) and reads them from
// `$theme/admin-attention.ts`'s `loadAttentionCounts`, the same function `cairn.server.ts`'s
// `attention` dependency calls for the sidebar badges -- one source of truth, consumed twice, so
// the strip and the badges can never disagree.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { loadAttentionCounts, type AttentionCounts } from '$theme/admin-attention';

const ZERO_COUNTS: AttentionCounts = { pendingAssetRequests: 0, pendingCommitteeRequests: 0, classWaitlistAttention: 0 };

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return ZERO_COUNTS;
  return loadAttentionCounts(db);
};
