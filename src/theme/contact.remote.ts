// The contact form's remote function (completion-pass manifest item 2), following ecxc.ski's own
// contact.remote.ts as the family precedent. Unlike ecxc's Email Routing binding, cairn's own
// EMAIL binding is unrestricted (arbitrary recipients), so this needs no MIME message or
// `cloudflare:email` import: a plain `{to, from, subject, html, text}` object reaches any
// committee inbox directly. Turnstile verification only runs when a secret is configured (see
// src/app.d.ts); with none set, the submission proceeds unchecked, the same graceful default the
// family precedent chose.
import * as v from 'valibot';
import { invalid } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { CONTACT_CATEGORIES, buildContactEmail } from '$theme/contact-routing';
import { verifyTurnstile } from '$theme/turnstile';
import { checkRateLimitKeys, RATE_LIMIT_MESSAGE } from '$theme/rate-limit';

const FROM_ADDRESS = 'noreply@aksailingclub.org';

const contactSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your name.')),
  email: v.pipe(v.string(), v.trim(), v.email('Please enter a valid email address.')),
  phone: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your phone number.')),
  category: v.picklist(
    CONTACT_CATEGORIES.map((c) => c.value),
    'Please choose how we can help.',
  ),
  message: v.pipe(v.string(), v.trim(), v.nonEmpty('Please enter your message.')),
  // Injected by the Turnstile widget, not a rendered field.
  'cf-turnstile-response': v.optional(v.string(), ''),
});

export const sendMessage = form(contactSchema, async (input) => {
  const { platform, getClientAddress } = getRequestEvent();

  // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b): every
  // public POST, keyed per IP and per email.
  const ip = getClientAddress();
  const allowed = await checkRateLimitKeys(platform?.env?.RATE_LIMIT_PUBLIC_POST, [`ip:${ip}`, `email:${input.email.toLowerCase()}`]);
  if (!allowed) invalid(RATE_LIMIT_MESSAGE);

  const secret = platform?.env?.TURNSTILE_SECRET_KEY;
  const token = input['cf-turnstile-response'];
  if (secret && !(await verifyTurnstile(token, getClientAddress(), secret))) {
    invalid('Spam check failed. Please try again.');
  }

  const email = platform?.env?.EMAIL;
  if (!email) {
    invalid('Mail service is not configured yet. You can email board@aksailingclub.org instead.');
  }

  const built = buildContactEmail(input);
  try {
    await email.send({ to: built.to, from: FROM_ADDRESS, subject: built.subject, html: built.html, text: built.text });
  } catch {
    invalid('Something went wrong sending your message. You can email board@aksailingclub.org instead.');
  }

  return { success: true };
});
