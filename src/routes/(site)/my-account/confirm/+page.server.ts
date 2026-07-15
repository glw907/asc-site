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

export const prerender = false;

// Matches +page.server.ts's own copy of the site's established from-address.
const FROM_ADDRESS = 'noreply@aksailingclub.org';

export const load: PageServerLoad = async (event) => {
  // The token rides a query param on a link a member's inbox client can prefetch or preview;
  // Referrer-Policy: no-referrer keeps it out of any onward Referer header (mirrors cairn's own
  // confirmLoad).
  event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
  return {
    token: event.url.searchParams.get('token') ?? '',
    csrf: issueMemberCsrfToken(event),
  };
};

export const actions: Actions = {
  // The friction tradeoff (spec `2026-07-15-payments-live-smoke-design.md` section 2a): a member
  // reaches this button by clicking their own magic-link email, so a Turnstile challenge here
  // adds friction to the confirm step itself. The ruling stands (Turnstile on every public
  // unauthenticated POST) unless Geoff overrides in review.
  confirm: async (event) => {
    if (!(await validateMemberCsrfToken(event))) return { ok: false as const, prefillEmail: null };

    const db = resolveMemberDb(event.platform?.env);
    if (!db) return { ok: false as const, prefillEmail: null };

    const form = await event.request.formData();
    const token = String(form.get('token') ?? '');
    if (!token) return { ok: false as const, prefillEmail: null };

    const secret = event.platform?.env.TURNSTILE_SECRET_KEY;
    const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
    if (secret && !(await verifyTurnstile(turnstileToken, event.getClientAddress(), secret))) {
      return { ok: false as const, prefillEmail: null };
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
    redirect(303, '/my-account');
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

    const secret = event.platform?.env.TURNSTILE_SECRET_KEY;
    const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
    if (secret && !(await verifyTurnstile(turnstileToken, event.getClientAddress(), secret))) {
      return { ok: false as const, prefillEmail: email, resent: false as const };
    }

    await requestMemberLink(db, email, (message) => emailBinding.send(message), {
      origin: event.url.origin,
      siteName: siteConfig.siteName,
      from: FROM_ADDRESS,
    });
    return { ok: false as const, prefillEmail: email, resent: true as const };
  },
};
