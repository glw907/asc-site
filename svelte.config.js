import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    // remoteBindings: false keeps the build-time platform proxy from connecting to Cloudflare
    // during prerender, which has no account credentials in CI.
    adapter: adapter({ platformProxy: { remoteBindings: false } }),
    // $chassis resolves the genre-free layer (src/chassis/): the plumbing and composition
    // primitives any cairn theme mounts onto. $theme resolves this site's own content (the
    // adapter config, the chrome, the token values). See src/chassis/README.md for the
    // boundary rule. $admin-club resolves the Club admin section's own layer (src/admin-club/):
    // the custom /admin/club/* screens plus their local stand-ins for Part C's future engine
    // seams (see docs/club-admin-scaffold.md). $member-auth resolves the member-facing identity
    // layer (src/member-auth/): the site-brings-its-own-auth seam for /my-account, deliberately
    // its own tree rather than living inside $admin-club (member auth vs. the club-admin
    // surface are two different axes; see src/member-auth/lib/auth.ts's own header).
    alias: {
      $chassis: 'src/chassis',
      '$chassis/*': 'src/chassis/*',
      $theme: 'src/theme',
      '$theme/*': 'src/theme/*',
      '$admin-club': 'src/admin-club',
      '$admin-club/*': 'src/admin-club/*',
      '$member-auth': 'src/member-auth',
      '$member-auth/*': 'src/member-auth/*',
    },
    // handleHttpError: 'warn' downgrades a prerender error to a warning. The cairnManifest()
    // plugin verifies the manifest in buildStart, outside the prerender lifecycle, so a stale
    // manifest still fails the build red under this policy.
    prerender: { handleHttpError: 'warn' },
    // cairn's guard owns CSRF for the admin with its own double-submit token, tolerant of the
    // missing Origin header a JS-free form POST sometimes sends. SvelteKit's own checkOrigin
    // runs ahead of any handle and would reject that POST first, so hand the authority over
    // (see docs/guides/deploy-to-cloudflare.md#disable-checkorigin in the cairn-cms repo).
    csrf: { checkOrigin: false },
    experimental: {
      // The contact and donate forms (completion-pass manifest items 2/3) post through remote
      // functions (contact.remote.ts, donate.remote.ts).
      remoteFunctions: true,
    },
  },
};
