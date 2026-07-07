import { describe, it, expect } from 'vitest';
import type { MediaEntry, MediaManifest } from '@glw907/cairn-cms/media';
import type { ContentIndex, ContentSummary, ContentEntry } from '@glw907/cairn-cms/delivery';
import type { ImageValue } from '@glw907/cairn-cms';
import { newsCards } from '$theme/post-cards';

const HASH = 'aa11bb22cc33dd44';

function mediaEntry(): MediaEntry {
  return {
    hash: HASH,
    sha256: HASH.repeat(4),
    slug: 'a-photo',
    displayName: 'a-photo',
    originalFilename: 'a-photo.jpg',
    alt: 'manifest alt text',
    ext: 'jpg',
    contentType: 'image/jpeg',
    bytes: 100,
    width: null,
    height: null,
    createdAt: '2026-07-06T00:00:00.000Z',
  };
}

function summary(over: Partial<ContentSummary> & { id: string; wordCount: number }): ContentSummary {
  return {
    concept: 'posts',
    slug: over.id,
    permalink: `/posts/${over.id}`,
    title: 'A Post',
    tags: [],
    excerpt: '',
    draft: false,
    fields: {},
    ...over,
  };
}

function fakePosts(entries: Record<string, ImageValue | undefined>): ContentIndex<{ image?: ImageValue }> {
  return {
    byId: (id) =>
      id in entries
        ? ({
            concept: 'posts',
            id,
            slug: id,
            permalink: `/posts/${id}`,
            title: 'A Post',
            tags: [],
            excerpt: '',
            wordCount: 0,
            draft: false,
            fields: {},
            frontmatter: { image: entries[id] },
            body: '',
          } satisfies ContentEntry<{ image?: ImageValue }>)
        : undefined,
  } as ContentIndex<{ image?: ImageValue }>;
}

describe('newsCards', () => {
  it('resolves a post whose frontmatter image is in the manifest', () => {
    const manifest: MediaManifest = { [HASH]: mediaEntry() };
    const image: ImageValue = { src: `media:a-photo.${HASH}`, alt: 'a real alt' };
    const cards = newsCards(
      [summary({ id: 'p1', wordCount: 400 })],
      fakePosts({ p1: image }),
      manifest,
      (ref) => `/media/${ref.hash}.jpg`,
    );
    expect(cards[0].image).toEqual({ url: `/media/${HASH}.jpg`, alt: 'a real alt' });
  });

  it('degrades to no image when the post declares none', () => {
    const cards = newsCards(
      [summary({ id: 'p1', wordCount: 400 })],
      fakePosts({ p1: undefined }),
      {},
      () => undefined,
    );
    expect(cards[0].image).toBeUndefined();
  });

  it('degrades to no image when the resolver finds no asset', () => {
    const image: ImageValue = { src: `media:a-photo.${HASH}`, alt: 'a real alt' };
    const cards = newsCards([summary({ id: 'p1', wordCount: 400 })], fakePosts({ p1: image }), {}, () => undefined);
    expect(cards[0].image).toBeUndefined();
  });

  it('rounds the word count to whole minutes, at least one', () => {
    const posts = fakePosts({ short: undefined, long: undefined });
    const cards = newsCards(
      [summary({ id: 'short', wordCount: 40 }), summary({ id: 'long', wordCount: 620 })],
      posts,
      {},
      () => undefined,
    );
    expect(cards[0].readMinutes).toBe(1);
    expect(cards[1].readMinutes).toBe(3);
  });
});
