import type { PageServerLoad } from './$types';
import { buildSeoMeta } from '@glw907/cairn-cms/delivery';
import { posts, notifications, ORIGIN, SITE_DESCRIPTION } from '$chassis/content';
import { mediaManifest, publicMediaResolver, siteConfig } from '$theme/cairn.config';
import { homeImages } from '$theme/home-images';
import { loadSeasonMonths } from '$theme/season-data';
import { activeNotification } from '$theme/active-notification';
import { newsCards } from '$theme/post-cards';

// The Season section reads the club's live D1 at request time (Task 4, repointed to asc-club by
// pass 2.1's Task 9), so the home page can no longer be baked into the static build the way an
// ordinary content route is; `prerender` is therefore left at its project default (false, dynamic
// SSR), same as the /admin routes.

export const load: PageServerLoad = async ({ platform }) => {
  const images = homeImages(mediaManifest, publicMediaResolver);
  const db = platform?.env.CLUB_DB;
  const season = db ? await loadSeasonMonths(db) : [];
  return {
    news: newsCards(posts.all().slice(0, 3), posts, mediaManifest, publicMediaResolver),
    notification: activeNotification(notifications, new Date().toISOString().slice(0, 10)),
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
