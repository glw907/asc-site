// The Compose screen (`/admin/club/email/compose`, segment-email,
// docs/2026-07-14-segment-email-design.md): a one-off email to a picked segment, gated by the
// design's count-confirm + test-send safety flow. One route, three actions, no `[id]` detail (a
// blast has nothing to edit after it sends, only its own history in `email_blasts`):
//
// - `review` resolves the picked segment server-side and hands back its exact count, label, and a
//   sample of recipients, so the review step never shows a client-guessed number.
// - `test` always sends to the signed-in editor's own address (`sendBlastTest` never reads a
//   recipient off the form), the review step's "Send test to me".
// - `send` resolves the segment a SECOND time, from scratch, before calling `sendSegmentBlast`.
//   It never trusts `review`'s earlier count, or anything else the client posts back: a household
//   could join or lapse between the review click and the send click, and the recorded
//   `email_blasts` row must reflect who the segment reaches right now, not a stale snapshot.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { clubAdminAction } from '$admin-club/lib/club-action';
import { listSegmentOptions, resolveSegment, type SegmentKey, type SegmentOption, type SegmentRecipient } from '$admin-club/lib/segments';
import { listBlasts, sendBlastTest, sendSegmentBlast, type BulkEmailEnv, type EmailBlastRow } from '$admin-club/lib/bulk-email';

/** How many resolved recipients the review step shows by name, enough to spot-check "did this
 *  segment resolve to who I expect" without dumping a full roster into the page. */
const SAMPLE_RECIPIENT_LIMIT = 8;

const DENIED_MESSAGE = 'A club role is required to send club email.';

/**
 * Resolve the `segment` deep-link query param (the "Email class members" nav entry, T5) to an
 * initial segment-picker value. An exact match against a real picker option's key wins first; the
 * literal sentinel `class` preselects the picker's own first class option (current-season classes
 * sort before older ones, {@link listSegmentOptions}) since the segment vocabulary has no single
 * "all class members" key, only one `class:<id>` per class. Any other value, or `class` when the
 * picker has no class option at all, falls back to no preselection -- never an error, the same
 * empty-picker state the plain compose screen already renders.
 */
function resolvePresetSegmentKey(param: string | null, options: readonly SegmentOption[]): SegmentKey | null {
  if (!param) return null;
  const exact = options.find((option) => option.key === param);
  if (exact) return exact.key;
  if (param === 'class') {
    const firstClass = options.find((option) => option.key.startsWith('class:'));
    return firstClass ? (firstClass.key as SegmentKey) : null;
  }
  return null;
}

export const load: PageServerLoad = async (event) => {
  const editor = requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return {
      blasts: [] as EmailBlastRow[],
      segmentOptions: [] as SegmentOption[],
      editorEmail: editor.email,
      error: 'CLUB_DB is not bound.',
      presetSegmentKey: null as SegmentKey | null,
    };
  }
  const [blasts, segmentOptions] = await Promise.all([listBlasts(db), listSegmentOptions(db)]);
  const presetSegmentKey = resolvePresetSegmentKey(event.url.searchParams.get('segment'), segmentOptions);
  return { blasts, segmentOptions, editorEmail: editor.email, error: null as string | null, presetSegmentKey };
};

/** The three fields every action here reads off the compose form; `body` is deliberately not
 *  trimmed (leading/trailing blank lines are the author's own markdown, `subject` is). */
function readComposeFields(form: FormData): { segmentKey: string; subject: string; body: string } {
  return {
    segmentKey: String(form.get('segmentKey') ?? '').trim(),
    subject: String(form.get('subject') ?? '').trim(),
    body: String(form.get('body') ?? ''),
  };
}

export interface ComposeReviewResult {
  kind: 'review';
  segmentKey: string;
  segmentLabel: string;
  recipientCount: number;
  sample: SegmentRecipient[];
}

export interface ComposeTestResult {
  kind: 'test';
  ok: boolean;
  error: string | null;
}

