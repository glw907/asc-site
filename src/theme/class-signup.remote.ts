// The public class signup/waitlist form's remote function (Task 8), following `contact.remote.ts`
// and `donate.remote.ts` as the family precedent. The actual schema and handler logic live in
// class-signup-form.ts (a `.remote.ts` file may only export remote functions), so this file is
// just the thin `form()` wiring.
import { form, getRequestEvent } from '$app/server';
import { classSignupSchema, handleClassSignup } from './class-signup-form';

export const joinClass = form(classSignupSchema, async (input) => {
  const { platform, getClientAddress } = getRequestEvent();
  return handleClassSignup(input, platform?.env, getClientAddress());
});
