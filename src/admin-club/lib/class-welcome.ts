// The welcome touch of the class-reminder set (`src/jobs/class-reminders.ts`'s own header): the
// one touch of the four that fires synchronously from an enrollment action itself, never from a
// cron job, so it lives here rather than in `src/jobs/`. Both of this site's enrollment write
// paths call it: `enrollments.ts`'s `signUpForClass` (the enrolled branch; a waitlist join has no
// enrollment yet to welcome) and `offers.ts`'s `claimOffer` (a waitlisted person accepting a
// later offer). One shared function so both call sites send identically rather than each
// reimplementing the template call and the `class_reminders_sent` marker.
import type { D1Database } from '@cloudflare/workers-types';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import { resolveClassContact } from './class-contact';
import type { ClassTrack } from './classes-store';

const TEMPLATE_ID = 'class_welcome';
const COMMITTEE_EMAIL = 'program-committee@aksailingclub.org';

/** Substituted into the `class_welcome` template's `{{youth_note}}` variable for a youth-track
 *  enrollment; empty otherwise (an empty paragraph collapses cleanly, `club-email.ts`'s own
 *  `markdownToHtml` already drops a blank paragraph after splitting on blank lines). Ordinary
 *  variable substitution, not template-side conditional syntax, the same "no conditional syntax
 *  in the template body" convention every other ported/authored template in this site follows. */
const YOUTH_NOTE = '**For youth classes:** a parent or guardian must be on premises for the full session, per club policy.';

export interface ClassWelcomeArgs {
  enrollmentId: string;
  className: string;
  track: ClassTrack;
  memberId: string;
}

/**
 * Send the welcome email for one newly enrolled participant, and mark `class_reminders_sent`'s
 * own `welcome` touch (migration 0012_class_reminders' CHECK vocabulary, shared with the cron-
 * driven touches so a future admin screen can read one table for "has this participant received
 * every touch" regardless of which code path sent which one). Best-effort and never throws, the
 * same posture `offerSpot`'s own notify branch documents: a notification failure must never undo
 * or fail the enrollment that already committed by the time this runs. `env` is `undefined` when
 * the caller has no EMAIL binding wired (or chooses not to notify), in which case this is a
 * no-op: unlike `sendClubEmail`'s own graceful degrade (still writes a `'failed'` email_log row),
 * a signup with no binding configured at all has no reason to write a doomed log row for every
 * single enrollment.
 */
export async function sendClassWelcomeEmail(db: D1Database, env: EmailBindingEnv | undefined, args: ClassWelcomeArgs): Promise<void> {
  if (!env) return;
  try {
    await db
      .prepare('INSERT OR IGNORE INTO class_reminders_sent (enrollment_id, touch) VALUES (?1, ?2)')
      .bind(args.enrollmentId, 'welcome')
      .run();
    const contact = await resolveClassContact(db, args.memberId, args.track);
    if (!contact) return;
    await sendClubEmail(db, env, {
      to: contact.email,
      templateId: TEMPLATE_ID,
      vars: {
        person_name: contact.name,
        item_display_name: args.className,
        youth_note: args.track === 'youth' ? YOUTH_NOTE : '',
        committee_email: COMMITTEE_EMAIL,
      },
    });
  } catch (err) {
    console.error('admin/club: class welcome email failed', err);
  }
}
