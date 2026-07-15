import type { PageServerLoad } from './$types';
import { buildSeoMeta } from '@glw907/cairn-cms/delivery';
import { extractVocabulary } from '@glw907/cairn-cms';
import { posts, ORIGIN } from '$chassis/content';
import { siteConfig } from '$theme/cairn.config';
import { browsableTopics, type TopicCount } from '$theme/topic-counts';

// The public news archive (Task 3): the home page's "View all news" link, and the migrated
// welcome-new-website post's own historical link, both point here. Task 2's content-migration
// finding recorded this as a real, missing feature (cairn's site resolver enumerates per-entry
// permalinks only, never a concept-level index route); this is that small, theme-owned companion
// page, grouped by year like the live site's own archive.
export const prerender = true;

export const load: PageServerLoad = () => {
  const all = posts.all();
  const byYear = new Map<string, ReturnType<typeof posts.all>>();
  for (const entry of all) {
    const year = entry.date?.slice(0, 4) ?? 'Undated';
    const group = byYear.get(year) ?? [];
    group.push(entry);
    byYear.set(year, group);
  }
  const years = [...byYear.keys()].filter((y) => y !== 'Undated').sort();
  const yearRange = years.length === 0 ? undefined : years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`;

  // Topic values come from the site's curated vocabulary (site.config.yaml); a post's tags are
  // validated against it at commit time (spec: tag management), so every real tag value already
  // has a matching entry here. Both the Browse grid and the stats bar's "topics" count read the
  // narrower `browseTopics` (B4, 2026-07-15 shared-components pass): a vocabulary value with zero
  // current posts is still a real, curated topic, but a clickable card for it is a dead end, and
  // a stat that says 5 above a grid showing 4 reads as a defect, so both surfaces count only
  // topics with at least one post.
  const tagCounts = new Map(posts.allTags().map((t) => [t.tag, t.count]));
  const topics: TopicCount[] = extractVocabulary(siteConfig).map((entry) => ({
    value: entry.value,
    label: entry.label,
    count: tagCounts.get(entry.value) ?? 0,
  }));

  const browseTopics = browsableTopics(topics);
  return {
    years: [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    stats: { postCount: all.length, topicCount: browseTopics.length, yearRange },
    topics,
    browseTopics,
    seo: buildSeoMeta({
      title: 'News',
      description: `Every news post, race recap, and update from ${siteConfig.siteName}.`,
      canonicalUrl: `${ORIGIN}/posts/`,
      siteName: siteConfig.siteName,
    }),
  };
};
