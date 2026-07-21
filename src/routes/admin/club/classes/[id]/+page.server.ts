// The Classes edit screen (Task 6): the detail form's load (class, its assigned instructors, and
// its named-and-aged enrolled roster), plus the update, delete, and instructor-assignment
// actions. A miss on `id` returns an honest `class: null` rather than SvelteKit's `error(404)`,
// the same reasoning `events/[id]/+page.server.ts`'s own header documents. Task 7 adds the
// waitlist section and its offer machine: the load sweeps stale offers before reading anything
// else, so the per-entry state it hands the page is never a moment behind an expiry. The Classes
// pass Task 4 rebuild (docs/2026-07-21-classes-pass-design.md) adds `recordPayment`, the roster's
// own manual (check/cash/comp) payment action; roster ordering and section layout move to the
// rebuilt `+page.svelte`, this file's own load/action shape is otherwise unchanged.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireSession } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { clubAdminAction } from '$admin-club/lib/club-action';
import {
  addInstructor,
  buildClassPayment,
  deleteClass,
  getClass,
  getClassWithCounts,
  getWaitlistMemberNames,
  listClassesWithCounts,
  listEnrollments,
  listInstructors,
  listWaitlist,
  removeInstructor,
  updateClass,
  type ClassInstructor,
  type ClassPaymentSource,
  type ClassWithCounts,
  type EnrollmentRow,
  type WaitlistRow,
} from '$admin-club/lib/classes-store';
import { cancelActiveOffer, expireStaleOffers, listOffersForClass, offerSpot, type OfferRow } from '$admin-club/lib/offers';
import { transferEnrollment } from '$admin-club/lib/class-transfer';
import { adminDropEnrollment } from '$member-portal/lib/classes';
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
      waitlistMemberNames: {} as Record<string, string>,
      offers: [] as OfferRow[],
      classesInSeason: [] as ClassWithCounts[],
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
  // A member-sourced waitlist entry (`memberId` set) carries no name of its own on `WaitlistRow`
  // (`classes-store.ts`'s own header on why that shared shape stays untouched): one small side
  // query, scoped to just this class's own queued members, resolves the names the roster needs
  // to distinguish a member entry from an applicant one, serialized as a plain object (SvelteKit's
  // own load convention, matching `announce/+page.server.ts`'s identical Map-to-array habit).
  const memberIds = [...new Set(waitlist.map((entry) => entry.memberId).filter((id): id is string => id !== null))];
  const waitlistMemberNames = Object.fromEntries(await getWaitlistMemberNames(db, memberIds));
  // The Move… destination picker's own candidates (Task 5): every other class in the same
  // season, including the current one -- the page's own template excludes it by id, so the
  // load stays a plain, reusable season-scoped read rather than a bespoke "every class but
  // this one" query.
  const classesInSeason = row ? await listClassesWithCounts(db, row.season) : [];
  return { class: row, instructors, enrollments, waitlist, waitlistMemberNames, offers, classesInSeason, error: null as string | null };
};

const DENIED_MESSAGE = 'A club role is required to manage classes.';

