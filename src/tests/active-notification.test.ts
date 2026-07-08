import { describe, it, expect } from 'vitest';
import type { ContentIndex, ContentSummary, ContentEntry } from '@glw907/cairn-cms/delivery';
import { activeNotification, parseBoldSegments, type NotificationFields } from '$theme/active-notification';

/** A minimal fake ContentIndex, just the two methods activeNotification actually reads. */
function fakeIndex(
  entries: Array<{ id: string; title: string; body: string; expires: string }>,
): ContentIndex<NotificationFields> {
  const byId = new Map(
    entries.map((e) => [
      e.id,
      {
        concept: 'notifications',
        id: e.id,
        slug: e.id,
        permalink: `/notifications/${e.id}`,
        title: e.title,
        tags: [],
        excerpt: '',
        wordCount: 0,
        draft: false,
        fields: {},
        frontmatter: { body: e.body, expires: e.expires },
        body: '',
      } satisfies ContentEntry<NotificationFields>,
    ]),
  );
  const summaries: ContentSummary[] = entries.map((e) => ({
    concept: 'notifications',
    id: e.id,
    slug: e.id,
    permalink: `/notifications/${e.id}`,
    title: e.title,
    tags: [],
    excerpt: '',
    wordCount: 0,
    draft: false,
    fields: {},
  }));
  return {
    all: () => summaries,
    byId: (id) => byId.get(id),
  } as ContentIndex<NotificationFields>;
}

describe('activeNotification', () => {
  it('returns the entry whose expiry has not yet passed', () => {
    const notifications = fakeIndex([
      { id: 'a', title: 'Membership open', body: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(notifications, '2026-03-01')).toEqual({
      title: 'Membership open',
      body: 'Join today.',
    });
  });

  it('returns undefined once the entry has expired, matching an honest silence', () => {
    const notifications = fakeIndex([
      { id: 'a', title: 'Membership open', body: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(notifications, '2026-07-06')).toBeUndefined();
  });

  it('treats the expiry date itself as still current (inclusive)', () => {
    const notifications = fakeIndex([
      { id: 'a', title: 'Membership open', body: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(notifications, '2026-04-30')).toBeDefined();
  });

  it('returns undefined when there are no entries at all', () => {
    expect(activeNotification(fakeIndex([]), '2026-07-06')).toBeUndefined();
  });

  it('returns the first still-current entry when more than one exists', () => {
    const notifications = fakeIndex([
      { id: 'a', title: 'Older, still current', body: 'A', expires: '2026-12-31' },
      { id: 'b', title: 'Newer, still current', body: 'B', expires: '2026-12-31' },
    ]);
    expect(activeNotification(notifications, '2026-07-06')).toEqual({
      title: 'Older, still current',
      body: 'A',
    });
  });
});

describe('parseBoldSegments', () => {
  it('splits one bold run out of surrounding plain text', () => {
    expect(parseBoldSegments('racing starts **May 18** — come for the opener.')).toEqual([
      { text: 'racing starts ', bold: false },
      { text: 'May 18', bold: true },
      { text: ' — come for the opener.', bold: false },
    ]);
  });

  it('returns one plain segment when there is no bold marker at all', () => {
    expect(parseBoldSegments('No bold fact here.')).toEqual([{ text: 'No bold fact here.', bold: false }]);
  });

  it('drops an empty leading or trailing segment', () => {
    expect(parseBoldSegments('**Only bold**')).toEqual([{ text: 'Only bold', bold: true }]);
  });
});
