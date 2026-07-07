// The Classes edit screen (Task 6): the detail form's load (class, its assigned instructors, and
// its read-only enrolled roster), plus the update, delete, and instructor-assignment actions. A
// miss on `id` returns an honest `class: null` rather than SvelteKit's `error(404)`, the same
// reasoning `events/[id]/+page.server.ts`'s own header documents. Task 7 adds the waitlist section
// and its offer machine: the load sweeps stale offers before reading anything else, so the
// per-entry state it hands the page is never a moment behind an expiry.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { clubAdminAction } from '$admin-club/lib/club-action';
import {
  addInstructor,
  deleteClass,
  getClass,
  getClassWithCounts,
  listEnrollments,
  listInstructors,
  listWaitlist,
  removeInstructor,
  updateClass,
  type ClassInstructor,
  type ClassWithCounts,
  type EnrollmentRow,
  type WaitlistRow,
} from '$admin-club/lib/classes-store';
import { cancelActiveOffer, expireStaleOffers, listOffersForClass, offerSpot, type OfferRow } from '$admin-club/lib/offers';
import { parseClassForm } from '../class-form-input';

/** See `events/[id]/+page.server.ts`'s identical `routeId` for why this narrow cast is safe. */
function routeId(event: unknown): string {
  return (event as { params: { id: string } }).params.id;
}

export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const db = resolveClubDb(event.platform?.env);
  if (!db) {
    return {
      class: null as ClassWithCounts | null,
      instructors: [] as ClassInstructor[],
      enrollments: [] as EnrollmentRow[],
      waitlist: [] as WaitlistRow[],
      offers: [] as OfferRow[],
      error: 'CLUB_DB is not bound.',
    };
  }
  const id = event.params.id;
  await expireStaleOffers(db);
  const [row, instructors, enrollments, waitlist, offers] = await Promise.all([
    getClassWithCounts(db, id),
    listInstructors(db, id),
    listEnrollments(db, id),
    listWaitlist(db, id),
    listOffersForClass(db, id),
  ]);
  return { class: row, instructors, enrollments, waitlist, offers, error: null as string | null };
};

const DENIED_MESSAGE = 'A club role is required to manage classes.';

export const actions: Actions = {
  update: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      if (!(await getClass(ctx.db, id))) {
        ctx.audit({ action: 'update', entity: 'class', entityId: id, detail: 'rejected: no such class' });
        return fail(404, { error: 'No such class.' });
      }
      const parsed = parseClassForm(form);
      if ('error' in parsed) {
        ctx.audit({ action: 'update', entity: 'class', entityId: id, detail: `rejected: ${parsed.error}` });
        return fail(400, { error: parsed.error });
      }
      await updateClass(ctx.db, id, parsed.write);
      ctx.audit({ action: 'update', entity: 'class', entityId: id });
      return { ok: true };
    },
    { action: 'update', entity: 'class', deniedMessage: DENIED_MESSAGE },
  ),

  delete: clubAdminAction(
    async ({ event, ctx }) => {
      const id = routeId(event);
      if (!(await getClass(ctx.db, id))) {
        ctx.audit({ action: 'delete', entity: 'class', entityId: id, detail: 'rejected: no such class' });
        return fail(404, { error: 'No such class.' });
      }
      await deleteClass(ctx.db, id);
      ctx.audit({ action: 'delete', entity: 'class', entityId: id });
      throw redirect(303, '/admin/club/classes');
    },
    { action: 'delete', entity: 'class', deniedMessage: DENIED_MESSAGE },
  ),

  assignInstructor: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const email = form.get('email');
      const name = form.get('name');
      if (typeof email !== 'string' || !email.trim()) {
        ctx.audit({ action: 'assign', entity: 'assignment', entityId: id, detail: 'rejected: missing email' });
        return fail(400, { error: 'An email is required.' });
      }
      const assignedEmail = email.trim();
      const displayName = typeof name === 'string' && name.trim() ? name.trim() : null;
      await addInstructor(ctx.db, id, assignedEmail, displayName);
      ctx.audit({ action: 'assign', entity: 'assignment', entityId: `${id}:${assignedEmail}` });
      return { ok: true };
    },
    { action: 'assign', entity: 'assignment', deniedMessage: DENIED_MESSAGE },
  ),

  unassignInstructor: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const email = form.get('email');
      if (typeof email !== 'string' || !email.trim()) {
        ctx.audit({ action: 'unassign', entity: 'assignment', entityId: id, detail: 'rejected: missing email' });
        return fail(400, { error: 'An email is required.' });
      }
      const removedEmail = email.trim();
      await removeInstructor(ctx.db, id, removedEmail);
      ctx.audit({ action: 'unassign', entity: 'assignment', entityId: `${id}:${removedEmail}` });
      return { ok: true };
    },
    { action: 'unassign', entity: 'assignment', deniedMessage: DENIED_MESSAGE },
  ),

  offer: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const waitlistId = form.get('waitlistId');
      if (typeof waitlistId !== 'string' || !waitlistId.trim()) {
        ctx.audit({ action: 'offer', entity: 'offer', entityId: id, detail: 'rejected: missing waitlistId' });
        return fail(400, { error: 'A waitlist entry is required.' });
      }
      const result = await offerSpot(ctx.db, { classId: id, waitlistId, actorEmail: ctx.editor.email });
      if ('error' in result) {
        ctx.audit({ action: 'offer', entity: 'offer', entityId: waitlistId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      ctx.audit({ action: 'offer', entity: 'offer', entityId: waitlistId });
      // The plaintext token is returned exactly once, here: only its hash reaches storage, so
      // this render is the admin's only chance to copy the claim link (the page's own comment).
      return { ok: true, offered: { waitlistId, token: result.token, expiresAt: result.expiresAt } };
    },
    { action: 'offer', entity: 'offer', deniedMessage: DENIED_MESSAGE },
  ),

  cancelOffer: clubAdminAction(
    async ({ form, ctx }) => {
      const waitlistId = form.get('waitlistId');
      if (typeof waitlistId !== 'string' || !waitlistId.trim()) {
        ctx.audit({ action: 'cancel-offer', entity: 'offer', detail: 'rejected: missing waitlistId' });
        return fail(400, { error: 'A waitlist entry is required.' });
      }
      const result = await cancelActiveOffer(ctx.db, waitlistId);
      if ('error' in result) {
        ctx.audit({ action: 'cancel-offer', entity: 'offer', entityId: waitlistId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      ctx.audit({ action: 'cancel-offer', entity: 'offer', entityId: waitlistId });
      return { ok: true };
    },
    { action: 'cancel-offer', entity: 'offer', deniedMessage: DENIED_MESSAGE },
  ),
};
