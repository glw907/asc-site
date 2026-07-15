// The public class-signup page's "pay the class fee now" remote function, following
// `class-signup.remote.ts` as the family precedent (a `.remote.ts` file may only export remote
// functions; the actually-testable schema and handler live in `class-fee-checkout-form.ts`).
import { form, getRequestEvent } from '$app/server';
import { classFeeCheckoutSchema, handleClassFeeCheckout } from './class-fee-checkout-form';

export const payClassFee = form(classFeeCheckoutSchema, async (input) => {
  const { platform, getClientAddress, url } = getRequestEvent();
  return handleClassFeeCheckout(input, platform?.env, getClientAddress(), url.origin);
});