export interface ComposeSendResult {
  kind: 'sent';
  blastId: string;
  segmentLabel: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

export const actions: Actions = {
  review: clubAdminAction(
    async ({ form, ctx }) => {
      const { segmentKey, subject, body } = readComposeFields(form);
      if (!segmentKey || !subject || !body.trim()) {
        ctx.audit({ action: 'compose-review', entity: 'email-blast', detail: 'rejected: missing segment, subject, or body' });
        return fail(400, { error: 'Pick a segment and write a subject and body.' });
      }
      let segment;
      try {
        segment = await resolveSegment(ctx.db, segmentKey as SegmentKey);
      } catch {
        ctx.audit({ action: 'compose-review', entity: 'email-blast', detail: `rejected: unknown segment ${segmentKey}` });
        return fail(400, { error: 'Unknown segment.' });
      }
      ctx.audit({
        action: 'compose-review',
        entity: 'email-blast',
        detail: `segment ${segment.key}: ${segment.recipients.length} recipient(s)`,
      });
      const result: ComposeReviewResult = {
        kind: 'review',
        segmentKey: segment.key,
        segmentLabel: segment.label,
        recipientCount: segment.recipients.length,
        sample: segment.recipients.slice(0, SAMPLE_RECIPIENT_LIMIT),
      };
      return result;
    },
    { action: 'compose-review', entity: 'email-blast', deniedMessage: DENIED_MESSAGE },
  ),

  test: clubAdminAction(
    async ({ event, form, ctx }) => {
      const { subject, body } = readComposeFields(form);
      if (!subject || !body.trim()) {
        ctx.audit({ action: 'compose-test', entity: 'email-blast', detail: 'rejected: missing subject or body' });
        return fail(400, { error: 'Write a subject and body before sending a test.' });
      }
      // `sendBlastTest`'s own `recipient` is always the signed-in editor's address: the form never
      // supplies one, so there is no field for a client to override.
      const env = (event.platform?.env ?? {}) as BulkEmailEnv;
      const outcome = await sendBlastTest(env, ctx.db, { recipient: ctx.editor.email, subject, body });
      ctx.audit({
        action: 'compose-test',
        entity: 'email-blast',
        detail: outcome.ok ? undefined : `failed: ${outcome.error}`,
      });
      const result: ComposeTestResult = { kind: 'test', ok: outcome.ok, error: outcome.ok ? null : outcome.error };
      return result;
    },
    { action: 'compose-test', entity: 'email-blast', deniedMessage: DENIED_MESSAGE },
  ),

  send: clubAdminAction(
    async ({ event, form, ctx }) => {
      const { segmentKey, subject, body } = readComposeFields(form);
      const confirmed = form.get('confirm') === 'on';
      // `stage: 'review'` on every failure below: the send action only ever runs from the review
      // step (there is no other form on this screen posting to `?/send`), so the client renders
      // these inline near the review step's own actions rather than the page-top banner the
      // compose step's own `review` action failures use.
      if (!segmentKey || !subject || !body.trim()) {
        ctx.audit({ action: 'compose-send', entity: 'email-blast', detail: 'rejected: missing segment, subject, or body' });
        return fail(400, { error: 'Pick a segment and write a subject and body.', stage: 'review' as const });
      }
      if (!confirmed) {
        ctx.audit({ action: 'compose-send', entity: 'email-blast', detail: 'rejected: send not confirmed' });
        return fail(400, { error: 'Confirm the recipient count before sending.', stage: 'review' as const });
      }
      // Re-resolved from scratch, ignoring any count or recipient list the client posted back
      // from an earlier `review` call: this is the only recipient set `sendSegmentBlast` ever
      // sees, and the only one `email_blasts.recipient_count` is ever derived from.
      let segment;
      try {
        segment = await resolveSegment(ctx.db, segmentKey as SegmentKey);
      } catch {
        ctx.audit({ action: 'compose-send', entity: 'email-blast', detail: `rejected: unknown segment ${segmentKey}` });
        return fail(400, { error: 'Unknown segment.', stage: 'review' as const });
      }
      const env = (event.platform?.env ?? {}) as BulkEmailEnv;
      const outcome = await sendSegmentBlast(env, ctx.db, { segment, subject, body, actor: ctx.editor.email });
      ctx.audit({
        action: 'compose-send',
        entity: 'email-blast',
        entityId: outcome.blastId,
        detail: `segment ${segment.key}: sent ${outcome.sentCount}, failed ${outcome.failedCount} of ${segment.recipients.length}`,
      });
      const result: ComposeSendResult = {
        kind: 'sent',
        blastId: outcome.blastId,
        segmentLabel: segment.label,
        recipientCount: segment.recipients.length,
        sentCount: outcome.sentCount,
        failedCount: outcome.failedCount,
      };
      return result;
    },
    { action: 'compose-send', entity: 'email-blast', deniedMessage: DENIED_MESSAGE },
  ),
};
