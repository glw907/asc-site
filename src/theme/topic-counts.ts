// The posts index's Browse-by-Topic grid (B4, 2026-07-15 shared-components pass): a pure helper
// pulled out of the route's own `+page.server.ts`, since SvelteKit's server-load modules only
// permit a fixed export list (load, prerender, and the rest) and reject any other named export
// at build time.

/** One topic in the Browse-by-Topic grid: the vocabulary's display label plus its live post count. */
export interface TopicCount {
  value: string;
  label: string;
  count: number;
}

/** The Browse-by-Topic grid's own topic list: every curated topic that has at least one live
 *  post, in the same order the vocabulary declares them. A topic with zero posts still counts
 *  toward the site's "topics" stat (the full curated vocabulary), it just never earns a
 *  clickable grid card that would dead-end a visitor. */
export function browsableTopics(topics: TopicCount[]): TopicCount[] {
  return topics.filter((topic) => topic.count > 0);
}
