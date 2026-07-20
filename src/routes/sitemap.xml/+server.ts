import type { RequestHandler } from './$types';
import { sitemapResponse, sitemapView, siteDescriptors } from '@glw907/cairn-cms/delivery';
import { site, ORIGIN } from '$chassis/content';
import { cairn, siteConfig } from '$theme/cairn.config';

export const prerender = true;

// sitemapView projects only the `routable` concepts (an `embedded`-routing concept like
// fragments or documents is excluded by design), with the home page as the one extra,
// non-concept route.
export const GET: RequestHandler = () => {
  const urls = sitemapView(site, siteDescriptors(cairn, siteConfig), ORIGIN, ['/']);
  return sitemapResponse(urls);
};
