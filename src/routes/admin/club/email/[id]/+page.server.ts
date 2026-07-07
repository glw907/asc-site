// The Email template edit screen (pass 2.3): the stored subject/body, its known variable
// vocabulary, and a sample-data preview through `club-email.ts`'s own send-time render. Both
// writes are routine content (owner or admin, not owner-only, the same trust level Classes'
// own `update` action uses), and both audit under the shared `email-template` entity.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import {
  findUnknownVariables,
  getEmailTemplateWithDefaults,
  getKnownVariables,
  resetEmailTemplate,
  updateEmailTemplate,
  type EmailTemplateWithDefaults,
} from '$admin-club/lib/email-templates-store';

/** See `classes/[id]/+page.server.ts`'s identical `routeId` for why this narrow cast is safe:
 *  `AdminActionEvent` (the type `clubAdminAction`'s handler receives) is a structural subset that
 *  drops `params`, even though the real SvelteKit event underneath always carries it. */
function routeId(event: unknown): string {
  return (event as { params: { id: string } }).params.id;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  const id = event.params.id;
  if (!db) {
    return { template: null as EmailTemplateWithDefaults | null, knownVariables: [] as readonly string[], error: 'CLUB_DB is not bound.' };
  }
  const template = await getEmailTemplateWithDefaults(db, id);
  return { template, knownVariables: getKnownVariables(id) ?? [], error: null as string | null };
};

const DENIED_MESSAGE = 'A club role is required to manage email templates.';

export const actions: Actions = {
  save: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const subject = form.get('subject');
      const body = form.get('body');
      if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
        ctx.audit({ action: 'update', entity: 'email-template', entityId: id, detail: 'rejected: missing subject or body' });
        return fail(400, { error: 'A subject and a body are both required.' });
      }
      const unknown = findUnknownVariables(id, subject, body);
      await updateEmailTemplate(ctx.db, id, { subject: subject.trim(), body }, ctx.editor.email);
      ctx.audit({
        action: 'update',
        entity: 'email-template',
        entityId: id,
        detail: unknown.length > 0 ? `unknown variables: ${unknown.join(', ')}` : undefined,
      });
      return {
        ok: true,
        warning: unknown.length > 0 ? `This template does not use ${unknown.map((token) => `{{${token}}}`).join(', ')}.` : null,
      };
    },
    { action: 'update', entity: 'email-template', deniedMessage: DENIED_MESSAGE },
  ),

  reset: clubAdminAction(
    async ({ event, ctx }) => {
      const id = routeId(event);
      const result = await resetEmailTemplate(ctx.db, id, ctx.editor.email);
      if (!result.ok) {
        ctx.audit({ action: 'reset', entity: 'email-template', entityId: id, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      ctx.audit({ action: 'reset', entity: 'email-template', entityId: id });
      return { ok: true, reset: true, template: result.template };
    },
    { action: 'reset', entity: 'email-template', deniedMessage: DENIED_MESSAGE },
  ),
};
