// The portal's own write-then-checkout call site, shared by every `/my-account/**` action that
// ends in a real Stripe Checkout Session (the landing's `?/payAssetFee`/`?/payRequest`, the
// renewal door's own `?/renew`). Lived as a private helper inside `/my-account/+page.server.ts`
// until T2c (the portal redesign pass) moved `?/renew` to its own route
// (`/my-account/renew/+page.server.ts`): hoisted here, unchanged, rather than duplicated across
// the two files.
import { fail, redirect } from '@sveltejs/kit';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv } from '$admin-club/lib/payments';
import type { PortalActionContext, PortalActionEvent } from './portal-action';

/**
 * Build a Stripe Checkout Session for `args.kind`/`args.refId`/`args.amountCents` and redirect the
 * member straight to it, degrading to `{ <stubbedKey>: true }` when `STRIPE_SECRET_KEY` is not
 * bound (the same stub-message shape every other payment form on this site returns) and to a
 * `fail(502)` when a configured key still failed to create the session.
 */
export async function checkoutOrStub(
  event: PortalActionEvent,
  ctx: PortalActionContext,
  stubbedKey: string,
  args: { kind: 'dues' | 'asset-fee'; refId: string; amountCents: number; description: string },
) {
  const env = event.platform?.env as CreateCheckoutEnv | undefined;
  try {
    const result = await createCheckout(env ?? {}, {
      kind: args.kind,
      refId: args.refId,
      amountCents: args.amountCents,
      description: args.description,
      origin: event.url.origin,
      successPath: '/payment/confirmation/',
      cancelPath: '/my-account',
      customerEmail: ctx.member.email ?? undefined,
    });
    if ('url' in result) redirect(303, result.url);
    return { [stubbedKey]: true } as Record<string, true>;
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) return fail(502, { error: err.message });
    throw err;
  }
}
