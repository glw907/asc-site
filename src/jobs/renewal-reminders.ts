// The second of the job runner's two jobs (docs/2026-07-07-requirements-adversarial-review.md's
// send inventory: "Renewal reminders (the four touches) -- Cron, per-household rolling dates --
// Needs the job runner"). The four-touch cadence is fixed day offsets against a household's own
// rolling renewal boundary (`standing.ts`'s `renewalExpiryFrom`, Geoff's 2026-07-07 ruling: a
// household's own `paid_at` plus one year, never a season boundary): 30 days before, 7 days
// before, the day of, and 30 days after (the symmetry principle's own "the stated-final last
// touch"). `renewal_reminders_sent` (migration 0015_job_runner) marks each touch exactly once per
// household so a daily tick never double-fires one a prior tick already sent.
//
// This module has no other consumer today (unlike `offers.ts`, which the admin's own "offer"
// action and the public claim page both already call), so its query and send logic lives here
// directly rather than in a new `$admin-club/lib` module a second caller would have to be
// invented to justify.
import type { D1Database } from '@cloudflare/workers-types';
import { renewalExpiryFrom } from '$member-auth/lib/standing';
import { sendClubEmail } from '$admin-club/lib/club-email';
import { formatCivilDate } from '$admin-club/lib/ui';
import { UNLIMITED_SEND_BUDGET, type Job, type JobSummary } from './registry';

const JOB_NAME = 'renewal-reminders';

/** `date`'s own civil-date portion ("YYYY-MM-DD"), UTC: `renewalExpiryFrom`'s result is always a
 *  UTC-derived boundary (`standing.ts`'s own `parseStoredDate`/`plusOneYear`), so reading it back
 *  through `Date`'s own local-time getters would risk shifting the calendar day; `toISOString`
 *  reads UTC unconditionally. Feeds `ui.ts`'s own `formatCivilDate`, which expects exactly this
 *  shape. */
function toCivilDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The four-touch cadence's own vocabulary, matching `renewal_reminders_sent.touch`'s CHECK
 *  constraint (migration 0015_job_runner) exactly. */
export type RenewalTouch = '30_before' | '7_before' | 'day_of' | '30_after';

/** Cadence order, earliest to latest: also `dueTouches`' own iteration order, so a household with
 *  more than one touch due at once (a cron gap, or its very first-ever run) sends them oldest
 *  first. */
const TOUCH_ORDER: RenewalTouch[] = ['30_before', '7_before', 'day_of', '30_after'];

/** Each touch's offset in days from the household's own renewal boundary (negative = before,
 *  positive = after). */
const TOUCH_OFFSET_DAYS: Record<RenewalTouch, number> = {
  '30_before': -30,
  '7_before': -7,
  day_of: 0,
  '30_after': 30,
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A touch's own due date more than this many days in the past is never due, permanently (the
 *  2026-07-14 incident: the first cron tick after a member-data import found every touch for
 *  every household with a paid membership due at once and fired all of them). A future import,
 *  backfill, or long cron outage degrades to silence instead of a blast; a short outage (a missed
 *  day or two) still catches up normally, since a touch within the window still fires. */
const STALENESS_CUTOFF_DAYS = 10;

/** Whether `touchDate` is due at `now`: `now` has reached it, but not so long ago that the touch
 *  is stale (see {@link STALENESS_CUTOFF_DAYS}). */
function isDue(touchDate: Date, now: Date): boolean {
  return now >= touchDate && now <= addDays(touchDate, STALENESS_CUTOFF_DAYS);
}

/**
 * Which of a household's four touches are due, in cadence order: `now` has reached the touch's
 * own date (`expiresOn` plus that touch's offset), that date is not stale (see
 * {@link STALENESS_CUTOFF_DAYS}), and `alreadySent` does not already carry it. Pure and D1-free on
 * purpose, so the due-selection rule (the four offsets, the staleness cutoff, and the
 * no-double-fire rule) is directly testable with plain `Date`s (this module's own test suite).
 */
export function dueTouches(expiresOn: Date, now: Date, alreadySent: ReadonlySet<RenewalTouch>): RenewalTouch[] {
  return TOUCH_ORDER.filter((touch) => {
    if (alreadySent.has(touch)) return false;
    return isDue(addDays(expiresOn, TOUCH_OFFSET_DAYS[touch]), now);
  });
}

/** Each touch's own plain-words line, substituted into the `renewal_reminder` template's
 *  `{{message}}` variable (the template body itself never branches, matching the ops-ported
 *  templates' own "no conditional syntax" convention -- see `club-email.ts`'s header and
 *  `ops-email-templates.README.md`'s "Nothing to adapt" section). */
const TOUCH_MESSAGE: Record<RenewalTouch, (expiresOn: string) => string> = {
  '30_before': (d) => `Your household's Alaska Sailing Club membership renews on ${d}.`,
  '7_before': (d) => `Your household's Alaska Sailing Club membership renews in one week, on ${d}.`,
  day_of: (d) => `Your household's Alaska Sailing Club membership renews today, ${d}.`,
  '30_after': (d) =>
    `Your household's Alaska Sailing Club membership lapsed on ${d}. This is our final reminder before your benefits pause.`,
};

const RENEWAL_TEMPLATE_ID = 'renewal_reminder';
const COMMITTEE_EMAIL = 'membership-committee@aksailingclub.org';

interface HouseholdDueRow {
  household_id: string;
  household_name: string;
  paid_at: string;
}

/** Every household with at least one paid `memberships` row, its single most recent `paid_at`:
 *  the renewal-boundary math's own input. A household that has never paid (invoiced/pending only)
 *  has nothing to derive a boundary from and is excluded here, the same as `getMemberStanding`'s
 *  own `paidRow` guard. */
