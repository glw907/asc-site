// The one server-side composition point. The runtime composes once here, and every server
// route that needs it (the /admin mount, /healthz, /media) imports it instead of re-running
// composeRuntime per route.
import { composeRuntime } from '@glw907/cairn-cms';
import { createCairnAdmin } from '@glw907/cairn-cms/sveltekit';
import { cairn, siteConfig } from '$theme/cairn.config.js';
import { applyNavDefaults } from '$theme/nav-defaults.js';
import { attentionItemsFor } from '$theme/admin-attention.js';

export const runtime = composeRuntime({ adapter: cairn, siteConfig });
// Initiative 5 Task 4: the declared navLayout tree (cairn.config.ts) gates every group by the
// access map (`resolveNavLayout`/`canReach`) directly, so the site's own per-request nav-hiding
// hook (which read the now-retired `club_roles` table) is gone; role visibility is declarative.
// `navFilter` (pass-B sidebar-build T6) carries only the role-dependent collapsed defaults
// (src/theme/nav-defaults.ts); it never hides anything the map has already resolved.
//
// `attention` (pass-B sidebar-build T7): the three ruled pending-work badges (design decision 7),
// read fresh on every request through `$theme/admin-attention.ts`'s `attentionItemsFor` -- the
// same module the Overview strip's own load calls for its counts, so the strip and the badges can
// never disagree. The engine drops a zero-count item and anything the session's own resolved nav
// can't see, so this returns honest counts unconditionally rather than pre-filtering.
export const admin = createCairnAdmin(runtime, {
  navFilter: (items, { editor }) => applyNavDefaults(items, editor.role),
  attention: ({ event }) => attentionItemsFor(event.platform?.env),
});
