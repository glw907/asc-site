import { describe, it, expect } from 'vitest';
import { composeRuntime, extractVocabulary } from '@glw907/cairn-cms';
import { createContentRoutes } from '@glw907/cairn-cms/sveltekit';
import { cairn, siteConfig } from '$theme/cairn.config';

// The adapter's own shape, pinned so a later pass cannot silently drift the URL contract or the
// curated tag vocabulary while migrating content (Task 2) or building the theme (Task 3).
describe('the ASC adapter', () => {
  it('declares a dated posts concept on the feed route shape', () => {
    expect(cairn.content.posts.routing).toBe('feed');
    expect(cairn.content.posts.dir).toBe('src/content/posts');
  });

  it('declares an undated pages concept keyed by its own id', () => {
    expect(cairn.content.pages.routing).toBe('page');
    expect(cairn.content.pages.dir).toBe('src/content/pages');
  });

  it('declares the dated bulletins concept on the feed route shape', () => {
    expect(cairn.content.bulletins.routing).toBe('feed');
    expect(cairn.content.bulletins.dir).toBe('src/content/bulletins');
  });

  it('curates the five club-taxonomy tag values as the site vocabulary', () => {
    expect(extractVocabulary(siteConfig).map((entry) => entry.value)).toEqual([
      'news',
      'racing',
      'results',
      'education',
      'club',
    ]);
  });

  // The publish-actions seam (0.83.0): the Announce link's `concepts: ['posts']` filter must
  // name a real concept id, and its label/href must both be present, or the runtime refuses to
  // construct. `createContentRoutes` is where that validation actually runs (composeRuntime
  // itself only threads the raw config through), so this exercises the real construction path
  // rather than composeRuntime alone.
  it('validates the Announce publishActions entry at construction', () => {
    const runtime = composeRuntime({ adapter: cairn, siteConfig });
    expect(runtime.publishActions).toEqual([
      { label: 'Announce this post', href: '/admin/club/announce/{id}', concepts: ['posts'] },
    ]);
    expect(() => createContentRoutes(runtime)).not.toThrow();
  });
});