async function listHouseholdsWithPaidMembership(db: D1Database): Promise<HouseholdDueRow[]> {
  const { results } = await db
    .prepare(
      `SELECT h.id AS household_id, h.name AS household_name, MAX(m.paid_at) AS paid_at
       FROM households h JOIN memberships m ON m.household_id = h.id
       WHERE m.paid_at IS NOT NULL
       GROUP BY h.id`,
    )
    .all<HouseholdDueRow>();
  return results;
}

/** A household's own contact for a reminder: its primary member's email if it has one, else the
 *  first (by `created_at`) other member on file with an email, else `null` (nothing to notify,
 *  not an error, the same posture `offers.ts`'s own `resolveWaitlistContact` documents). */
async function resolveHouseholdContact(db: D1Database, householdId: string): Promise<{ email: string; name: string } | null> {
  const household = await db
    .prepare('SELECT primary_member_id FROM households WHERE id = ?1')
    .bind(householdId)
    .first<{ primary_member_id: string | null }>();
  if (household?.primary_member_id) {
    const primary = await db
      .prepare('SELECT name, email FROM members WHERE id = ?1 AND archived_at IS NULL')
      .bind(household.primary_member_id)
      .first<{ name: string; email: string | null }>();
    if (primary?.email) return { email: primary.email, name: primary.name };
  }
  const fallback = await db
    .prepare(
      'SELECT name, email FROM members WHERE household_id = ?1 AND email IS NOT NULL AND archived_at IS NULL ORDER BY created_at ASC LIMIT 1',
    )
    .bind(householdId)
    .first<{ name: string; email: string }>();
  return fallback ? { email: fallback.email, name: fallback.name } : null;
}

/** `touch`s already sent for `householdId`'s CURRENT renewal cycle only (migration
 *  0024_renewal_marker_cycle): scoped by `expiresOnCivil`, the household's own boundary
 *  (`toCivilDateString(renewalExpiryFrom(...))`), rather than by `household_id` alone. Before
 *  0024, a mark was keyed `(household_id, touch)` forever, so a household that renewed never got
 *  its next cycle's reminders -- the same touch name, sent once, suppressed every future cycle.
 *  Scoping by the cycle's own boundary means a new `paid_at` (a renewal) produces a new
 *  `expiresOnCivil`, and last cycle's marks simply do not match it. */
async function alreadySentTouches(db: D1Database, householdId: string, expiresOnCivil: string): Promise<Set<RenewalTouch>> {
  const { results } = await db
    .prepare('SELECT touch FROM renewal_reminders_sent WHERE household_id = ?1 AND expires_on = ?2')
    .bind(householdId, expiresOnCivil)
    .all<{ touch: RenewalTouch }>();
  return new Set(results.map((row) => row.touch));
}

/** `INSERT OR IGNORE`: `UNIQUE (household_id, touch, expires_on)` is the no-double-fire guarantee
 *  for this cycle, so a concurrent or re-run tick that raced this same touch for this same
 *  household and cycle fails silently rather than erroring, the same idempotent-seed posture
 *  migration 0010_tier_prices's own `INSERT OR IGNORE` documents. Marked BEFORE the send attempt,
 *  not after: a delivery failure is still a completed attempt (mirrors `offers.ts`'s own "log
 *  loudly, never re-fail the state transition already committed" posture for a notification
 *  failure), so a bad address never wedges this touch into firing again every single day. */
async function markTouchSent(db: D1Database, householdId: string, touch: RenewalTouch, expiresOnCivil: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO renewal_reminders_sent (household_id, touch, expires_on) VALUES (?1, ?2, ?3)')
    .bind(householdId, touch, expiresOnCivil)
    .run();
}

export const renewalRemindersJob: Job = {
  name: JOB_NAME,

  async run(env, ctx) {
    const budget = ctx.budget ?? UNLIMITED_SEND_BUDGET;
    const households = await listHouseholdsWithPaidMembership(ctx.db);
    let sent = 0;
    let householdsTouched = 0;

    for (const row of households) {
      const expiresOn = renewalExpiryFrom(row.paid_at);
      const expiresOnCivil = toCivilDateString(expiresOn);
      const alreadySent = await alreadySentTouches(ctx.db, row.household_id, expiresOnCivil);
      const due = dueTouches(expiresOn, ctx.now, alreadySent);
      if (due.length === 0) continue;
      householdsTouched += 1;

      const contact = await resolveHouseholdContact(ctx.db, row.household_id);
      const expiresOnDisplay = formatCivilDate(expiresOnCivil);

      for (const touch of due) {
        // Marked sent regardless of whether the per-tick send cap below still has room: a
        // marked-but-unsent touch is an accepted tradeoff in a blast scenario (the household
        // simply never gets that one touch this cycle, rather than the cap forcing a
        // re-derivation of "already attempted" some other way).
        await markTouchSent(ctx.db, row.household_id, touch, expiresOnCivil);
        if (!contact) continue;
        if (!(await budget.reserve(JOB_NAME))) continue;
        await sendClubEmail(ctx.db, env, {
          to: contact.email,
          templateId: RENEWAL_TEMPLATE_ID,
          vars: {
            person_name: contact.name,
            household_name: row.household_name,
            message: TOUCH_MESSAGE[touch](expiresOnDisplay),
            portal_url: `${env.PUBLIC_ORIGIN ?? ''}/my-account`,
            committee_email: COMMITTEE_EMAIL,
          },
        });
        sent += 1;
      }
    }

    const summary: JobSummary = {
      examined: households.length,
      acted: sent,
      detail: `households_with_a_due_touch=${householdsTouched} touches_sent=${sent}`,
    };
    return summary;
  },
};
