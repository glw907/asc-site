import type { PageServerLoad } from './$types';
import { buildSeoMeta } from '@glw907/cairn-cms/delivery';
import { posts, notifications, ORIGIN, SITE_DESCRIPTION } from '$chassis/content';
import { mediaManifest, publicMediaResolver, siteConfig } from '$theme/cairn.config';
import { homeImages } from '$theme/home-images';
import { loadSeasonMonths } from '$theme/season-data';

// The Season section reads the club's live D1 at request time (Task 4), so the home page can no
// longer be baked into the static build the way an ordinary content route is; `prerender` is
// therefore left at its project default (false, dynamic SSR), same as the /admin routes.

/** One notification's home-banner projection: title, body, and its date for the "posted" line. */
interface ActiveNotification {
  title: string;
  body: string;
  date?: string;
}

/**
 * The single live notification, or undefined when none is current. Only one entry is ever
 * current at a time (the site-declared concept's whole point), so this reads every entry's
 * `expires` and returns the first whose date has not yet passed; an unparsable or missing
 * `expires` reads as already-expired (the safe failure for a low-stakes banner), matching the
 * migration's own note that an expired bulletin is correct, honest behavior, not a bug.
 */
function activeNotification(today: string): ActiveNotification | undefined {
  for (const summary of notifications.all()) {
    const entry = notifications.byId(summary.id);
    if (!entry) continue;
    const expires = entry.frontmatter.expires;
    if (typeof expires === 'string' && expires >= today) {
      return { title: entry.title, body: String(entry.frontmatter.body ?? ''), date: entry.date };
    }
  }
  return undefined;
}

export const load: PageServerLoad = async ({ platform }) => {
  const images = homeImages(mediaManifest, publicMediaResolver);
  const db = platform?.env.EVENTS_DB;
  const season = db ? await loadSeasonMonths(db) : [];
  return {
    news: posts.all().slice(0, 3),
    notification: activeNotification(new Date().toISOString().slice(0, 10)),
    images,
    season,
    seo: buildSeoMeta({
      title: siteConfig.siteName,
      description: SITE_DESCRIPTION,
      canonicalUrl: ORIGIN,
      siteName: siteConfig.siteName,
      feeds: { rss: `${ORIGIN}/feed.xml`, json: `${ORIGIN}/feed.json` },
      image: images.hero ? ORIGIN + images.hero.url : undefined,
      imageAlt: images.hero?.alt,
    }),
  };
};
