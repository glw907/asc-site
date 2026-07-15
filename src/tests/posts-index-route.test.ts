// B4 (2026-07-15 shared-components pass): the posts index's "Browse by Topic" grid promoted a
// topic with zero live posts (a "News, 0 posts" card) as a clickable dead end. `load` reads the
// real content corpus (no D1/mocking needed, the route is prerendered), so this test runs
// against whatever the corpus currently tags; it asserts the filtering behavior, not fixed counts.
import { describe, expect, it } from 'vitest';
import { load } from '../routes/(site)/posts/+page.server';
import type { TopicCount } from '$theme/topic-counts';

type LoadResult = Exclude<Awaited<ReturnType<typeof load>>, void>;

async function runLoad(): Promise<LoadResult> {
  return (await load({} as never)) as LoadResult;
}

describe('/posts load: browseTopics filters out empty topics', () => {
  it('never includes a topic with zero live posts', async () => {
    const data = await runLoad();
    expect(data.browseTopics.length).toBeGreaterThan(0);
    for (const topic of data.browseTopics) {
      expect(topic.count).toBeGreaterThan(0);
    }
  });

  it('keeps the full curated vocabulary in topics (and its count in stats.topicCount), even a zero-post entry', async () => {
    const data = await runLoad();
    expect(data.topics.some((topic: TopicCount) => topic.count === 0)).toBe(true);
    expect(data.stats.topicCount).toBe(data.topics.length);
  });

  it('drops exactly the zero-count topics between topics and browseTopics', async () => {
    const data = await runLoad();
    const zeroCountValues = data.topics.filter((topic: TopicCount) => topic.count === 0).map((topic: TopicCount) => topic.value);
    expect(zeroCountValues.length).toBeGreaterThan(0);
    for (const value of zeroCountValues) {
      expect(data.browseTopics.some((topic: TopicCount) => topic.value === value)).toBe(false);
    }
  });
});
