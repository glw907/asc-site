// The shared bulk-send helper (segment-email, docs/2026-07-14-segment-email-design.md): the
// chunked delivery loop `announcements.ts`'s own `sendAnnouncementEmails` used to own directly
// (`chunkRecipients`/`RECIPIENT_CHUNK_SIZE`, now re-exported from here) plus the Compose screen's
// own two send paths -- a real segment blast (`sendSegmentBlast`, recorded to `email_blasts`) and
// a one-recipient test send (`sendBlastTest`, logged but never recorded as a blast). Both send
// paths go through `club-email.ts`'s `sendClubEmail` per recipient, exactly as Announce and every
// other consumer of that module does: per-recipient failures are counted, never fatal
// (`sendClubEmail`'s own never-throws contract), and every send's variable substitution runs
// through that module's own `raw` path rather than a parallel renderer.
import type { D1Database } from '@cloudflare/workers-types';
import { sendClubEmail, type EmailBindingEnv } from './club-email';
import type { ResolvedSegment } from './segments';

/** `bulk-email.ts`'s own env slice beyond {@link EmailBindingEnv}: `PUBLIC_ORIGIN` builds the
 *  `{{portal_url}}` variable, the same optional-var shape `src/jobs/renewal-reminders.ts` and
 *  `stripe-reconcile.ts`'s own `ReconcileJoinEnv` already establish for the identical need (never
 *  a request header, since a send has no browser origin worth trusting). */
export interface BulkEmailEnv extends EmailBindingEnv {
  PUBLIC_ORIGIN?: string;
}

/** The Compose screen's own general contact address for `{{committee_email}}`, matching
 *  `renewal-reminders.ts`'s own choice for a membership-wide send: a segment blast can target any
 *  audience (current members, a class roster, instructors), so it uses the club's general
 *  membership contact rather than a class-specific one (`class-welcome.ts`'s
 *  `program-committee@aksailingclub.org`, reserved for class-specific sends). */
const COMMITTEE_EMAIL = 'membership-committee@aksailingclub.org';

/** The Cloudflare Email Sending API's own combined to/cc/bcc cap per call (50); a chunked send
 *  fires one recipient per call (`sendClubEmail`'s own per-recipient log write needs it), so this
 *  bounds how many concurrent `EMAIL.send()` subrequests one chunk fires at once, not any one
 *  call's own recipient count. */
export const RECIPIENT_CHUNK_SIZE = 50;

/** Split `items` into consecutive groups of at most `size`, preserving order. A pure utility with
 *  no D1 or network dependency, so the chunking behavior itself is directly testable. */
