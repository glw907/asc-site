// /my-account/classes: register (the who's-taking-it selector, age-gated by track, credit
// auto-applied), my classes, withdraw (reversing credit + the freed-spot auto-offer), waitlist
// join/leave, and a live offer's claim/pass (design doc's own "2. Classes"). Every write goes
// through `$member-portal/lib/classes.ts`; this route is composition and form-parsing only.
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isPubliclyOpen, listClassesWithCounts, type ClassWithCounts } from '$admin-club/lib/classes-store';
import { hasActiveOfferForClass } from '$admin-club/lib/offers';
import type { EmailBindingEnv } from '$admin-club/lib/club-email';
import {
  claimOfferFromPortal,
  joinWaitlist,
  leaveWaitlist,
  listEnrolleeOptions,
  listMyClasses,
  listMyWaitlistEntries,
  passOfferFromPortal,
  registerForClass,
  withdrawFromClass,
  type EnrolleeOption,
} from '$member-portal/lib/classes';
import { portalAction } from '$member-portal/lib/portal-action';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';

export const prerender = false;

/** One open (or waitlist-only) class, with its own enrollee options already resolved: the
 *  register form's own per-class need. */
export interface OpenClassRow extends ClassWithCounts {
  open: boolean;
  enrollees: EnrolleeOption[];
}

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, openClasses: [], myClasses: [], myWaitlist: [] };

  const allClasses = await listClassesWithCounts(db);
  const visible = allClasses.filter((cls) => cls.visible);
  const openClasses: OpenClassRow[] = await Promise.all(
    visible.map(async (cls) => {
      const hasActiveOffer = await hasActiveOfferForClass(db, cls.id);
      const enrollees = await listEnrolleeOptions(db, member.householdId, cls.track);
      return { ...cls, open: isPubliclyOpen(cls, hasActiveOffer), enrollees };
    }),
  );

  const [myClasses, myWaitlist] = await Promise.all([listMyClasses(db, member.householdId), listMyWaitlistEntries(db, member.householdId)]);

  return { csrf, openClasses, myClasses, myWaitlist };
};

export const actions: Actions = {
  register: portalAction(async ({ form, ctx }) => {
    const classId = String(form.get('classId') ?? '');
    const memberId = String(form.get('memberId') ?? '');
    if (!classId || !memberId) return { error: 'Please choose who is taking this class.' };
    const result = await registerForClass(ctx.db, { classId, memberId, householdId: ctx.member.householdId, actorMemberId: ctx.member.id });
    if ('error' in result) return { error: result.error };
    return { registered: true as const };
  }),

  joinWaitlist: portalAction(async ({ form, ctx }) => {
    const classId = String(form.get('classId') ?? '');
    const memberId = String(form.get('memberId') ?? '');
    if (!classId || !memberId) return { error: 'Please choose who is joining the waitlist.' };
    const result = await joinWaitlist(ctx.db, { classId, memberId });
    if ('error' in result) return { error: result.error };
    return { waitlisted: true as const };
  }),

  withdraw: portalAction(async ({ form, ctx, event }) => {
    const enrollmentId = String(form.get('enrollmentId') ?? '');
    if (!enrollmentId) return { error: 'Missing enrollment id.' };
    const env = event.platform?.env as EmailBindingEnv | undefined;
    const result = await withdrawFromClass(ctx.db, {
      enrollmentId,
      householdId: ctx.member.householdId,
      notify: env?.EMAIL ? { env, origin: event.url.origin } : undefined,
    });
    if ('error' in result) return { error: result.error };
    return { withdrawn: true as const };
  }),

  leaveWaitlist: portalAction(async ({ form, ctx }) => {
    const waitlistId = String(form.get('waitlistId') ?? '');
    if (!waitlistId) return { error: 'Missing waitlist id.' };
    const result = await leaveWaitlist(ctx.db, waitlistId, ctx.member.householdId);
    if ('error' in result) return { error: result.error };
    return { left: true as const };
  }),

  claimOffer: portalAction(async ({ form, ctx }) => {
    const waitlistId = String(form.get('waitlistId') ?? '');
    if (!waitlistId) return { error: 'Missing waitlist id.' };
    const result = await claimOfferFromPortal(ctx.db, waitlistId, ctx.member.householdId);
    if ('error' in result) return { error: result.error };
    return { claimed: true as const };
  }),

  passOffer: portalAction(async ({ form, ctx }) => {
    const waitlistId = String(form.get('waitlistId') ?? '');
    if (!waitlistId) return { error: 'Missing waitlist id.' };
    const result = await passOfferFromPortal(ctx.db, waitlistId, ctx.member.householdId);
    if ('error' in result) return { error: result.error };
    return { passed: true as const };
  }),
};
