// The page template system's tier selector (2026-07-12 plan, Task 2): whether a page belongs to
// the primary tier, the small set of top-level destinations the header's own nav promotes, versus
// every other page (secondary, the default). Derived from `menus.primary` in site.config.yaml, the
// same source SiteHeader.svelte already reads via extractMenu, so adding a nav destination
// promotes its page with no code edit here. Home is excluded on purpose: it carries its own
// full-bleed home template, never a page-tier hero. A nav child (Members' seven sub-links) is
// excluded too: the tier is a top-level distinction, not a nav-depth one.
import { extractMenu } from '@glw907/cairn-cms';
import { siteConfig } from './cairn.config.js';

/** A nav URL's slug, matching the `[...path]` route's own shape (`data.entry.slug`): no leading or
 *  trailing slash. Home's `/` reduces to the empty string. */
function slugFromUrl(url: string | undefined): string {
  return url ? url.replace(/^\/+|\/+$/g, '') : '';
}

// Reads the same `primary` menu and depth the header's dropdown uses (site.config.yaml's Members
// entry needs depth 2 to keep its children), but only the top-level slugs go into the set below;
// a child's own slug is never added, so it stays secondary regardless of its parent's tier.
const primaryNav = extractMenu(siteConfig, 'primary', 2);

const PRIMARY_SLUGS = new Set(
  primaryNav.map((item) => slugFromUrl(item.url)).filter((slug) => slug !== ''),
);

/** True for the slug of a top-level `menus.primary` destination (home excluded, nav children
 *  excluded); false for every other page, including secondary pages and nav children. */
export function isPrimaryPage(slug: string): boolean {
  return PRIMARY_SLUGS.has(slug);
}
