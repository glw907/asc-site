// The scheduled entrypoint the Cloudflare Cron Trigger invokes (wired via
// `scripts/wire-scheduled-handler.mjs`, see that script's own header for the mechanism and
// why it exists; `wrangler.toml`'s `[triggers]` names the schedule). Runs every job in `JOBS`
// (registry.ts) independently: one throwing job is caught and audited as a failure, never
// blocking the jobs after it, and every job (success or failure) writes exactly one `audit_log`
// row for the tick, actor `'system:cron'`.
import type { D1Database } from '@cloudflare/workers-types';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { JOBS, type JobRunnerEnv, type SendBudget } from './registry';

const CRON_ACTOR = 'system:cron';

/** The per-tick email send cap (the 2026-07-14 incident's own guard rider): well under the
 *  account's real sending quota, so a blast of catch-up sends (an import, a backfill, a long
 *  cron outage) hits this ceiling long before it hits the account's own. */
export const PER_TICK_SEND_CAP = 50;

/** Insert one `audit_log` row for a job's own tick (mirrors `offers.ts`'s own `writeAudit`: a
 *  direct insert, not `ctx.audit`, since a scheduled tick has no signed-in editor or `adminAction`
 *  wrapper behind it). Never throws: a failed audit write must not take down the tick itself, the
 *  same tradeoff `offers.ts`'s `writeAudit` documents, just logged loudly instead. */
async function writeJobAudit(db: D1Database, jobName: string, detail: string): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, 'job.run', 'job', ?2, ?3)")
      .bind(CRON_ACTOR, jobName, detail)
      .run();
  } catch (err) {
    console.error(`jobs/runner: audit_log insert failed for job "${jobName}"`, err);
  }
}

/** Insert the one `send_cap_hit` audit row a spent budget writes (never more than one per tick;
 *  {@link TickSendBudget} guards that). Same never-throws posture as `writeJobAudit`. */
async function writeSendCapAudit(db: D1Database, cap: number, jobName: string): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?1, 'send_cap_hit', 'jobs', ?2, ?3)")
      .bind(CRON_ACTOR, jobName, `cap=${cap} interrupted_job=${jobName}`)
      .run();
  } catch (err) {
    console.error(`jobs/runner: send_cap_hit audit_log insert failed for job "${jobName}"`, err);
  }
}

/** The real, capped {@link SendBudget}: `reserve` grants up to `cap` sends total across every job
 *  sharing this instance, then returns `false` for the rest of the tick. The first caller to
 *  exhaust it writes the one `send_cap_hit` audit row (`capLogged` guards against a second job
 *  also running dry against the same spent budget writing a duplicate). */
class TickSendBudget implements SendBudget {
  private remaining: number;
  private capLogged = false;

  constructor(
    private readonly db: D1Database,
    private readonly cap: number,
  ) {
    this.remaining = cap;
  }

  async reserve(jobName: string): Promise<boolean> {
    if (this.remaining > 0) {
      this.remaining -= 1;
      return true;
    }
    if (!this.capLogged) {
      this.capLogged = true;
      await writeSendCapAudit(this.db, this.cap, jobName);
    }
    return false;
  }
}

/** Build the real per-tick send budget, shared by every job in one `runScheduledJobs` call.
 *  Exported so a test can exercise the cap directly against a job's own `run`, the same way
 *  `runner.ts` itself does. */
export function createSendBudget(db: D1Database, cap: number = PER_TICK_SEND_CAP): SendBudget {
  return new TickSendBudget(db, cap);
}

/**
 * Run every registered job once, in order. `env` is the raw Worker bindings object the `scheduled`
 * handler receives (typed `unknown` at this boundary, narrowed internally, the same convention
 * `resolveClubDb`/`ClassSignupEnv` already use elsewhere in this site rather than requiring every
 * caller to satisfy the engine's full platform-binding shape). If `CLUB_DB` itself is not bound,
 * the whole tick is skipped (logged, never thrown): there is nowhere to write even a failure
 * audit row without it.
 */
export async function runScheduledJobs(env: unknown): Promise<void> {
  const platformEnv = env as JobRunnerEnv;
  const db = resolveClubDb(env);
  if (!db) {
    console.error('jobs/runner: CLUB_DB is not bound; skipping this scheduled tick entirely.');
    return;
  }

  const now = new Date();
  const budget = createSendBudget(db);
  for (const job of JOBS) {
    try {
      const summary = await job.run(platformEnv, { db, now, budget });
      const detail = `examined=${summary.examined} acted=${summary.acted}${summary.detail ? ` (${summary.detail})` : ''}`;
      await writeJobAudit(db, job.name, detail);
      console.log(`jobs/runner: "${job.name}" ok -- ${detail}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await writeJobAudit(db, job.name, `FAILED: ${message}`);
      console.error(`jobs/runner: "${job.name}" threw`, err);
    }
  }
}
