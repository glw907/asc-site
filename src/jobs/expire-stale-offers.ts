// The first of the job runner's two jobs (docs/2026-07-07-requirements-adversarial-review.md):
// makes the offer machine's lazy sweep (`offers.ts`'s own `expireStaleOffers`, run today only
// from a page `load`) eager, then applies the freed-spot rule
// (docs/2026-07-07-member-portal-design.md's own "a freed spot never publicly re-opens the class
// while anyone waits" section): if a class now has a free spot AND a non-empty waitlist AND no
// offer already outstanding for it, the next waitlisted entry (position order) gets a fresh
// offer, notified the same way an admin's own manual "offer" action already is. Every write goes
// through `offers.ts`'s own exported functions (`expireStaleOffers`, `hasActiveOfferForClass`,
// `offerSpot`); this module holds no offer-state SQL of its own, only the orchestration across
// classes that module's own functions do not already do for each other.
import { listClassesWithCounts, listWaitlist } from '$admin-club/lib/classes-store';
import { expireStaleOffers, hasActiveOfferForClass, offerSpot } from '$admin-club/lib/offers';
import type { Job, JobSummary } from './registry';

/** The system actor every job-triggered offer is minted under, distinct from an admin's own email
 *  (`clubAdminAction`'s `ctx.editor.email`) and from `offers.ts`'s own `'system'` audit actor for
 *  an expiry (a different axis: `offered_by` names who is accountable for the offer existing, not
 *  who is recording an audit event about it). */
const CRON_ACTOR = 'system:cron';

export const expireStaleOffersJob: Job = {
  name: 'expire-stale-offers',

  async run(env, ctx) {
    const { expiredCount } = await expireStaleOffers(ctx.db);

    const classes = await listClassesWithCounts(ctx.db);
    let autoOffered = 0;
    for (const cls of classes) {
      if (cls.isFull || cls.waitlistCount === 0) continue;
      if (await hasActiveOfferForClass(ctx.db, cls.id)) continue;

      const waitlist = await listWaitlist(ctx.db, cls.id);
      const next = waitlist[0];
      if (!next) continue;

      const notify = env.EMAIL && env.PUBLIC_ORIGIN ? { env, origin: env.PUBLIC_ORIGIN } : undefined;
      const result = await offerSpot(ctx.db, {
        classId: cls.id,
        waitlistId: next.id,
        actorEmail: CRON_ACTOR,
        notify,
      });
      if (!('error' in result)) autoOffered += 1;
    }

    const summary: JobSummary = {
      examined: classes.length,
      acted: expiredCount + autoOffered,
      detail: `expired=${expiredCount} auto-offered=${autoOffered}`,
    };
    return summary;
  },
};
