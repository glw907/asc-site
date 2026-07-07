// ASC's adapter: the single seam the engine consumes. Three concepts (posts, pages, and the
// site-declared notifications concept), a render that runs the engine's directive registry
// (Task 3: the club-grounds chrome and the callout/passage/cards components), and the GitHub App
// backend against the asc-site repo.
import { defineAdapter, defineConcept, fieldset, fields, githubApp, createRenderer, parseSiteConfig } from '@glw907/cairn-cms';
import { normalizeAssets, makeMediaResolver, readCommittedManifest } from '@glw907/cairn-cms/media';
import type { AdminNavEntry } from '@glw907/cairn-cms/sveltekit';
import { ascRegistry } from './markdown/components.js';
import { ICON_PATHS } from './markdown/icons.js';
import siteYaml from './site.config.yaml?raw';
// The ?url import resolves the compiled stylesheets to their served URLs (the hashed assets in a
// build), so the editor's preview frame can link the same sheets the (site) layout loads. They
// must stay ?url-only; see the header comment in site.css.
import themeCss from './theme.css?url';
import siteCss from './site.css?url';

// Task 3 wires the club-grounds directive vocabulary (callout, passage, cards/card): the engine's
// registry, not the bare default, so those directives dispatch to real markup instead of
// rendering inert (Task 2's migration authored the content against this vocabulary already).
const { renderMarkdown } = createRenderer(ascRegistry);

// The Club section (docs/superpowers/specs/2026-07-06-asc-phase-2-design-suite.md, Part B): the
// ops-absorption screens present inside cairn's admin as custom /admin/club/* routes, one sidebar
// entry each. adminNav is flat today (Part C item 4 records the future grouping seam), so the
// six entries render as six ungrouped links rather than a nested "Club" section; docs/
// club-admin-scaffold.md tracks that gap. Icon picks stay inside cairn's nine-name allowlist.
const clubAdminNav: AdminNavEntry[] = [
  { label: 'Club: Events', icon: 'calendar', href: '/admin/club/events' },
  { label: 'Club: Classes', icon: 'clipboard-list', href: '/admin/club/classes' },
  { label: 'Club: Members', icon: 'users', href: '/admin/club/members' },
  { label: 'Club: Signups', icon: 'list', href: '/admin/club/signups' },
  { label: 'Club: Assets', icon: 'package', href: '/admin/club/assets' },
  { label: 'Club: Email', icon: 'inbox', href: '/admin/club/email' },
];

// The committed media manifest the public render resolver reads. A bare {} until an editor
// uploads. Read through import.meta.glob so a fresh site with no committed media.json degrades
// to {} rather than failing the build: a static import of a missing file is a build-time
// module-not-found, but a glob with no match returns {}, and readCommittedManifest parses that
// to an empty manifest. Exported so the home page's fixed photography placements (src/theme/
// home-images.ts) can read an entry's alt text directly, the same manifest the body resolver uses.
export const mediaManifest = readCommittedManifest(
  import.meta.glob('../content/.cairn/media.json', { eager: true, import: 'default' }),
);

// The default public media resolver, backing the public build over the committed manifest. The
// preview path injects its own resolveMedia from the edit page's mediaTargets; this default
// keeps a published `media:` reference from throwing when no per-call resolver is supplied.
const resolvedAssets = normalizeAssets({ bucketBinding: 'MEDIA_BUCKET' });
export const publicMediaResolver = makeMediaResolver(mediaManifest, resolvedAssets);

// Whether media is configured on. The public route threads it as `assetsEnabled` so the engine
// logs `media.resolver_absent` if a future edit drops the resolveMedia wiring while media stays
// on.
export const mediaEnabled = resolvedAssets.enabled;

export const cairn = defineAdapter({
  content: {
    posts: defineConcept({
      dir: 'src/content/posts',
      label: 'Posts',
      summaryFields: ['description'],
      routing: 'feed',
      fields: fieldset({
        title: fields.text({ label: 'Title', required: true }),
        date: fields.date({ label: 'Date' }),
        description: fields.textarea({ label: 'Description' }),
        // The curated tag vocabulary (site.config.yaml's `vocabulary`) marks the news, racing,
        // results, education, and club categories; a public archive filters over this data.
        tags: fields.multiselect({ label: 'Tags', creatable: true, taxonomy: true }),
        // The hero seam Task 2's migration found missing (finding #3: the old Hugo posts each had
        // a real featuredImage from the live site, dropped rather than invented at migration time).
        // createPublicRoutes derives `heroImage` from this same field with no bespoke code; the
        // catch-all template already renders it.
        image: fields.image({ label: 'Hero image', seo: true }),
      }),
    }),
    pages: defineConcept({
      dir: 'src/content/pages',
      label: 'Pages',
      routing: 'page',
      fields: fieldset({
        title: fields.text({ label: 'Title', required: true }),
      }),
    }),
    // The site-declared notifications concept: a time-boxed announcement rendered as the home
    // banner strip (Task 3 wires the read). `routing: 'embedded'` means no per-entry public
    // page and no sitemap entry; the entry is data the theme reads and places itself.
    notifications: defineConcept({
      dir: 'src/content/notifications',
      label: 'Notifications',
      singular: 'Notification',
      routing: 'embedded',
      fields: fieldset({
        title: fields.text({ label: 'Title', required: true }),
        body: fields.textarea({ label: 'Body', required: true }),
        expires: fields.date({
          label: 'Expires',
          required: true,
          help: 'The banner shows through the end of this date, then stops rendering.',
        }),
      }),
    }),
  },
  backend: githubApp({
    owner: 'glw907',
    repo: 'asc-site',
    branch: 'main',
    appId: '3847496',
    installationId: '135372268',
  }),
  email: { from: 'noreply@aksailingclub.org' },
  // The media R2 binding: the /media delivery route streams content-addressed bytes from here.
  media: { bucketBinding: 'MEDIA_BUCKET' },
  rendering: {
    render: ({ body, resolve, resolveMedia }) =>
      renderMarkdown(body, { resolve, resolveMedia: resolveMedia ?? publicMediaResolver }),
    components: ascRegistry,
    icons: ICON_PATHS,
  },
  editor: {
    nav: { configPath: 'src/theme/site.config.yaml', menuName: 'primary', label: 'Navigation', maxDepth: 2 },
    // The preview knob: the (site) layout renders entries inside <main class="site-main">
    // (site.css), so the frame links the same theme/site sheets and reproduces that container.
    preview: { stylesheets: [themeCss, siteCss], containerClass: 'site-main' },
    adminNav: clubAdminNav,
  },
});

export const siteConfig = parseSiteConfig(siteYaml);
