// The one createPublicRoutes() instance, shared by the (site) catch-all and any site-owned route
// that needs the same entry-render/SEO/hero plumbing for one specific content entry (Task 4's
// `/events`, which blends that plumbing with a live D1 read the catch-all's own prerendered load
// cannot do). Built once here rather than per route, so the two callers stay identical by
// construction instead of by careful copying.
import { createPublicRoutes } from '@glw907/cairn-cms/delivery';
import { site, ORIGIN, SITE_DESCRIPTION } from '$chassis/content';
import { cairn, publicMediaResolver, mediaEnabled, siteConfig } from '$theme/cairn.config';

export const routes = createPublicRoutes({
  site,
  render: cairn.rendering.render,
  origin: ORIGIN,
  siteName: siteConfig.siteName,
  description: SITE_DESCRIPTION,
  feeds: { rss: ORIGIN + '/feed.xml', json: ORIGIN + '/feed.json' },
  // The same resolver the body render path uses, so the read path resolves a frontmatter `image`
  // hero into the `heroImage` projection the template and the SEO head read.
  resolveMedia: publicMediaResolver,
  // Arms the engine's media.resolver_absent diagnostic: with media on, dropping resolveMedia
  // above logs a warning instead of silently shipping a broken hero image.
  assetsEnabled: mediaEnabled,
});
