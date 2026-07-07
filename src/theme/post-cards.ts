// The home page's News & Updates cards: a display-ready projection over the cheap `posts.all()`
// summaries, adding the two things a `ContentSummary` alone cannot carry: the resolved hero photo
// (createPublicRoutes derives `heroImage` the same way for a post's own detail page, but only for
// one entry at a time; the home page needs it for a handful of summaries at once) and a reading
// time. Both read the full entry for just the cards actually shown (`posts.all().slice(0, 3)`),
// never the whole archive.
import { parseMediaToken, type MediaManifest, type MediaResolve } from '@glw907/cairn-cms/media';
import type { ContentIndex, ContentSummary } from '@glw907/cairn-cms/delivery';
import type { ImageValue } from '@glw907/cairn-cms';

/** One home-page news card, ready to render. */
export interface NewsCard {
  id: string;
  title: string;
  permalink: string;
  date?: string;
  /** Whole minutes, always at least 1, matching the live site's own "reading time" convention. */
  readMinutes: number;
  image?: { url: string; alt: string };
}

const WORDS_PER_MINUTE = 200;

/** Resolve a post's frontmatter hero, or undefined on any miss (an unresolvable reference degrades
 * to no image rather than a broken one, the same safe failure home-images.ts uses). */
function resolveCardImage(
  image: ImageValue | undefined,
  manifest: MediaManifest,
  resolveMedia: MediaResolve,
): NewsCard['image'] {
  if (!image) return undefined;
  const ref = parseMediaToken(image.src);
  if (!ref) return undefined;
  const url = resolveMedia(ref);
  if (!url) return undefined;
  return { url, alt: image.alt };
}

/** Project the home page's news cards from a list of post summaries, in the given order. */
export function newsCards(
  summaries: ContentSummary[],
  postsIndex: ContentIndex<{ image?: ImageValue }>,
  manifest: MediaManifest,
  resolveMedia: MediaResolve,
): NewsCard[] {
  return summaries.map((summary) => {
    const entry = postsIndex.byId(summary.id);
    return {
      id: summary.id,
      title: summary.title,
      permalink: summary.permalink,
      date: summary.date,
      readMinutes: Math.max(1, Math.round(summary.wordCount / WORDS_PER_MINUTE)),
      image: resolveCardImage(entry?.frontmatter.image, manifest, resolveMedia),
    };
  });
}