function optionalField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

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
      redirect(303, '/admin/club/classes');
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
      // `PUBLIC_ORIGIN` (never a request header, per that binding's own doc comment) builds the
      // claim link; `EMAIL` may be unbound in some environments, and `offerSpot`'s own `notify`
      // handling degrades gracefully either way (this module's own header on why).
      const platformEnv = event.platform?.env;
      const origin = platformEnv?.PUBLIC_ORIGIN;
      const result = await offerSpot(ctx.db, {
        classId: id,
        waitlistId,
        actorEmail: ctx.editor.email,
        notify: platformEnv && origin ? { env: platformEnv, origin } : undefined,
      });
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

  // portal-capstone: the admin's own drop action, reusing the exact freed-spot-aware, reversing-
  // credit, auto-offering withdrawal a member's own self-service withdraw performs
  // (`$member-portal/lib/classes.ts`'s `adminDropEnrollment`), never a second copy of that logic.
  dropEnrollment: clubAdminAction(
    async ({ event, form, ctx }) => {
      const enrollmentId = form.get('enrollmentId');
      if (typeof enrollmentId !== 'string' || !enrollmentId.trim()) {
        ctx.audit({ action: 'drop', entity: 'enrollment', detail: 'rejected: missing enrollmentId' });
        return fail(400, { error: 'An enrollment is required.' });
      }
      const platformEnv = event.platform?.env;
      const origin = platformEnv?.PUBLIC_ORIGIN;
      const result = await adminDropEnrollment(ctx.db, {
        enrollmentId,
        notify: platformEnv && origin ? { env: platformEnv, origin } : undefined,
      });
      if ('error' in result) {
        ctx.audit({ action: 'drop', entity: 'enrollment', entityId: enrollmentId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      ctx.audit({ action: 'drop', entity: 'enrollment', entityId: enrollmentId, detail: result.autoOfferedTo ? `auto-offered:${result.autoOfferedTo}` : 'no-queue' });
      return { ok: true, dropped: true as const };
    },
    { action: 'drop', entity: 'enrollment', deniedMessage: DENIED_MESSAGE },
  ),

  // The roster's own Move… action (Task 5): a same-price transfer proceeds on its own; a fee
  // mismatch refuses unless the form's own `confirmFeeMismatch` checkbox already agreed to it
  // (the page's own dialog blocks the submit until then, this is the server-side backstop).
  transfer: clubAdminAction(
    async ({ event, form, ctx }) => {
      const id = routeId(event);
      const enrollmentId = form.get('enrollmentId');
      const destinationClassId = form.get('destinationClassId');
      if (typeof enrollmentId !== 'string' || !enrollmentId.trim()) {
        ctx.audit({ action: 'transfer', entity: 'enrollment', entityId: id, detail: 'rejected: missing enrollmentId' });
        return fail(400, { error: 'An enrollment is required.' });
      }
      if (typeof destinationClassId !== 'string' || !destinationClassId.trim()) {
        ctx.audit({ action: 'transfer', entity: 'enrollment', entityId: enrollmentId, detail: 'rejected: missing destinationClassId' });
        return fail(400, { error: 'A destination class is required.' });
      }
      const platformEnv = event.platform?.env;
      const origin = platformEnv?.PUBLIC_ORIGIN;
      const result = await transferEnrollment(ctx.db, {
        enrollmentId,
        destinationClassId,
        actorEmail: ctx.editor.email,
        confirmFeeMismatch: form.get('confirmFeeMismatch') === 'true',
        notify: platformEnv && origin ? { env: platformEnv, origin } : undefined,
      });
      if ('error' in result) {
        ctx.audit({ action: 'transfer', entity: 'enrollment', entityId: enrollmentId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      ctx.audit({ action: 'transfer', entity: 'enrollment', entityId: enrollmentId, detail: `to=${destinationClassId}` });
      return { ok: true, transferred: true as const };
    },
    { action: 'transfer', entity: 'enrollment', deniedMessage: DENIED_MESSAGE },
  ),

  // The roster's own manual (check/cash/comp) payment action (Task 4, the design doc's own
  // "Manual payments" section): rare but real, so the amount is always the class's current fee,
  // never an admin-typed figure (`buildClassPayment`'s own header). Fails closed on an unknown
  // enrollment or one already paid, rather than double-charging it.
  recordPayment: clubAdminAction(
    async ({ form, ctx }) => {
      const enrollmentId = form.get('enrollmentId');
      const source = form.get('source');
      const memo = optionalField(form, 'memo');
      if (typeof enrollmentId !== 'string' || !enrollmentId.trim()) {
        ctx.audit({ action: 'record-payment', entity: 'transaction', detail: 'rejected: missing enrollmentId' });
        return fail(400, { error: 'An enrollment is required.' });
      }
      const validSource = source === 'check' || source === 'cash' || source === 'comp';
      if (!validSource) {
        ctx.audit({ action: 'record-payment', entity: 'transaction', entityId: enrollmentId, detail: 'rejected: invalid source' });
        return fail(400, { error: 'A payment source is required.' });
      }
      const result = await buildClassPayment(ctx.db, { enrollmentId, source: source as ClassPaymentSource, memo });
      if (!result.ok) {
        ctx.audit({ action: 'record-payment', entity: 'transaction', entityId: enrollmentId, detail: `rejected: ${result.error}` });
        return fail(400, { error: result.error });
      }
      await ctx.db.batch(result.statements);
      ctx.audit({ action: 'record-payment', entity: 'transaction', entityId: enrollmentId, detail: `amount_cents=${result.amountCents}` });
      return { ok: true };
    },
    { action: 'record-payment', entity: 'transaction', deniedMessage: DENIED_MESSAGE },
  ),
};
