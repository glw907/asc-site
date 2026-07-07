// Old-site permalink redirects: site-owned routing data, not a cairn seam. The prior Hugo site
// nested governance and member pages two levels deep (/governance/bylaws/, /members/welcome/);
// cairn's `pages` concept globs one flat directory (see $chassis/content.ts), so every page's slug
// is one path segment. Content migration flattened the old nested paths onto that single
// namespace; this map sends an old URL to its new flat one with a permanent redirect, so an
// external link, a bookmark, or a search result still resolves. Read by
// `(site)/[...path]/+page.server.ts` before it falls through to content resolution.
export const REDIRECTS: Record<string, string> = {
  'governance/articles-of-incorporation': 'articles-of-incorporation',
  'governance/ascca-bylaws': 'ascca-bylaws',
  'governance/bylaws': 'bylaws',
  'governance/committees': 'committees',
  'governance/determination-letter': 'determination-letter',
  'governance/elections': 'elections',
  'governance/mat-su-borough-land-management-agreement': 'mat-su-borough-land-management-agreement',
  'members/welcome': 'welcome',
  'members/new-member-guide': 'new-member-guide',
  'members/get-involved': 'get-involved',
  'members/issues-and-support': 'issues-and-support',
  'members/it-request': 'it-request',
  'members/club-boat-use-and-qualification': 'club-boat-use-and-qualification',
  'members/discord-server': 'discord-server',
  'members/long-term-rv-parking-guidelines': 'long-term-rv-parking-guidelines',
  'members/member-expectations': 'member-expectations',
  'members/moorings': 'moorings',
  'members/rack-storage': 'rack-storage',
  'members/renewing-your-membership': 'renewing-your-membership',
  'members/seasonal-storage': 'seasonal-storage',
  'members/trailered-boat-parking': 'trailered-boat-parking',
  'members/transient-rv-parking': 'transient-rv-parking',
  'members/visiting-the-club': 'visiting-the-club',
  'members/waitlists': 'waitlists',
  'members/directory': 'directory',
  'members/my-account': 'my-account',
  'members/class-registration': 'class-registration',
  'members/class-registration-complete': 'class-registration-complete',
  'payment/confirmation': 'confirmation',
  // The one post whose Hugo frontmatter omitted an explicit `slug`, so Hugo fell back to the full
  // filename (date prefix included) instead of the date-stripped slug every other post declared.
  // Cairn's dated-concept id/slug split strips the date prefix uniformly, with no per-entry
  // exception, so this single post's URL also changes; see the migration findings doc.
  'posts/2026-02-welcome-new-website': 'posts/welcome-new-website',
  // The old Hugo site's default RSS output path; existing subscribers still hit it. This project's
  // own feed lives at the SvelteKit-owned /feed.xml route, not under [...path], so the target here
  // is that route's bare path rather than a content slug.
  'index.xml': 'feed.xml',
};

// The old nested `governance/*` keys already name exactly the pages the live site grouped under
// its Governance section (see the header comment above); reusing them here means this set can
// never drift from REDIRECTS itself. `[...path]/+page.svelte` reads it to restore the "back to
// Governance" link the completion pass found missing (manifest item 10).
export const GOVERNANCE_SUBPAGE_SLUGS = new Set(
  Object.entries(REDIRECTS)
    .filter(([from]) => from.startsWith('governance/'))
    .map(([, to]) => to),
);
