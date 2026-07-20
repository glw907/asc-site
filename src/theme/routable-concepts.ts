// A concept's routability (excludes `embedded` concepts, e.g. fragments and documents) read the
// canonical way, through the engine's own resolved descriptors (`siteDescriptors`), the same source
// `@glw907/cairn-cms/delivery`'s `sitemapView` reads for the sitemap. `createPublicRoutes.entries()`
// has no equivalent routable-only view (unlike the sitemap, which does via `sitemapView`), so
// `(site)/[...path]/+page.server.ts` filters its own prerender entries and guards its own load
// against a direct hit on a non-routable entry using this same descriptor set.
import { siteDescriptors, type ContentSummary } from '@glw907/cairn-cms/delivery';
import { cairn, siteConfig } from './cairn.config';

const ROUTABLE_CONCEPTS = new Set(
  siteDescriptors(cairn, siteConfig)
    .filter((descriptor) => descriptor.routing.routable)
    .map((descriptor) => descriptor.id),
);

/** True for a summary or entry whose concept is routable (excludes `embedded` concepts). */
export function isRoutable(summary: Pick<ContentSummary, 'concept'>): boolean {
  return ROUTABLE_CONCEPTS.has(summary.concept);
}
