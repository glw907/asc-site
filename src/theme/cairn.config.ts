// ASC's adapter: the single seam the engine consumes. Three concepts (posts, pages, and the
// site-declared notifications concept), a render that runs the engine's directive registry
// (Task 3: the club-grounds chrome and the callout/passage/cards components), and the GitHub App
// backend against the asc-site repo.
import { defineAdapter, defineConcept, defineRoles, fieldset, fields, githubApp, createRenderer, parseSiteConfig } from '@glw907/cairn-cms';
import { normalizeAssets, makeMediaResolver, readCommittedManifest } from '@glw907/cairn-cms/media';
import type { NavLayout } from '@glw907/cairn-cms/sveltekit';
import { CLUB_ROLES } from '$admin-club/lib/club-db';
import { ascRegistry } from './markdown/components.js';
import { ICON_PATHS } from './markdown/icons.js';
import ContactForm from './components/ContactForm.svelte';
import DonateForm from './components/DonateForm.svelte';
import ClassSchedule from './components/ClassSchedule.svelte';
import MembershipPricing from './components/MembershipPricing.svelte';
import siteYaml from './site.config.yaml?raw';
// The ?url import resolves the compiled stylesheets to their served URLs (the hashed assets in a
// build), so the editor's preview frame can link the same sheets the (site) layout loads. They
// must stay ?url-only; see the header comment in site.css.
import themeCss from './theme.css?url';
import siteCss from './site.css?url';

// Task 3 wires the club-grounds directive vocabulary (callout, passage, cards/card): the engine's
// registry, not the bare default, so those directives dispatch to real markup instead of
// rendering inert (Task 2's migration authored the content against this vocabulary already).
// Exported so a site-owned, non-content markdown source (the events deep-look pass's D1
// `long_description` rows, `$theme/events-data.ts`) renders through the same sanitized pipeline as
// ordinary content, rather than a second, weaker renderer.
export const { renderMarkdown } = createRenderer(ascRegistry);

