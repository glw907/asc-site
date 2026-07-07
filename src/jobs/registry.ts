// The scheduled-execution job registry (the job runner pass, docs/2026-07-07-requirements-
// adversarial-review.md's "structural gap: nothing can act on time"): a small, typed contract
// every cron-driven job implements, so `runner.ts` can run each one independently, audit it, and
// never let one job's failure block the next.
import type { D1Database } from '@cloudflare/workers-types';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import { expireStaleOffersJob } from './expire-stale-offers';
import { renewalRemindersJob } from './renewal-reminders';
import { classRemindersJob } from './class-reminders';
import { classRefundWindowNoticeJob } from './class-refund-window-notice';

/** The bindings a job may read: `CLUB_DB` is resolved once by `runner.ts` and handed to every job
 *  through {@link JobRunContext} instead, so a job's own `env` argument only ever needs the
 *  notification-adjacent bindings `sendClubEmail` and a claim/portal link both need. Extends
 *  `club-email.ts`'s own `EmailBindingEnv` (a job is exactly the kind of caller that module's
 *  header already anticipates) rather than restating the `EMAIL` shape a second time. */
export interface JobRunnerEnv extends EmailBindingEnv {
  /** Canonical origin for a link a job's own email includes (a claim link, a portal link); never
   *  a request header, the same rule `PUBLIC_ORIGIN`'s own binding doc carries everywhere else in
   *  this site. Optional because a job with no outbound link (none exist yet) has no need for it. */
  PUBLIC_ORIGIN?: string;
}

/** What every job's `run` receives beyond `env`: `db` is `CLUB_DB`, already resolved so no job
 *  re-resolves it; `now` is an injectable clock (real time in production, a fixed `Date` in a
 *  test), the same seam `claimOffer`'s own test suite already relies on via `vi.setSystemTime`,
 *  made explicit here since a job's own due-work query needs "now" as a first-class value rather
 *  than an ambient `new Date()` scattered through its own body. */
export interface JobRunContext {
  db: D1Database;
  now: Date;
}

/** A job's own report of what it did this tick: `examined` is how many candidate rows it looked
 *  at (a class, a household), `acted` is how many it actually changed or sent something for.
 *  `detail` is a short, free-text breakdown for the audit row's own `detail` column (e.g. "expired=2
 *  auto-offered=1"), never structured data a caller must parse. */
export interface JobSummary {
  examined: number;
  acted: number;
  detail?: string;
}

/** One registered job: a stable `name` (the audit row's own `entity_id`, and the log line's own
 *  label) plus the work itself. */
export interface Job {
  name: string;
  run(env: JobRunnerEnv, ctx: JobRunContext): Promise<JobSummary>;
}

/**
 * Every job the daily cron tick runs, in order. `runner.ts` iterates this array; each entry is
 * independently try/caught, so a new job is exactly one array entry, never a new branch in the
 * runner itself.
 *
 * `class-reminders` drives three of the class-reminder set's four touches (`week_out`,
 * `day_before`, `followup`); the fourth, `welcome`, fires synchronously from the enrollment
 * action itself (`enrollments.ts`'s `signUpForClass`, `offers.ts`'s `claimOffer`), never from
 * this array, since it has no cron cadence of its own to wait for.
 *
 * ONE MORE JOB the requirements review named is deliberately NOT built this pass (the review's
 * own "leave hooks... do NOT build those today" instruction): adding it later is meant to be
 * exactly this, one more import and one more array entry, nothing else.
 *   - `asset-payment-window-release`: the approved-asset payment window (30 days, one global
 *     setting per the review's ruling C) expires unpaid approvals and reopens the freed
 *     asset_waitlist queue, mirroring `expire-stale-offers`'s own freed-queue pattern closely
 *     enough to copy once the asset payment build lands.
 */
export const JOBS: Job[] = [expireStaleOffersJob, renewalRemindersJob, classRemindersJob, classRefundWindowNoticeJob];
