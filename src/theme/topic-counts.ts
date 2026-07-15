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

/** Every curated topic that has at least one live post, in the order the vocabulary declares
 *  them. Both the Browse-by-Topic grid and the posts index's "topics" stat read this narrower
 *  list: a zero-post topic is still a real curated topic, but a clickable card for it would
 *  dead-end a visitor, and a stat counting it would sit above a grid that omits it. */
export function browsableTopics(topics: TopicCount[]): TopicCount[] {
  return topics.filter((topic) => topic.count > 0);
}