// The split-desk sidebar (initiative 5 Task 4,
// docs/2026-07-14-admin-roles-navlayout-design.md#phase-2): the whole admin sidebar as one
// declared tree, cairn's own screens interleaved with the site's /admin/club/* routes rather
// than segregated by provenance. The six screens a committee volunteer works routinely lead
// (Club), the lower-frequency pairs get their own labeled groups (Outreach, Boats & Gear), and
// configuration sinks to the trailing Site group. Every `roles` gate names the two declared
// role names with club access (`owner`, `club-admin`); an `instructor` session (no `home`,
// `none` capability) resolves neither a club group nor an engine screen. Icon picks stay inside
// cairn's nine-name allowlist, matching the icons the site's routes carried before this tree
// existed. `{ screen: 'nav' }` is referenced here (not omitted, despite the design doc's phase-2
// prose assuming no navMenu is configured): the adapter's `editor.nav` block below DOES
// configure the site's nav-menu editor, so `navMenuConfigured` is true at construction and the
// screen is real; omitting it would leave it in the fallback foot group instead of the
// acceptance criterion's empty fallback.
export const navLayout: NavLayout = [
  {
    label: 'Club',
    roles: CLUB_ROLES,
    children: [
      // portal-capstone: the section's own landing, the needs-attention strip's front door
      // (pending signup reviews, pending asset requests, offers nearing expiry). First in the
      // list: the section's "home", not just another screen.
      { label: 'Overview', icon: 'anchor', href: '/admin/club' },
      { label: 'Events', icon: 'calendar', href: '/admin/club/events' },
      { label: 'Classes', icon: 'clipboard-list', href: '/admin/club/classes' },
      { label: 'Signups', icon: 'list', href: '/admin/club/signups' },
      { label: 'Members', icon: 'users', href: '/admin/club/members' },
      // Task 7 (docs/plans/2026-07-14-membership-admin.md): the season-flat Money & Renewals
      // screen. Every allowlisted icon is already claimed elsewhere in this tree (Announce's
      // reused 'inbox' below names the same constraint); 'table' fits the screen's own
      // season-flat table best.
      { label: 'Money', icon: 'table', href: '/admin/club/money' },
    ],
  },
  {
    label: 'Outreach',
    roles: CLUB_ROLES,
    children: [
      { label: 'Email', icon: 'inbox', href: '/admin/club/email' },
      // The Announce screen (a published post's own "notify the club" step): recently published
      // posts, each with an email-and/or-Discord send form. No spare icon in the nine-name
      // allowlist is unclaimed by this point, so this reuses 'inbox', the same messaging-shaped
      // glyph Email already carries; two adjacent inbox icons is a small, deliberate tradeoff
      // against widening the allowlist for one more screen.
      { label: 'Announce', icon: 'inbox', href: '/admin/club/announce' },
    ],
  },
  {
    label: 'Boats & Gear',
    roles: CLUB_ROLES,
    children: [
      { label: 'Assets', icon: 'package', href: '/admin/club/assets' },
      // portal-capstone: the asset-request review inbox (the signup queue's own pattern).
      { label: 'Requests', icon: 'table', href: '/admin/club/asset-requests' },
    ],
  },
  {
    label: 'Content',
    children: [{ screen: 'posts' }, { screen: 'bulletins' }, { screen: 'pages' }, { screen: 'notifications' }],
  },
  {
    label: 'Site',
    children: [
      { screen: 'media' },
      { screen: 'vocabulary' },
      { screen: 'nav' },
      // Initiative 5 Task 2 collapsed role management onto the engine's typed session; the
      // grant/revoke UI retired with `club-roles.ts` in favor of cairn's own ManageEditors
      // (`{ screen: 'editors' }`, below). This entry is only the offer-window setting now; the
      // layout guard admits either club role, and the screen's own owner-only actions re-check
      // `capability` server-side.
      // "Club settings", not "Settings": cairn's own Settings screen already carries that name,
      // and two identical labels in one nav read as a defect (Geoff, 2026-07-07 admin review).
      { label: 'Club settings', icon: 'wrench', href: '/admin/club/settings', roles: CLUB_ROLES },
      { screen: 'settings', label: 'Site settings' },
      { screen: 'editors' },
      { screen: 'help' },
    ],
  },
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

// The site's role vocabulary (initiative 5,
// docs/2026-07-14-admin-roles-navlayout-design.md#phase-1), the collapse target for the
// retired `club_roles` table. `instructor` declares no `home`: no instructor-reachable
// screen exists until class-management builds the roster, and the engine's signed-in
// welcome view is the correct landing until then. `src/app.d.ts` augments
// `CairnRolesRegister` with `typeof roles`, so `locals.editor.role` narrows to these
// three names everywhere the site reads it.
export const roles = defineRoles({
  owner: 'owner',
  'club-admin': 'editor',
  instructor: { capability: 'none' },
});

export const cairn = defineAdapter({
  roles,
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
        // Optional, matching the live site's own "primary" page template (donate, join): most
        // pages carry no hero at all, and createPublicRoutes derives `heroImage` from any
        // entry's `image` field with no per-concept wiring, the same free seam the posts
        // concept's own hero already uses.
        image: fields.image({ label: 'Hero image', seo: true }),
        // Optional, a one-line subtitle shown under the title (completion-pass manifest item 10,
        // restoring live's own governance-subpage description). Most pages carry none; the
        // catch-all template renders it only when a page sets it.
        description: fields.textarea({ label: 'Subtitle' }),
        // The page-template pass's promise hero (Task 3): a primary page's own short display
        // line, rendered as the promise hero's h1 in place of the plain title. Optional; most
        // pages carry none and keep the plain title hero.
        promise: fields.text({ label: 'Promise line' }),
        // Where the hero photo's 2:1 crop centers, as a CSS object-position pair ("50% 30%").
        // Optional; the crop centers when unset. Set it when the photo's subject sits high or
        // low in the frame (join's members, racing's fleet at the waterline).
        imageFocus: fields.text({ label: 'Hero crop focus (e.g. 50% 30%)' }),
        // The promise hero's fact strip, paired with `promise`. Reuses the open, creatable
        // multiselect shape posts' `tags` field already uses, without `taxonomy`: no vocabulary
        // pools across entries, each page's facts are its own short freeform list.
        facts: fields.multiselect({ label: 'Fact strip', creatable: true }),
      }),
    }),
    // The bulletins concept: short, time-sensitive announcements with their own permalinked page
    // (the live site's `/bulletins/<slug>/`, a completion-pass restoration; the earlier content
    // migration folded these into the `notifications` banner alone and dropped the pages
    // themselves, which 404'd with no redirect). `routing: 'feed'` gives each entry a real page
    // and the default `/bulletins/:slug` permalink; the two migrated ids carry only a
    // year-month prefix (no day), which the default `day` datePrefix does not strip, so the slug
    // stays the id verbatim and matches the live URLs exactly with no redirect needed. A future
    // bulletin created through the editor gets a full day-granularity id instead, a reasonable
    // step up, not a mismatch to paper over.
    bulletins: defineConcept({
      dir: 'src/content/bulletins',
      label: 'Bulletins',
      singular: 'Bulletin',
      routing: 'feed',
      fields: fieldset({
        title: fields.text({ label: 'Title', required: true }),
        date: fields.date({ label: 'Date', required: true }),
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
    repo: 'aksailingclub-org',
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
    // The contact and donate directives' live components (completion-pass manifest item 2),
    // mounted over their build() fallback by the root layout's hydrateIslands() call.
    islands: {
      'contact-form': ContactForm,
      'donate-form': DonateForm,
      'class-schedule': ClassSchedule,
      'membership-pricing': MembershipPricing,
    },
  },
  editor: {
    nav: { configPath: 'src/theme/site.config.yaml', menuName: 'primary', label: 'Navigation', maxDepth: 2 },
    // The preview knob: the (site) layout renders entries inside <main class="site-main">
    // (site.css), so the frame links the same theme/site sheets and reproduces that container.
    preview: { stylesheets: [themeCss, siteCss], containerClass: 'site-main' },
    navLayout,
    // The publish-actions seam: a published post lands beside the Announce screen's own
    // detail route (`/admin/club/announce/[id]`, a path param, not the doc example's query-string
    // shape) so the member who just published can jump straight into notifying the club.
    // Restricted to posts: pages have no Announce screen.
    publishActions: [{ label: 'Announce this post', href: '/admin/club/announce/{id}', concepts: ['posts'] }],
  },
});

export const siteConfig = parseSiteConfig(siteYaml);
