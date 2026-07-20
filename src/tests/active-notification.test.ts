import { describe, it, expect } from 'vitest';
import type { ContentIndex, ContentSummary, ContentEntry } from '@glw907/cairn-cms/delivery';
import { activeNotification, parseBoldSegments, type BulletinBannerFields } from '$theme/active-notification';

/** A minimal fake ContentIndex, just the two methods activeNotification actually reads. Entries
 *  come pre-sorted newest-first, matching `createContentIndex`'s own sort for a dated concept
 *  like `bulletins`. */
function fakeIndex(
  entries: Array<{ id: string; title: string; detail: string; expires: string }>,
): ContentIndex<BulletinBannerFields> {
  const byId = new Map(
    entries.map((e) => [
      e.id,
      {
        concept: 'bulletins',
        id: e.id,
        slug: e.id,
        permalink: `/bulletins/${e.id}`,
        title: e.title,
        tags: [],
        excerpt: '',
        wordCount: 0,
        draft: false,
        fields: {},
        frontmatter: { detail: e.detail, expires: e.expires },
        body: '',
      } satisfies ContentEntry<BulletinBannerFields>,
    ]),
  );
  const summaries: ContentSummary[] = entries.map((e) => ({
    concept: 'bulletins',
    id: e.id,
    slug: e.id,
    permalink: `/bulletins/${e.id}`,
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
  } as ContentIndex<BulletinBannerFields>;
}

describe('activeNotification', () => {
  it('returns the entry whose expiry has not yet passed', () => {
    const bulletins = fakeIndex([
      { id: 'a', title: 'Membership open', detail: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(bulletins, '2026-03-01')).toEqual({
      title: 'Membership open',
      body: 'Join today.',
    });
  });

  it('returns undefined once the entry has expired, matching an honest silence', () => {
    const bulletins = fakeIndex([
      { id: 'a', title: 'Membership open', detail: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(bulletins, '2026-07-06')).toBeUndefined();
  });

  it('treats the expiry date itself as still current (inclusive)', () => {
    const bulletins = fakeIndex([
      { id: 'a', title: 'Membership open', detail: 'Join today.', expires: '2026-04-30' },
    ]);
    expect(activeNotification(bulletins, '2026-04-30')).toBeDefined();
  });

  it('returns undefined when there are no entries at all', () => {
    expect(activeNotification(fakeIndex([]), '2026-07-06')).toBeUndefined();
  });

  it('returns the first still-current entry when more than one exists (newest-first order)', () => {
    const bulletins = fakeIndex([
      { id: 'a', title: 'Newer, still current', detail: 'A', expires: '2026-12-31' },
      { id: 'b', title: 'Older, still current', detail: 'B', expires: '2026-12-31' },
    ]);
    expect(activeNotification(bulletins, '2026-07-06')).toEqual({
      title: 'Newer, still current',
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
