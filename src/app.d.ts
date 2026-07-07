// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ExecutionContext, D1Database } from '@cloudflare/workers-types';
// The binding-shaped types ship from the /sveltekit subpath, so the Platform block intersects
// them rather than restating every engine binding by hand. CairnMediaBindings adds
// MEDIA_BUCKET, present because this site turns media on.
import type { CairnPlatformBindings, CairnMediaBindings, AdminActionAuditSink } from '@glw907/cairn-cms/sveltekit';
import type { MemberRow } from '$member-auth/lib/auth';
// App.Locals.editor (set by the engine's auth guard) ships with the engine.
import '@glw907/cairn-cms/ambient';

declare global {
  namespace App {
    interface Locals {
      // Set by hooks.server.ts's wireClubAuditSink for /admin/club/** requests only (pass 2.1
      // Task 6's rider 2): the Club section's own persisted audit_log sink, which adminAction
      // calls per ctx.audit emit. Absent everywhere else; adminAction tolerates a missing sink.
      auditSink?: AdminActionAuditSink;
      // Set by /my-account/+layout.server.ts's own session resolve (a member session, distinct
      // from the engine's own `locals.editor`; the two stores never blur). `null` when signed
      // out or the session has expired; absent (`undefined`) outside the /my-account route tree.
      member?: MemberRow | null;
    }
    interface Platform {
      // EVENTS_DB is this site's own binding (Task 4), not a cairn-cms one: the club's ops-stack
      // D1, read (never written) for the Season section and /events. See
      // src/theme/season-data.ts's header comment. CLUB_DB is pass 2.1's own domain store (the
      // asc-club side of the two-database strategy; migrations/asc-club/), read AND written by
      // the Club section's own screens and its club-role authorization layer
      // (src/admin-club/lib/club-roles.ts). TURNSTILE_SECRET_KEY and STRIPE_SECRET_KEY are
      // site-owned Worker secrets (contact.remote.ts, donate.remote.ts), set with `wrangler
      // secret put`, never committed; both are optional here because neither is set yet in this
      // environment, and each remote function degrades gracefully when its own secret is absent.
      env: CairnPlatformBindings &
        CairnMediaBindings & {
          EVENTS_DB: D1Database;
          CLUB_DB: D1Database;
          TURNSTILE_SECRET_KEY?: string;
          STRIPE_SECRET_KEY?: string;
        };
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
