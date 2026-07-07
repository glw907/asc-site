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
import type { Job, JobSummary } from './registry';

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

/**
 * Which of a household's four touches are due, in cadence order: `now` has reached the touch's
 * own date (`expiresOn` plus that touch's offset) and `alreadySent` does not already carry it.
 * Pure and D1-free on purpose, so the due-selection rule (the four offsets, and the no-double-fire
 * rule) is directly testable with plain `Date`s (this module's own test suite).
 */
export function dueTouches(expiresOn: Date, now: Date, alreadySent: ReadonlySet<RenewalTouch>): RenewalTouch[] {
  return TOUCH_ORDER.filter((touch) => {
    if (alreadySent.has(touch)) return false;
    return now >= addDays(expiresOn, TOUCH_OFFSET_DAYS[touch]);
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

async function alreadySentTouches(db: D1Database, householdId: string): Promise<Set<RenewalTouch>> {
  const { results } = await db
    .prepare('SELECT touch FROM renewal_reminders_sent WHERE household_id = ?1')
    .bind(householdId)
    .all<{ touch: RenewalTouch }>();
  return new Set(results.map((row) => row.touch));
}

/** `INSERT OR IGNORE`: the primary key `(household_id, touch)` is the no-double-fire guarantee
 *  itself, so a concurrent or re-run tick that raced this same touch for this same household
 *  fails silently rather than erroring, the same idempotent-seed posture migration
 *  0010_tier_prices's own `INSERT OR IGNORE` documents. Marked BEFORE the send attempt, not
 *  after: a delivery failure is still a completed attempt (mirrors `offers.ts`'s own "log loudly,
 *  never re-fail the state transition already committed" posture for a notification failure), so
 *  a bad address never wedges this touch into firing again every single day. */
async function markTouchSent(db: D1Database, householdId: string, touch: RenewalTouch): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO renewal_reminders_sent (household_id, touch) VALUES (?1, ?2)')
    .bind(householdId, touch)
    .run();
}

export const renewalRemindersJob: Job = {
  name: 'renewal-reminders',

  async run(env, ctx) {
    const households = await listHouseholdsWithPaidMembership(ctx.db);
    let sent = 0;
    let householdsTouched = 0;

    for (const row of households) {
      const expiresOn = renewalExpiryFrom(row.paid_at);
      const alreadySent = await alreadySentTouches(ctx.db, row.household_id);
      const due = dueTouches(expiresOn, ctx.now, alreadySent);
      if (due.length === 0) continue;
      householdsTouched += 1;

      const contact = await resolveHouseholdContact(ctx.db, row.household_id);
      const expiresOnDisplay = formatCivilDate(toCivilDateString(expiresOn));

      for (const touch of due) {
        await markTouchSent(ctx.db, row.household_id, touch);
        if (!contact) continue;
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
