// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ExecutionContext, D1Database } from '@cloudflare/workers-types';
// The binding-shaped types ship from the /sveltekit subpath, so the Platform block intersects
// them rather than restating every engine binding by hand. CairnMediaBindings adds
// MEDIA_BUCKET, present because this site turns media on.
import type { CairnPlatformBindings, CairnMediaBindings } from '@glw907/cairn-cms/sveltekit';
// App.Locals.editor (set by the engine's auth guard) ships with the engine.
import '@glw907/cairn-cms/ambient';

declare global {
  namespace App {
    interface Platform {
      // EVENTS_DB is this site's own binding (Task 4), not a cairn-cms one: the club's ops-stack
      // D1, read (never written) for the Season section and /events. See
      // src/theme/season-data.ts's header comment. TURNSTILE_SECRET_KEY and STRIPE_SECRET_KEY
      // are site-owned Worker secrets (contact.remote.ts, donate.remote.ts), set with `wrangler
      // secret put`, never committed; both are optional here because neither is set yet in this
      // environment, and each remote function degrades gracefully when its own secret is absent.
      env: CairnPlatformBindings &
        CairnMediaBindings & { EVENTS_DB: D1Database; TURNSTILE_SECRET_KEY?: string; STRIPE_SECRET_KEY?: string };
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
