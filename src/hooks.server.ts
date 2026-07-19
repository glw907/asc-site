// The engine's auth guard owns /admin gating: the magic-link session cookie, CSRF, and the
// admin-route dispatch. This site has no registry-only dev-backend hook (@glw907/cairn-cms-dev
// is a monorepo-only devDependency, unpublished by design); a local admin smoke test seeds a D1
// session row directly instead (see the admin smoke-test process in the cairn-cms repo's
// docs/internal/admin-smoke-test.md).
//
// `wireClubAuditSink` runs first in the sequence, before the guard, so `event.locals.auditSink`
// is already set by the time a `/admin/club/**` action runs (pass 2.1 Task 6, rider 2: the
// structural audit log existed, nothing persisted it). It is scoped by path so the rest of
// `/admin` never resolves a binding it has no use for.
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { createAuthGuard } from '@glw907/cairn-cms/sveltekit';
import { resolveClubDb } from '$admin-club/lib/club-db';
import { createClubAuditSink } from '$admin-club/lib/audit-sink';
import { roles, access } from '$theme/cairn.config.js';

// The root `_headers` file covers static assets only: on Cloudflare, Worker-rendered (SSR)
// responses never pass through it, so the same four headers are set here for every rendered
// page. Referrer-Policy matters most on the token-bearing /classes/offer/ URLs.
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};

const wireClubAuditSink: Handle = ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/admin/club')) {
    const db = resolveClubDb(event.platform?.env);
    // `waitUntil` keeps the sink's fire-and-forget insert alive past this response (audit-sink.ts's
    // own header); fall back to none outside a real execution context (e.g. a bare unit test),
    // where the sink still runs, just without that extension.
    const waitUntil = event.platform?.context?.waitUntil?.bind(event.platform.context);
    if (db) event.locals.auditSink = createClubAuditSink(db, waitUntil);
  }
  return resolve(event);
};

// `{ roles }` wires the site's own vocabulary (Administrator/Club manager/Webmaster/Publisher/
// Instructor, plus the reserved un-granted `owner`) into the guard; omitting it silently falls
// back to cairn's DEFAULT_ROLES, resolving every session (including a real Club manager) to
// 'none' capability and losing every engine content screen. `{ access }` wires the site's
// permission map (src/theme/access.ts); the adapter's own `access` member (cairn.config.ts) is the
// other required wiring -- a map passed to only one of the two is a silent misconfiguration (the
// cairn access guide's own warning), not a startup error, so both must stay in sync here.
export const handle = sequence(securityHeaders, wireClubAuditSink, createAuthGuard({ roles, access }));
