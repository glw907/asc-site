// The public class-signup page's own "pay the class fee now" action, factored out of
// `class-fee-checkout.remote.ts` the same way `class-signup-form.ts` factors `handleClassSignup`
// out of `class-signup.remote.ts`: a `.remote.ts` file may only export remote functions, so the
// actually-testable logic lives here. Reads the class's own `fee` server-side (never a submitted
// amount: a class fee is not user-chosen the way a donation is) and confirms the submitted
// `enrollmentId` really belongs to the submitted `classId` before minting a Checkout Session, so a
// mismatched pair refuses rather than silently charging for the wrong class.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import type { D1Database } from '@cloudflare/workers-types';
import { getClass } from '$admin-club/lib/classes-store';
import { createCheckout, CheckoutUnavailableError, type CreateCheckoutEnv, type CreateCheckoutResult } from '$admin-club/lib/payments';

export const classFeeCheckoutSchema = v.object({
  enrollmentId: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  classId: v.pipe(v.string(), v.trim(), v.nonEmpty()),
});

export type ClassFeeCheckoutSubmission = v.InferOutput<typeof classFeeCheckoutSchema>;

/** The slice of `App.Platform['env']` this handler reads, narrowed the same loose, cast-internally
 *  way `class-signup-form.ts`'s own `ClassSignupEnv` is: a plain `env: unknown` argument, so a
 *  caller (or a test) never has to satisfy the engine's full `CairnPlatformBindings` shape. */
interface ClassFeeCheckoutEnv extends CreateCheckoutEnv {
  CLUB_DB?: D1Database;
}

/**
 * Create a Stripe Checkout Session for one class enrollment's own fee: refuses (via `invalid`,
 * matching every other public form in this family) an unknown class, a free class (nothing to
 * pay), or an `enrollmentId` that does not belong to `classId`. Degrades to
 * {@link CreateCheckoutResult}'s `{ stub: true }` shape when `STRIPE_SECRET_KEY` is not bound
 * (`payments.ts`'s own `createCheckout`), which the signup page reads to keep showing its existing
 * "online payment is coming" text rather than a broken button; a configured key that still fails
 * to create a session surfaces as `invalid` (`CheckoutUnavailableError`'s own message).
 */
export async function handleClassFeeCheckout(input: ClassFeeCheckoutSubmission, env: unknown, origin: string): Promise<CreateCheckoutResult> {
  const platformEnv = env as ClassFeeCheckoutEnv | undefined;
  const db = platformEnv?.CLUB_DB;
  if (!db) invalid('Payment is not available right now. You can email board@aksailingclub.org instead.');

  const cls = await getClass(db, input.classId);
  if (!cls) invalid('No such class.');
  if (cls.fee <= 0) invalid('This class has no fee to pay.');

  const enrollment = await db.prepare('SELECT class_id FROM class_enrollments WHERE id = ?1').bind(input.enrollmentId).first<{ class_id: string }>();
  if (!enrollment || enrollment.class_id !== cls.id) invalid('No such enrollment for this class.');

  try {
    return await createCheckout(platformEnv, {
      kind: 'class-fee',
      refId: input.enrollmentId,
      amountCents: cls.fee * 100,
      description: `${cls.name} class fee`,
      origin,
      successPath: '/payment/confirmation/',
      cancelPath: `/classes/${cls.id}/signup/`,
    });
  } catch (err) {
    if (err instanceof CheckoutUnavailableError) invalid(err.message);
    throw err;
  }
}
