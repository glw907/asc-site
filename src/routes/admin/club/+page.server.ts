// /admin/club: the section's own landing (portal-capstone's own scope item 6), carrying the
// needs-attention strip (design doc: "pending signup reviews + asset requests + offers nearing
// expiry, each a count clicking through to its inbox — the dashboard spec's every-number-drills
// rule"). This ships WITH the asset-request review inbox (its front door); the fuller reporting
// dashboard grows around it later, per the design doc's own note.
import type { PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { pendingSignupReviews } from '$admin-club/lib/signup-reviews-store';
import { listPendingAssetRequests } from '$member-portal/lib/assets';

/** Offers nearing expiry: unresolved, expiring within the next 24 hours — the admin's own early
 *  warning that a claim window is about to close with no chaser sent (a cron-driven reminder is
 *  filed forward, per the adversarial review's own job-runner recommendation; this count is the
 *  strip's honest substitute today, a read with no side effect). */
const NEAR_EXPIRY_HOURS = 24;

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) return { pendingSignups: 0, pendingRequests: 0, offersNearExpiry: 0 };

  const now = new Date();
  const soon = new Date(now.getTime() + NEAR_EXPIRY_HOURS * 60 * 60 * 1000);
  const toSqliteDatetime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

  const [signupReviews, pendingRequests, nearExpiryRow] = await Promise.all([
    pendingSignupReviews(db),
    listPendingAssetRequests(db),
    db
      .prepare('SELECT COUNT(*) AS n FROM class_offers WHERE resolved IS NULL AND expires_at > ?1 AND expires_at <= ?2')
      .bind(toSqliteDatetime(now), toSqliteDatetime(soon))
      .first<{ n: number }>(),
  ]);

  return {
    pendingSignups: signupReviews.length,
    pendingRequests: pendingRequests.length,
    offersNearExpiry: nearExpiryRow?.n ?? 0,
  };
};
