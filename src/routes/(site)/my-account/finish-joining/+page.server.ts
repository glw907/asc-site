// /my-account/finish-joining (member-waivers T5c): the join flow's payment-resume door, the money
// moment the household-complete gate defers a family (or a fresh solo purchaser) to once every
// member has signed (docs/2026-07-17-member-waivers-design.md ratified decision 7's amendment).
// Signatures precede payment throughout the join, so this route only ever unlocks a signature-
// complete household: it re-derives the gate server-side on both `load` and the `pay` action and
// redirects an incomplete household back to the signing moment rather than taking any money.
//
// The checkout itself is rebuilt from the persisted rows through the ONE shared builder
// (`$member-signup/lib/join-checkout.ts`), at then-current prices, so `reconcileJoin` handles a
// resumed join byte-identically to one paid straight through at submit. The route is reached two
// ways, both authenticated and both scoped to the member's OWN household (the unpaid membership is
// found by `member.householdId`, never a submitted id): the managing adult's own completion coda
// on the signing page links here, and the resumption email (`waiver-notify.ts`) deep-links here
// through `/my-account/confirm`'s allowlist once the last household signature lands.
import { fail, redirect } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import type { Actions, PageServerLoad } from './$types';
import { issueMemberCsrfToken } from '$member-auth/lib/auth';
import { resolveMemberDb } from '$member-auth/lib/db';
import { getCurrentSeason, getTierPrices } from '$admin-club/lib/club-settings';
import { portalAction, type PortalActionContext, type PortalActionEvent } from '$member-portal/lib/portal-action';
import { documents } from '$chassis/content';
import { loadPublishedDocuments } from '$theme/documents';
import { householdSignaturesComplete } from '$member-portal/lib/waiver-requirements';
import { buildJoinCheckoutArgs, loadJoinApplication } from '$member-signup/lib/join-checkout';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv } from '$admin-club/lib/payments';

export const prerender = false;

/** The signing moment for the join household-complete gate: the SAME redirect target whether the
 *  gate refuses at `load` or at `?/pay` (a stale tab submitting past a page that already
 *  redirected). Mirrors `/my-account/renew`'s own `SIGN_REDIRECT`, in the join context. */
const SIGN_REDIRECT = '/my-account/sign?context=join';

/** The household's own unpaid membership for the current season -- the join membership this door
 *  finishes. A returning member's renewal is always for a LATER (next-unclaimed) season, so the
 *  current-season unpaid row is unambiguously the first-join membership. Scoped to the caller's own
 *  household, so this door can never resolve another household's join. */
async function findUnpaidJoinMembership(db: D1Database, householdId: string, season: number): Promise<{ id: string } | null> {
  return db
    .prepare('SELECT id FROM memberships WHERE household_id = ?1 AND season = ?2 AND paid_at IS NULL LIMIT 1')
    .bind(householdId, season)
    .first<{ id: string }>();
}

export const load: PageServerLoad = async (event) => {
  const csrf = issueMemberCsrfToken(event);
  const { member } = await event.parent();
  if (!member) redirect(303, '/my-account');

  const db = resolveMemberDb(event.platform?.env);
  if (!db) return { csrf, ready: false as const };

  const season = await getCurrentSeason(db);
  const unpaid = await findUnpaidJoinMembership(db, member.householdId, season);
  // Nothing to finish (already paid, or never started a join): send the member home rather than
  // render an empty pay screen.
  if (!unpaid) redirect(303, '/my-account');

  // The hard gate: an incomplete household never sees a pay screen, it goes back to sign.
  if (!(await householdSignaturesComplete(db, loadPublishedDocuments(documents, season), member.householdId, season))) redirect(303, SIGN_REDIRECT);

  const prices = await getTierPrices(db);
  const app = await loadJoinApplication(db, unpaid.id, prices);
  if (!app) redirect(303, '/my-account');

  const args = buildJoinCheckoutArgs(app, event.url.origin);

  return {
    csrf,
    ready: true as const,
    season,
    amountCents: args.amountCents,
    lines: (args.lines ?? []).map((line) => ({ name: line.name, amountCents: line.amountCents })),
  };
};

/** Build the join checkout for the member's own unpaid, signature-complete application and redirect
 *  to Stripe, degrading to a stub message when `STRIPE_SECRET_KEY` is unbound and to `fail(502)`
 *  when a configured key still failed -- the same shape `checkout.ts`'s `checkoutOrStub` uses, kept
 *  inline here since the join checkout builds multi-line args that helper does not carry. */
async function payJoin(event: PortalActionEvent, ctx: PortalActionContext) {
  const season = await getCurrentSeason(ctx.db);
  const unpaid = await findUnpaidJoinMembership(ctx.db, ctx.member.householdId, season);
  if (!unpaid) return fail(400, { error: 'There is nothing to pay for right now.' });

  // Re-check the gate here, never trusting that the page that rendered this form is the one still
  // open: no money proceeds until the household's own signatures are complete.
  if (!(await householdSignaturesComplete(ctx.db, loadPublishedDocuments(documents, season), ctx.member.householdId, season))) redirect(303, SIGN_REDIRECT);

  const prices = await getTierPrices(ctx.db);
  const app = await loadJoinApplication(ctx.db, unpaid.id, prices);
  if (!app) return fail(400, { error: 'There is nothing to pay for right now.' });

  const env = event.platform?.env as CreateCheckoutEnv | undefined;
  try {
    const result = await createCheckout(env ?? {}, buildJoinCheckoutArgs(app, event.url.origin, '/my-account'));
    if ('url' in result) redirect(303, result.url);
    return { joinPayStubbed: true as const };
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) return fail(502, { error: err.message });
    throw err;
  }
}

export const actions: Actions = {
  pay: portalAction(async ({ event, ctx }) => payJoin(event, ctx)),
};
