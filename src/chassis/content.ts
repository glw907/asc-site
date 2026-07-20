// asc-site's one delivery content layer: it globs the markdown and hands the adapter to the
// full-auto createSiteIndexes, which builds the typed per-concept indexes and the site resolver.
// The cairnManifest() Vite plugin owns the build-time manifest verify (it runs outside the
// prerender lifecycle, so a stale manifest fails the build red regardless of the prerender
// handleHttpError policy).
import { createSiteIndexes } from '@glw907/cairn-cms/delivery';
import { cairn, siteConfig } from '$theme/cairn.config.js';

const postsRaw = import.meta.glob('/src/content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const pagesRaw = import.meta.glob('/src/content/pages/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// Bulletins: short, dated announcements with their own permalinked page (see cairn.config.ts's
// routing declaration).
const bulletinsRaw = import.meta.glob('/src/content/bulletins/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// Fragments also route 'embedded' (see cairn.config.ts's routing declaration): a fragment has no
// public page of its own, and reaches a reader only through the `::include` directive of an entry
// that carries it.
const fragmentsRaw = import.meta.glob('/src/content/fragments/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// Signable documents route 'embedded' too (member-waivers T1): no public page, reached only
// through the signing flow (T4), which reads a resolved published version's full text.
const documentsRaw = import.meta.glob('/src/content/documents/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const indexes = createSiteIndexes(cairn, siteConfig, {
  posts: postsRaw,
  pages: pagesRaw,
  bulletins: bulletinsRaw,
  fragments: fragmentsRaw,
  documents: documentsRaw,
});

export const site = indexes.site;
export const posts = indexes.posts;
export const pages = indexes.pages;
export const bulletins = indexes.bulletins;
export const fragments = indexes.fragments;
export const documents = indexes.documents;

export const ORIGIN = 'https://dev.aksailingclub.org';
export const SITE_DESCRIPTION =
  'The Alaska Sailing Club: classes, regattas, and family-friendly events on Anchorage waters.';
