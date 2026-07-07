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
import { resolveClubDb } from '$admin-club/lib/club-roles';
import { createClubAuditSink } from '$admin-club/lib/audit-sink';

const wireClubAuditSink: Handle = ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/admin/club')) {
    const db = resolveClubDb(event.platform?.env);
    if (db) event.locals.auditSink = createClubAuditSink(db);
  }
  return resolve(event);
};

export const handle = sequence(wireClubAuditSink, createAuthGuard());
