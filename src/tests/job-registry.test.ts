// Proves `runner.ts`'s own isolation contract (docs/2026-07-07-requirements-adversarial-review.md's
// job runner: "each job is independently try/caught, one job failing never blocks the others"):
// a throwing job is caught, audited as a failure, and every job registered after it still runs
// and gets its own success audit row. Mocks the four real job modules `registry.ts` imports
// (resolved by file path, not the alias string, so this still exercises the real `JOBS` array
// `registry.ts` builds and the real iteration order) rather than re-deriving a parallel fake
// registry, so this test stays true to the actual wiring; each job's own behavior has its own
// dedicated test file and is not re-proven here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './_fake-d1';

vi.mock('../jobs/expire-stale-offers', () => ({
  expireStaleOffersJob: {
    name: 'expire-stale-offers',
    run: vi.fn().mockRejectedValue(new Error('boom: the offer sweep exploded')),
  },
}));

vi.mock('../jobs/renewal-reminders', () => ({
  renewalRemindersJob: {
    name: 'renewal-reminders',
    run: vi.fn().mockResolvedValue({ examined: 3, acted: 1, detail: 'households_with_a_due_touch=1 touches_sent=1' }),
  },
}));

vi.mock('../jobs/class-reminders', () => ({
  classRemindersJob: {
    name: 'class-reminders',
    run: vi.fn().mockResolvedValue({ examined: 2, acted: 1, detail: 'touches_fired=1 sends=1' }),
  },
}));

vi.mock('../jobs/class-refund-window-notice', () => ({
  classRefundWindowNoticeJob: {
    name: 'class-refund-window-notice',
    run: vi.fn().mockResolvedValue({ examined: 1, acted: 0, detail: 'classes_in_notice_window=0 sends=0' }),
  },
}));

describe('runScheduledJobs (the isolation contract)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('audits the throwing job as a failure and still runs and audits the job after it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { runScheduledJobs } = await import('../jobs/runner');
    const { db, calls } = fakeD1();

    await runScheduledJobs({ CLUB_DB: db });

    const audits = calls.filter((c) => c.sql.startsWith('INSERT INTO audit_log'));
    expect(audits).toHaveLength(4);

    const byJob = (name: string) => audits.find((a) => a.args[1] === name);
    expect(byJob('expire-stale-offers')?.args).toEqual(['system:cron', 'expire-stale-offers', expect.stringContaining('FAILED: boom')]);
    expect(byJob('renewal-reminders')?.args).toEqual(['system:cron', 'renewal-reminders', expect.stringContaining('examined=3 acted=1')]);
    expect(byJob('class-reminders')?.args).toEqual(['system:cron', 'class-reminders', expect.stringContaining('examined=2 acted=1')]);
    expect(byJob('class-refund-window-notice')?.args).toEqual([
      'system:cron',
      'class-refund-window-notice',
      expect.stringContaining('examined=1 acted=0'),
    ]);

    errorSpy.mockRestore();
  });

  it('skips the entire tick, writing no audit rows, when CLUB_DB is not bound', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { runScheduledJobs } = await import('../jobs/runner');

    // No assertion needs a fake D1 here: with no CLUB_DB, the runner never gets far enough to
    // prepare a statement at all, so there is nothing to record calls against.
    await expect(runScheduledJobs({})).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CLUB_DB is not bound'));

    errorSpy.mockRestore();
  });
});
