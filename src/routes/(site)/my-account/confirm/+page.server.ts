// /my-account/confirm: the POST-confirm magic-link landing (mirrors cairn's own
// confirmLoad/confirmAction split, per confirmMemberToken's own header): `load` only ever renders
// a token and a button, never consumes; the `confirm` action is the only path that actually calls
// confirmMemberToken. A failed confirm (expired, already used, or unknown) re-renders the same
// page in its "cold edge" state (mockup frame 09), pre-filling the email when the token row can
// still be traced back to a member, with its own `resend` action to send a fresh link.
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { confirmMemberToken, requestMemberLink, issueMemberCsrfToken, validateMemberCsrfToken, MEMBER_SESSION_TTL_MS } from '$member-auth/lib/auth';
import { memberSessionCookieName } from '$member-auth/lib/crypto';
import { resolveMemberDb } from '$member-auth/lib/db';
import { siteConfig } from '$theme/cairn.config';
import { verifyTurnstile } from '$theme/turnstile';
import { checkRateLimit, checkRateLimitKeys } from '$theme/rate-limit';
import { isSafeNextPath, DEFAULT_NEXT_PATH } from '$member-portal/lib/return-path';

export const prerender = false;

// Matches +page.server.ts's own copy of the site's established from-address.
const FROM_ADDRESS = 'noreply@aksailingclub.org';

// Matches my-account/+page.server.ts's own `requestLink` copy (review fix, 2026-07-15): the same
// wording regardless of which action or code path rejected the submission, so the text itself
// carries no information about which check failed or why.
const SPAM_CHECK_MESSAGE = 'Spam check failed. Please try again.';

export const load: PageServerLoad = async (event) => {
  // The token rides a query param on a link a member's inbox client can prefetch or preview;
  // Referrer-Policy: no-referrer keeps it out of any onward Referer header (mirrors cairn's own
  // confirmLoad).
  event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
  // The member-waivers nudge/resumption emails (`$member-portal/lib/waiver-notify.ts`) deep-link
  // through this route's own `?next=`; only a value this closed allowlist recognizes ever rides
  // into the hidden field below, so an unrecognized or crafted one is silently dropped here
  // rather than at the redirect (never an error the member sees over a stray query param).
  const rawNext = event.url.searchParams.get('next');
  return {
    token: event.url.searchParams.get('token') ?? '',
    next: isSafeNextPath(rawNext) ? rawNext : null,
    csrf: issueMemberCsrfToken(event),
  };
};

export const actions: Actions = {
  // The friction tradeoff (spec `2026-07-15-payments-live-smoke-design.md` section 2a): a member
  // reaches this button by clicking their own magic-link email, so a Turnstile challenge here
  // adds friction to the confirm step itself. The ruling stands (Turnstile on every public
  // unauthenticated POST) unless Geoff overrides in review.
  //
  // A spam-check failure (Turnstile or rate limit) returns `{ ok: false, error }` distinct from a
  // genuine expired/invalid token's bare `{ ok: false, prefillEmail }` (review fix, 2026-07-15):
  // the template funnels any `!form.ok` into the "That sign-in link expired" heading, which was
  // wrong for a member who simply failed the spam check (WCAG 3.3.1, a false diagnosis of their
  // own link). `error`'s text stays identical regardless of the token's own validity, so this adds
  // no enumeration signal beyond what the existing shape already carried.
  confirm: async (event) => {
    if (!(await validateMemberCsrfToken(event))) return { ok: false as const, prefillEmail: null };

    const db = resolveMemberDb(event.platform?.env);
    if (!db) return { ok: false as const, prefillEmail: null };

    const form = await event.request.formData();
    const token = String(form.get('token') ?? '');
    if (!token) return { ok: false as const, prefillEmail: null };

    // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b): the
    // confirm action carries no email field (the magic-link token only), so this keys on IP
    // alone.
    const rateLimitAllowed = await checkRateLimit(event.platform?.env.RATE_LIMIT_PUBLIC_POST, `ip:${event.getClientAddress()}`);
    if (!rateLimitAllowed) return { ok: false as const, prefillEmail: null, error: SPAM_CHECK_MESSAGE };

    const secret = event.platform?.env.TURNSTILE_SECRET_KEY;
    const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
    if (secret && !(await verifyTurnstile(turnstileToken, event.getClientAddress(), secret))) {
      return { ok: false as const, prefillEmail: null, error: SPAM_CHECK_MESSAGE };
    }

    const result = await confirmMemberToken(db, token);
    if (!result.ok) return { ok: false as const, prefillEmail: result.prefillEmail };

    const cookieName = memberSessionCookieName(event.url.protocol === 'https:');
    event.cookies.set(cookieName, result.sessionId, {
      path: '/',
      httpOnly: true,
      secure: event.url.protocol === 'https:',
      sameSite: 'lax',
      maxAge: Math.floor(MEMBER_SESSION_TTL_MS / 1000),
    });
    // The waivers loop's own deep link (`?next=`, carried on the hidden field the load above
    // already validated): re-validated here too, since a submitted form field is never trusted
    // merely because `load` once approved it.
    const rawNext = String(form.get('next') ?? '');
    redirect(303, isSafeNextPath(rawNext) ? rawNext : DEFAULT_NEXT_PATH);
  },

  // `resend` is the higher-value Turnstile target of the two (spec section 2a): it sends a
  // fresh magic-link email on every valid submit, the same send-path abuse class as
  // `requestRenewLink`/`requestLink`.
  resend: async (event) => {
    const db = resolveMemberDb(event.platform?.env);
    const emailBinding = event.platform?.env.EMAIL;
    if (!(await validateMemberCsrfToken(event)) || !db || !emailBinding) {
      return { ok: false as const, prefillEmail: null, resent: false as const };
    }

    const form = await event.request.formData();
    const email = String(form.get('email') ?? '');
    // Carries the same `?next=` deep link the expired token itself would have (review fix,
    // 2026-07-19): without this, a waivers magic-link resend re-validates against a fresh token
    // but strands the member on the portal home rather than back at `/my-account/sign`.
    // Re-validated here rather than trusted from the submitted field, same discipline as the
    // `confirm` action's own `next` handling above.
    const rawNext = String(form.get('next') ?? '');
    const next = isSafeNextPath(rawNext) ? rawNext : undefined;

    // Coverage table item 1 (docs/2026-07-15-payments-live-smoke-design.md section 2b):
    // `resend` is the higher-value target of the confirm page's two actions (it sends a fresh
    // magic-link email on every valid submit), so this keys on both IP and the submitted email.
    const rateLimitAllowed = await checkRateLimitKeys(event.platform?.env.RATE_LIMIT_PUBLIC_POST, [`ip:${event.getClientAddress()}`, `email:${email.toLowerCase()}`]);
    if (!rateLimitAllowed) return { ok: false as const, prefillEmail: email, resent: false as const, error: SPAM_CHECK_MESSAGE };

    const secret = event.platform?.env.TURNSTILE_SECRET_KEY;
    const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
    if (secret && !(await verifyTurnstile(turnstileToken, event.getClientAddress(), secret))) {
      return { ok: false as const, prefillEmail: email, resent: false as const, error: SPAM_CHECK_MESSAGE };
    }

    await requestMemberLink(db, email, (message) => emailBinding.send(message), {
      origin: event.url.origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
      next,
    });
    return { ok: false as const, prefillEmail: email, resent: true as const };
  },
};