export function chunkRecipients<T>(items: readonly T[], size = RECIPIENT_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error('chunkRecipients: size must be positive');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** The outcome of sending `items` through `sendOne`, chunked at {@link RECIPIENT_CHUNK_SIZE}
 *  concurrent sends per batch (batches run one after another). A single failed send never aborts
 *  the run -- `sendOne`'s own `{ ok: boolean }` result is counted, not thrown. */
async function sendChunked<T>(
  items: readonly T[],
  sendOne: (item: T) => Promise<{ ok: boolean }>,
): Promise<{ sentCount: number; failedCount: number }> {
  let sentCount = 0;
  let failedCount = 0;
  for (const chunk of chunkRecipients(items)) {
    const outcomes = await Promise.all(chunk.map(sendOne));
    for (const outcome of outcomes) {
      if (outcome.ok) sentCount += 1;
      else failedCount += 1;
    }
  }
  return { sentCount, failedCount };
}

/** The two variables every blast/test send resolves independent of the recipient's own identity:
 *  `{{portal_url}}` from `PUBLIC_ORIGIN` (the same `/my-account` link `renewal-reminders.ts` sends)
 *  and `{{committee_email}}`. `{{person_name}}` is the caller's own per-recipient value, threaded
 *  in by each of this module's two send functions below. */
function sharedBlastVars(env: BulkEmailEnv): Record<string, string> {
  return { portal_url: `${env.PUBLIC_ORIGIN ?? ''}/my-account`, committee_email: COMMITTEE_EMAIL };
}

export interface SendSegmentBlastArgs {
  segment: ResolvedSegment;
  subject: string;
  body: string;
  actor: string;
}

export interface SendSegmentBlastResult {
  blastId: string;
  sentCount: number;
  failedCount: number;
}

/**
 * Send `args.subject`/`args.body` to every recipient `args.segment` resolved to, one
 * `sendClubEmail` call per recipient (`{{person_name}}` rendered from that recipient's own
 * `personName`, see {@link sharedBlastVars} for the other two variables), tagging each send's
 * `email_log` row `segment = 'blast:<id>'`.
 *
 * The `email_blasts` row is INSERTed BEFORE any send goes out (`recipient_count` the segment's
 * own resolved size, `sent_count`/`failed_count` both 0), then UPDATEd with the real outcome counts
 * once every send has settled. Writing the row up front means a D1 failure partway through (or
 * after) the sends never loses the audit trail for a blast that already reached its recipients --
 * the old write-once-at-the-end shape could lose that row for a run of ~285 real sends and invite
 * a duplicate re-blast. The final UPDATE's own failure is caught and logged, never rejecting this
 * call: the sends already happened, and the caller's returned counts are the real ones either way.
 */
export async function sendSegmentBlast(env: BulkEmailEnv, db: D1Database, args: SendSegmentBlastArgs): Promise<SendSegmentBlastResult> {
  const blastId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO email_blasts (id, segment_key, segment_label, subject, body, recipient_count, sent_count, failed_count, actor)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7)`,
    )
    .bind(blastId, args.segment.key, args.segment.label, args.subject, args.body, args.segment.recipients.length, args.actor)
    .run();

  const { sentCount, failedCount } = await sendChunked(args.segment.recipients, (recipient) =>
    sendClubEmail(db, env, {
      to: recipient.email,
      raw: { subject: args.subject, body: args.body },
      vars: { person_name: recipient.personName, ...sharedBlastVars(env) },
      segment: `blast:${blastId}`,
    }),
  );

  try {
    await db.prepare(`UPDATE email_blasts SET sent_count = ?1, failed_count = ?2 WHERE id = ?3`).bind(sentCount, failedCount, blastId).run();
  } catch (error) {
    console.error('sendSegmentBlast: failed to record final counts on email_blasts', blastId, error);
  }

  return { blastId, sentCount, failedCount };
}

/** The name a test send renders `{{person_name}}` as when `recipient` matches a real, non-archived
 *  member on file: that member's own name, so an editor testing against their own address sees a
 *  realistic render. Falls back to this sample name for an address with no matching member (an
 *  editor's personal inbox that never joined as a member, or any other test address). */
const SAMPLE_TEST_PERSON_NAME = 'Sample Member';

async function resolveTestPersonName(db: D1Database, email: string): Promise<string> {
  const member = await db
    .prepare('SELECT name FROM members WHERE email = ?1 AND archived_at IS NULL LIMIT 1')
    .bind(email)
    .first<{ name: string }>();
  return member?.name ?? SAMPLE_TEST_PERSON_NAME;
}

export interface SendBlastTestArgs {
  recipient: string;
  subject: string;
  body: string;
}

export type SendBlastTestResult = { ok: true } | { ok: false; error: string };

/**
 * Send one test render of `args.subject`/`args.body` to `args.recipient` only (the review step's
 * "Send test to me", always the signed-in editor's own address -- see the Compose route action for
 * that constraint). `{{person_name}}` resolves through {@link resolveTestPersonName}; logged with
 * `segment = 'blast-test'` and, unlike {@link sendSegmentBlast}, writes no `email_blasts` row: a
 * test send is not a blast the history list should ever show.
 */
export async function sendBlastTest(env: BulkEmailEnv, db: D1Database, args: SendBlastTestArgs): Promise<SendBlastTestResult> {
  const personName = await resolveTestPersonName(db, args.recipient);
  const outcome = await sendClubEmail(db, env, {
    to: args.recipient,
    raw: { subject: args.subject, body: args.body },
    vars: { person_name: personName, ...sharedBlastVars(env) },
    segment: 'blast-test',
  });
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}

/** One `email_blasts` row, camelCased. */
export interface EmailBlastRow {
  id: string;
  segmentKey: string;
  segmentLabel: string;
  subject: string;
  body: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  actor: string;
  createdAt: string;
}

interface EmailBlastRawRow {
  id: string;
  segment_key: string;
  segment_label: string;
  subject: string;
  body: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  actor: string;
  created_at: string;
}

function toBlastRow(row: EmailBlastRawRow): EmailBlastRow {
  return {
    id: row.id,
    segmentKey: row.segment_key,
    segmentLabel: row.segment_label,
    subject: row.subject,
    body: row.body,
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

/** Every past blast, newest first: the Compose screen's own landing/history list. */
export async function listBlasts(db: D1Database, limit = 100): Promise<EmailBlastRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, segment_key, segment_label, subject, body, recipient_count, sent_count, failed_count, actor, created_at
       FROM email_blasts ORDER BY created_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<EmailBlastRawRow>();
  return results.map(toBlastRow);
}
