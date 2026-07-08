<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import { GOVERNANCE_SUBPAGE_SLUGS } from '$theme/redirects';

  let { data }: { data: PageData } = $props();

  const isPost = $derived(data.entry.concept === 'posts');
  // Bulletins are dated the same as posts (a bulletin's date is its whole point), but carry no
  // tags field of their own, so the date line is shared while the tags list below stays post-only.
  const showDate = $derived(isPost || data.entry.concept === 'bulletins');

  // The old site's governance subpages (bylaws, articles of incorporation, and the rest) each
  // carried a "back to Governance" link and a one-line subtitle under the title (completion-pass
  // manifest item 10); GOVERNANCE_SUBPAGE_SLUGS is derived from the same redirect map that already
  // knows which pages those are.
  const isGovernanceSubpage = $derived(
    data.entry.concept === 'pages' && GOVERNANCE_SUBPAGE_SLUGS.has(data.entry.slug),
  );
  const subtitle = $derived(data.entry.frontmatter.description as string | undefined);
  // The pages concept's own title-adjacent hero (Strand 3 of the presentation round, adapted from
  // the old education page's photo-beside-the-title device): a page's hero sits next to its own
  // title, not stacked full-width above it the way a post's hero (`.hero` below) already does.
  // Posts and bulletins keep that existing contained treatment untouched.
  const isPageHero = $derived(data.entry.concept === 'pages' && Boolean(data.heroImage));

  const dateFmt = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  /** Render an ISO `YYYY-MM-DD` date as "14 May 2026". */
  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }

  /** One heading captured from the rendered article, for the table of contents. rehype-slug (the
   *  render pipeline's default) gives every h2/h3 an id; this reads that id back off the
   *  already-rendered HTML string rather than re-parsing markdown, so it stays in lockstep with
   *  whatever the render pipeline emitted. Ported from the astropaper-theme's own reference
   *  implementation, the family pattern for this device. */
  interface TocItem {
    id: string;
    text: string;
    level: 2 | 3;
  }

  // Named HTML entities the render pipeline's stringify step can emit inside heading text (the
  // five XML-predefined entities, plus the non-breaking space markdown sometimes carries).
  const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

  /** Decode a numeric (`&#38;`/`&#x26;`) or named (`&amp;`) HTML entity back to its character.
   *  extractToc pulls heading text out of already-serialized HTML by stripping tags with a plain
   *  regex, which leaves any entity the stringifier wrote (rehype-stringify entity-encodes `&` in
   *  text nodes) undecoded; left alone, that raw markup lands in a Svelte text expression and
   *  prints literally ("Adult &amp; Teen Track") instead of the character it stands for. */
  function decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
      if (body[0] === '#') {
        const codePoint = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
      }
      return body in NAMED_ENTITIES ? NAMED_ENTITIES[body] : match;
    });
  }

  function extractToc(html: string): TocItem[] {
    const items: TocItem[] = [];
    const headingRe = /<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
    for (const match of html.matchAll(headingRe)) {
      const level = Number(match[1]) as 2 | 3;
      const text = decodeEntities(match[3].replace(/<[^>]*>/g, '').trim());
      if (text) items.push({ level, id: match[2], text });
    }
    return items;
  }

  // The long-form page device: a page named here renders as a whole-document article, no boxed
  // panels, no measure change, its own jump list plus a true gutter rail (past 1280px), and (the
  // 2026-07-08 benchmark-alignment pass) its own document merged into the title-adjacent hero and
  // grouped by GROUP_HEADINGS below. Keyed by the pages concept's own flat slug, the same key
  // GOVERNANCE_SUBPAGE_SLUGS uses. A page not listed here (every other long document, bylaws
  // included) keeps the heading-count-gated panel/TOC template below unchanged. Currently
  // education only.
  const LONG_FORM_PAGE_SLUGS = new Set(['education']);

  // A long-form page's own group structure (the 2026-07-08 benchmark-alignment pass, axis B): a
  // hairline-and-label divider announces the start of each named part after the first, so the
  // page's multi-part shape reads at a glance across a long scroll rather than as one
  // undifferentiated stack of h2 sections. Keyed by slug; a long-form page with no entry here
  // renders with no dividers at all. A heading id not found in the document contributes no split
  // (see splitAtHeadingIds below), so a content edit that renames or removes a group heading
  // degrades to fewer, larger groups rather than throwing or dropping content.
  const GROUP_HEADINGS: Record<string, { headingId: string; label: string }[]> = {
    education: [
      { headingId: 'how-to-register', label: 'Registration & logistics' },
      { headingId: 'cancellation-and-refund-policy', label: 'Policies & questions' },
    ],
  };

  const longFormSlug = $derived(
    data.entry.concept === 'pages' && LONG_FORM_PAGE_SLUGS.has(data.entry.slug) ? data.entry.slug : undefined,
  );

  /** Splits off the document's very first paragraph, when the document opens with one (no
   *  heading or other block precedes it). Falls back to no split (an empty lede, the whole
   *  document as `rest`) when the document does not open with a plain paragraph, so a future
   *  content edit that opens with something else degrades to the plain hero (title and photo
   *  only) rather than mis-slicing unrelated markup. Powers the title-adjacent hero's own lede
   *  (axis A of the 2026-07-08 benchmark-alignment pass): title, lede, and photo compose as one
   *  visual unit, matching the home page's own hero grammar, rather than floating the lede below
   *  the whole hero row. Scoped to long-form pages only (`mergeLedeIntoHero` below), not every
   *  `isPageHero` page, so the composition change stays inside this pass's own target rather than
   *  reaching into donate/join/members/racing/new-member-guide, none of which this pass reviewed. */
  function splitLede(html: string): { lede: string; rest: string } {
    const match = /^\s*<p>[\s\S]*?<\/p>/.exec(html);
    if (!match) return { lede: '', rest: html };
    return { lede: match[0], rest: html.slice(match[0].length) };
  }

  const mergeLedeIntoHero = $derived(isPageHero && Boolean(longFormSlug));
  const ledeSplit = $derived(mergeLedeIntoHero ? splitLede(data.html) : null);
  const heroLede = $derived(ledeSplit ? ledeSplit.lede : '');
  // Every other derived value below reads `contentHtml`, never `data.html` directly, so the hero
  // lede (once split off) does not also appear a second time further down the document.
  const contentHtml = $derived(ledeSplit ? ledeSplit.rest : data.html);

  // Gated on a heading count, not a hardcoded slug list, so this generalizes to any page that
  // grows into a long reference document rather than special-casing bylaws and the new-member
  // guide by name (spec B1: "in-page TOCs on the longest pages"). Eight or more h2/h3 headings is
  // the density where a document reads as a reference to navigate rather than prose to read
  // straight through.
  //
  // A long-form page (`longFormSlug` set) never uses this boxed-panel frame: it gets the
  // long-form navigation below instead (a jump list plus, past 1280px, a true gutter rail),
  // covering the WHOLE document from the top rather than gating on a reference tail. Every other
  // long page that earns this frame by heading count (racing, join, bylaws, and the rest) keeps
  // it unchanged.
  const toc = $derived(extractToc(contentHtml));
  const showToc = $derived(toc.length >= 8 && !longFormSlug);
  // The section-panel treatment (the presentation round's Strand 2) is the pages concept's own
  // template device, not a general density-gated feature: a long post or bulletin still earns the
  // sticky gutter TOC below, but its body stays plain prose, unpanelled.
  const showPanels = $derived(showToc && data.entry.concept === 'pages');

  // The long-form site TOC standard's own list (Geoff, 2026-07-07): h2 sections only, computed
  // over the whole document (`contentHtml`, which already excludes the hero's own lede paragraph
  // when `mergeLedeIntoHero`), so the navigation is present and complete from the top of the
  // article rather than appearing only once a reader reaches the tail. Read by both `jumpLinks`
  // (the in-flow list, <1280px and as the printed/no-JS baseline) and `.page-toc-rail` (the fixed
  // gutter rail, >=1280px) below; the two never render at once, CSS toggles between them by
  // breakpoint.
  const jumpLinks = $derived(longFormSlug ? extractToc(contentHtml).filter((item) => item.level === 2) : []);

  /** Splits rendered HTML at each top-level `<h2>` boundary: everything before the first h2 (the
   *  lede under the title) is the preamble, and each h2 through the content up to (but excluding)
   *  the next h2 is one section. Shares extractToc's assumption that a heading is always a
   *  top-level block in the render output, never nested inside another element. */
  function splitAtH2(html: string): { preamble: string; sections: string[] } {
    const starts = [...html.matchAll(/<h2 id="[^"]+"[^>]*>/g)].map((match) => match.index);
    if (starts.length === 0) return { preamble: html, sections: [] };
    const preamble = html.slice(0, starts[0]);
    const sections = starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length));
    return { preamble, sections };
  }

  /** Wraps one section's markup in the contained-panel shell (the site's border/radius/shadow
   *  surface family), and marks its own lede, the paragraph immediately after the heading, so it
   *  reads with a touch more weight than the paragraphs that follow it. Only the paragraph
   *  directly adjacent to the heading qualifies, not the first `<p>` anywhere in the section: a
   *  section that opens straight into a callout or a subheading, with no lede paragraph of its
   *  own, is left alone rather than mis-marking a paragraph buried deeper in the section. */
  function toPanel(sectionHtml: string): string {
    const withLede = sectionHtml.replace(/(<\/h2>\s*)<p>/, '$1<p class="panel-lede">');
    return `<section class="content-panel">${withLede}</section>`;
  }

  // Splits `contentHtml`, the whole document (minus a merged-away hero lede): `preambleHtml`
  // (rare, since the split heading is itself an h2) and `sectionsHtml` only ever cover the
  // material this template panelizes.
  const split = $derived(showToc ? splitAtH2(contentHtml) : null);
  const preambleHtml = $derived(split ? split.preamble : contentHtml);
  const sectionsHtml = $derived(
    split ? split.sections.map((section) => (showPanels ? toPanel(section) : section)).join('') : '',
  );

  /** Splits rendered HTML at each of `boundaries`' heading ids, in the order they actually occur
   *  in the document, returning one segment per span between two boundaries (plus the leading
   *  span before the first one). Each segment carries the label of the divider that precedes it
   *  (`null` for the leading span, which gets no divider). A `headingId` not found in the document
   *  is silently dropped, so its neighboring spans merge into one larger group instead of
   *  throwing or losing content. */
  function splitAtHeadingIds(
    html: string,
    boundaries: { headingId: string; label: string }[],
  ): { html: string; label: string | null }[] {
    const found = boundaries
      .map((boundary) => ({ label: boundary.label, index: new RegExp(`<h[23] id="${boundary.headingId}"`).exec(html)?.index }))
      .filter((boundary): boundary is { label: string; index: number } => boundary.index !== undefined)
      .sort((a, b) => a.index - b.index);
    const segments: { html: string; label: string | null }[] = [];
    let start = 0;
    let label: string | null = null;
    for (const boundary of found) {
      segments.push({ html: html.slice(start, boundary.index), label });
      start = boundary.index;
      label = boundary.label;
    }
    segments.push({ html: html.slice(start), label });
    return segments;
  }

  // A long-form page's own preamble/body split (the material before its first h2, and everything
  // from there on), so the jump-links nav can sit right after the intro the same way it always
  // has, ahead of the grouped sections below.
  const longFormSplit = $derived(longFormSlug ? splitAtH2(contentHtml) : null);
  const longFormPreamble = $derived(longFormSplit ? longFormSplit.preamble : '');
  const longFormBody = $derived(longFormSplit ? contentHtml.slice(longFormPreamble.length) : '');
  const groupSegments = $derived(
    longFormSlug ? splitAtHeadingIds(longFormBody, GROUP_HEADINGS[longFormSlug] ?? []) : [],
  );

  // The sticky gutter TOC's active-section highlight (Strand 2, and shared by the long-form gutter
  // rail below): an IntersectionObserver per heading, biased toward the top of the viewport (a
  // large negative bottom rootMargin), the standard scrollspy technique, so "active" tracks
  // whichever section is at the top of the reading area rather than merely anywhere onscreen. No
  // transition is declared on the highlight style anywhere in this file's style block below, so
  // there is nothing to gate behind prefers-reduced-motion: the swap is already instant.
  const spyItems = $derived(longFormSlug ? jumpLinks : toc);
  let activeId: string | null = $state(null);
  const highlightedId = $derived(activeId ?? spyItems[0]?.id ?? null);

  $effect(() => {
    if (!showToc && !longFormSlug) return;
    const headings = spyItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) activeId = entry.target.id;
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  });
</script>

{#snippet tocList(items: TocItem[], activeItemId: string | null)}
  <ul class="m-0 list-none p-0">
    {#each items as item (item.id)}
      <li class={item.level === 3 ? 'ml-m' : ''}>
        <a href={`#${item.id}`} class={item.id === activeItemId ? 'toc-active' : ''}>{item.text}</a>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet titleBlock()}
  {#if showDate && data.entry.date}
    <p class="post-date">{formatDate(data.entry.date)}</p>
  {/if}
  <h1>{data.entry.title}</h1>
  {#if subtitle}
    <p class="page-subtitle not-prose">{subtitle}</p>
  {/if}
{/snippet}

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<article class="prose" class:long-form-page={Boolean(longFormSlug)}>
  {#if isGovernanceSubpage}
    <a href="/governance/" class="not-prose back-link">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M19 12H5M11 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Governance
    </a>
  {/if}
  {#if isPageHero}
    <div class="page-title-hero not-prose" class:hero-has-lede={mergeLedeIntoHero}>
      <div class="page-title-hero-text">
        {@render titleBlock()}
        {#if heroLede}
          <div class="hero-lede">{@html heroLede}</div>
        {/if}
      </div>
      <figure class="page-title-hero-figure">
        <img src={data.heroImage?.url} alt={data.heroImage?.alt} />
      </figure>
    </div>
  {:else}
    {#if data.heroImage}
      <figure class="hero">
        <img src={data.heroImage.url} alt={data.heroImage.alt} />
        {#if data.heroImage.caption}
          <figcaption>{data.heroImage.caption}</figcaption>
        {/if}
      </figure>
    {/if}
    {@render titleBlock()}
  {/if}
  {#if longFormSlug}
    <!-- The long-form page (education, 2026-07-07): a whole-document article, no boxed panels, no
         measure change. The navigation sits right after the intro, before the first section, so
         it is present from the top rather than appearing only once a reader reaches the tail;
         `.jump-links` and `.page-toc-rail` render the same list and never both show at once (CSS
         toggles by breakpoint, `jumpLinks`'s own comment above explains the shared source). -->
    {@html longFormPreamble}
    <nav class="jump-links not-prose" aria-label="Jump to section">
      <span class="jump-links-label">On this page</span>
      {@render tocList(jumpLinks, null)}
    </nav>
    <aside class="page-toc-rail not-prose">
      <p class="page-toc-heading">On this page</p>
      <nav aria-label="On this page">
        {@render tocList(jumpLinks, highlightedId)}
      </nav>
    </aside>
    <!-- The page's own named groups (axis B, 2026-07-08): a hairline-and-label divider announces
         the start of each part after the first, so the multi-part shape reads at a glance across
         a long scroll. `segment.label` is `null` for the leading group, which gets no divider. -->
    {#each groupSegments as segment, i (i)}
      {#if segment.label}
        <div class="group-divider not-prose">
          <span class="group-divider-label">{segment.label}</span>
        </div>
      {/if}
      {@html segment.html}
    {/each}
  {:else}
    {#if showToc}
      <details class="toc mobile-toc">
        <summary>Table of contents</summary>
        <nav aria-label="Table of contents">
          {@render tocList(toc, null)}
        </nav>
      </details>
    {/if}
    {@html preambleHtml}
    {#if showToc}
      <div class="article-toc-shell">
        <div class="article-sections">
          {@html sectionsHtml}
        </div>
        <aside class="page-toc-sticky">
          <p class="page-toc-heading">On this page</p>
          <nav aria-label="Table of contents">
            {@render tocList(toc, highlightedId)}
          </nav>
        </aside>
      </div>
    {/if}
  {/if}
  {#if isPost && data.entry.tags.length > 0}
    <ul class="post-tags" aria-label="Tags">
      {#each data.entry.tags as tag (tag)}
        <li>{tag}</li>
      {/each}
    </ul>
  {/if}
</article>

<style>
  .post-date {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
    margin: 0 0 var(--spacing-2xs);
  }
  .post-tags {
    list-style: none;
    padding: 0;
    margin: var(--spacing-l) 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs);
  }
  .post-tags li {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-step--1);
    letter-spacing: 0.05em;
    color: var(--color-muted);
    padding: 0.2em 0.55em;
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-selector);
  }

  /* The governance subpage "back to Governance" link (manifest item 10), restoring the live
     site's own secondary-page back-link. */
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: var(--spacing-s);
    color: var(--color-muted);
    text-decoration: none;
    font-size: var(--text-step--1);
  }
  .back-link:hover {
    color: var(--color-primary);
  }

  /* The subtitle line under the title (manifest item 10): a distinct, quieter line, not another
     prose paragraph. */
  .page-subtitle {
    margin: 0 0 var(--spacing-m);
    font-size: var(--text-step-0);
    color: var(--color-muted);
  }

  /* A long-form page's group hand-off (axis B, 2026-07-08): a plain typographic break (a rule
     plus a small label) announcing the next named part starts here, rather than the reader
     inferring the shift with no signal at all (the design-polish pass's original finding,
     2026-07-07, generalized from a single pitch/reference split to however many named groups
     GROUP_HEADINGS declares; kept as a plain rule rather than a colored band per Geoff's
     2026-07-07 ruling that content pages carry no bands at all). Sits in the plain reading
     column; the next group's own material renders as ordinary article flow, the same measure and
     heading scale as everything above it.

     `--flow-space` is set well past an ordinary h2's own `--spacing-xl` (prose.css): the owl
     selector below reads it back for this element's own `margin-top`, so a group boundary's total
     seam (this margin, plus the divider's own height, plus the next heading's own spacing-xl) is
     decisively bigger than the gap between two sections inside the same group. */
  .group-divider {
    --flow-space: var(--spacing-2xl);
    display: flex;
    align-items: center;
    gap: var(--spacing-s);
  }
  .group-divider::before,
  .group-divider::after {
    content: '';
    flex: 1 1 auto;
    height: var(--border);
    background: var(--color-card-border);
  }
  .group-divider-label {
    flex: 0 0 auto;
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }

  /* The long-form site TOC standard (Geoff, 2026-07-07): a compact in-flow "on this page" list
     right after the intro (`.jump-links`) below the width a true gutter rail can hold, and the
     rail itself (`.page-toc-rail`) past it — never both visible at once. The rail is deliberately
     unlike the shared `.article-toc-shell` frame above: it sits OUTSIDE the reading column via
     `position: fixed`, anchored to the viewport rather than a wider ancestor box, so `.prose`
     never widens to make room for it and the article's own measure is identical whether or not
     the rail is visible (the frame above widens `.prose` instead, which is exactly what read as
     a narrowed, docs-app-framed column on education). */
  .jump-links {
    --flow-space: var(--spacing-s);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--spacing-2xs) var(--spacing-m);
    margin: var(--spacing-m) 0;
    padding: var(--spacing-s) var(--spacing-m);
    background: var(--color-base-200);
    border-radius: var(--radius-box);
  }
  .jump-links-label {
    flex: 0 0 100%;
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .jump-links :global(ul) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs) var(--spacing-m);
  }
  /* site.css's own `.site-main .prose a:not(.asc-card-link)` rule (three classes, unlayered) sets
     every prose link to the primary link color; matching that weight here (the same technique
     `.page-toc-sticky`'s own link rules below use) rather than trusting a plain `.jump-links a` to
     out-specify it. */
  :global(.site-main) .prose .jump-links a {
    color: var(--color-primary);
    text-decoration: none;
  }
  :global(.site-main) .prose .jump-links a:hover {
    text-decoration: underline;
  }

  .page-toc-rail {
    display: none;
  }
  /* 80rem (1280px), not the ~1200px a plain reading column would need: the rail sits OUTSIDE
     `.prose`, so the breakpoint has to clear the reading column's own half-width plus its gutter
     plus the rail's own width with room to spare, not just the column alone. Verified empirically
     (computed `getBoundingClientRect`) to clear the article with a comfortable margin at 1440. */
  @media (min-width: 80rem) {
    .jump-links {
      display: none;
    }
    .page-toc-rail {
      display: block;
      position: fixed;
      top: var(--header-clearance);
      left: calc(50% + (var(--container-measure) / 2) + var(--spacing-m));
      width: 14rem;
      max-height: calc(100vh - var(--header-clearance) - var(--spacing-l));
      overflow-y: auto;
      /* No fill, no border, no radius (a panel-review finding, 2026-07-07): a boxed card in the
         gutter read as a docs-app reference panel, not part of the plain article the rest of the
         page already reads as. The label and link list stand on their own, the same "quiet"
         reading the in-flow `.jump-links` gets below this breakpoint. */
      padding: 0 var(--spacing-m) 0 0;
    }
  }
  :global(.site-main) .prose .page-toc-rail a {
    display: block;
    padding: 0.25rem 0;
    color: var(--color-base-content);
    text-decoration: none;
  }
  :global(.site-main) .prose .page-toc-rail a:hover {
    color: var(--color-primary);
  }
  /* The rail's current-section mark: flag-navy text plus a star-gold underline, the same
     "waypoint" device the header's own active-nav link uses (SiteHeader.svelte), rather than the
     plain primary-color highlight the shared `.page-toc-sticky` frame above uses — gold marks a
     live location, per the club-grounds color story ("marks and waypoints only, never body
     text"). Scoped to the rail alone; the shared frame's own `.toc-active` rule below is
     unchanged. */
  :global(.site-main) .prose .page-toc-rail .toc-active {
    color: var(--color-primary);
    font-weight: 650;
    box-shadow: 0 2px 0 var(--color-star-gold);
  }

  /* The long-form page's one card grid (the Registration Path, education's only remaining card
     use): a per-element wide breakout, the same technique site.css's own `.cairn-place-wide`
     figure role uses, so three content-sized cards read as one row at desktop while the reading
     measure around it stays exactly `container-measure` (rule 1 of the information-presentation
     rebuild: "the column width never changes mid-page," with a per-element exception for a card
     row that needs it). `min(...)` clamps the breakout to the viewport itself below the width
     where there is no room to spare, so it never overflows a narrower viewport; the grid's own
     `repeat(auto-fill, minmax(14rem, 1fr))` (asc-components.css) still governs how many columns
     actually fit at whatever width this resolves to.

     Below the rail's own breakpoint (the media query just past this rule) the breakout is
     unconstrained: the gutter rail is not on screen there (`.jump-links` renders in its place),
     so there is nothing for the row to run into. */
  .long-form-page :global(.asc-cards) {
    width: min(var(--container-measure-wide), 100vw - 3rem);
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }
  /* Past 80rem the fixed gutter rail (`.page-toc-rail` above) is on screen, and the unconstrained
     breakout's centered 58rem width draws past the rail's own left edge at every width checked
     (a panel-review finding, 2026-07-07): both the row and the rail center-align independently,
     the row on the viewport and the rail on `--container-measure`'s own right edge plus its
     gutter, so a fixed 58rem breakout eventually always outruns a 14rem-plus-gutter rail as the
     viewport narrows toward this very breakpoint.

     The row and the rail share one derivation here instead: the row's own right edge is pinned
     to exactly `--container-measure` plus one `--spacing-m` of extra breakout (half of what the
     rail's own `left` formula above reserves as its gutter), which by construction lands exactly
     half a `--spacing-m` inside the rail's left edge at every viewport width past this
     breakpoint, not just the ones spot-checked. The row stays centered on the viewport (as it is
     below this breakpoint) via the same `left: 50%; translateX(-50%)` pair, just narrower; the
     grid's own `repeat(auto-fill, minmax(14rem, 1fr))` still decides column count at whatever
     width this resolves to, three columns where it fits, two where the narrowed measure only
     leaves room for two. */
  @media (min-width: 80rem) {
    .long-form-page :global(.asc-cards) {
      width: min(calc(var(--container-measure) + var(--spacing-m)), 100vw - 3rem);
    }
  }

  /* Strand 3 (the presentation round): the pages concept's title-adjacent hero, adapted from the
     old education page's photo-beside-the-title device. `titleBlock` (h1 and the optional
     subtitle) nests one level deeper here than prose.css's own `.prose > h1` selector expects, so
     the two rules below restate that selector's declarations for this specific nesting rather than
     losing them; every other title-block rule (`.post-date`, `.page-subtitle`) is already its own
     class-scoped rule and needs no restating. */
  .page-title-hero {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-m);
  }
  .page-title-hero-text > h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-step-5);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
  }
  .page-title-hero-text > h1 + * {
    margin-top: var(--spacing-m);
  }
  .page-title-hero-figure {
    margin: 0;
  }
  .page-title-hero-figure img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: var(--radius-box);
  }
  @media (min-width: 48rem) {
    .page-title-hero {
      flex-direction: row;
      /* Was `center`: with a two-line title's ~50-95px against a full aspect-ratio photo running
         200-300px, centering floated the title in the middle of a mostly-empty left column (the
         hero-round pass's finding, 2026-07-07 — "a title floating in a giant area of space next
         to the header image"). Top-aligning anchors the title to the photo's own top edge, the
         plain, common photo-beside-title reading. */
      align-items: flex-start;
    }
    .page-title-hero-text {
      flex: 1 1 auto;
      min-width: 0;
    }
    /* A percentage basis, not a fixed rem, so the split holds steady whether the row measures the
       plain reading column (44rem) or the wider one a long TOC page earns (58rem): the craft
       pass's fix (2026-07-07), replacing a fixed 20rem that read as a small photo pinned to the
       row's right edge on a wide page (education among them) with acres of near-empty title
       column beside it. 44% gives the photo real presence, matching the old education page's own
       photo-beside-the-title device, without letting it dominate a short one- or two-line title. */
    .page-title-hero-figure {
      flex: 0 0 44%;
    }
    /* The compact-banner fix (hero-round pass, 2026-07-07): a fixed height replaces the
       aspect-ratio box past this breakpoint, so the row itself stays tight (band, not tower)
       regardless of the column's own width — the reading-measure cap otherwise let the row grow
       past 300px tall at the wide TOC measure. `object-fit: cover` still crops to fill exactly
       this box, the same as the aspect-ratio version did. */
    .page-title-hero-figure img {
      aspect-ratio: auto;
      height: 17.5rem;
    }
    /* A merged lede (axis A of the 2026-07-08 benchmark-alignment pass, `hero-has-lede`, set only
       when `mergeLedeIntoHero`) makes the text column noticeably taller than the fixed-height photo
       above, since the title-only case that height was tuned for no longer applies once a whole
       paragraph sits under the title. Stretching the row lets the photo grow to match the text
       column's own content height instead, self-balancing for whatever the lede's length actually
       renders to rather than a second hardcoded height guess; `img` fills the now-stretched
       `<figure>` box the same way the fixed-height version filled its own. Scoped to this one
       variant so the title-only pages above keep their tuned compact-banner height unchanged. */
    .page-title-hero.hero-has-lede {
      align-items: stretch;
    }
    .page-title-hero.hero-has-lede .page-title-hero-figure img {
      height: 100%;
      aspect-ratio: auto;
    }
  }

  /* The table of contents disclosure: the same chevron-rotate gesture as the FAQ directive
     (prose.css), re-expressed locally since this is page-owned raw markup, not an engine
     directive's own class. Collapsed by default: a long legal document's TOC can run to dozens
     of entries, and a reader who wants it opts in rather than scrolling past it. */
  .toc {
    --flow-space: var(--spacing-s);
    border-bottom: var(--border) solid var(--color-card-border);
    padding-block: var(--spacing-2xs);
  }
  .toc summary {
    display: flex;
    align-items: center;
    gap: var(--spacing-2xs);
    cursor: pointer;
    font-weight: 650;
    color: var(--color-base-content);
    list-style: none;
  }
  .toc summary::-webkit-details-marker {
    display: none;
  }
  .toc summary::before {
    content: '\25B8';
    display: inline-block;
    transition: transform 0.15s ease;
  }
  .toc[open] summary::before {
    transform: rotate(90deg);
  }
  .toc nav {
    margin-top: var(--spacing-2xs);
  }
  .toc a {
    color: var(--color-primary);
  }
  @media (prefers-reduced-motion: reduce) {
    .toc summary::before {
      transition: none;
    }
  }

  /* Strand 2 (the 2026-07-07 presentation round): the section-panel + sticky-gutter-TOC device
     for a long reference page (education, racing, bylaws, and any other page the density gate
     above fires on), adapted from the old site's own parceled-panel-plus-sticky-TOC pattern
     rather than copied outright. `.content-panel`/`.panel-lede` are injected server-side, straight
     into the rendered HTML string, by toPanel() in the script block above, so Svelte's own
     scoped-CSS mechanism never sees them the way it sees everything else in this file's template:
     a plain scoped selector compiles to (for example) `.content-panel.svelte-xxxx`, which never
     matches an element `{@html}` injected with no such class. Every selector segment that reaches
     into that injected markup below is wrapped in `:global(...)`; the real template elements
     around it (`.article-toc-shell`, `.article-sections`, `.page-toc-sticky`) scope normally. */
  .article-toc-shell {
    --flow-space: var(--spacing-xl);
  }
  .article-sections {
    min-width: 0;
  }
  /* `.prose`'s own max-width (chassis/prose.css) caps the *whole* article at the plain reading
     measure; site.css's exception widens `.site-main` for this template, but the inner `.prose`
     cap would otherwise still pinch the grid below back down to that same narrower width, leaving
     the TOC gutter with nowhere to sit but a lot of empty space past it. Past 1200px, where the
     gutter is actually in play, let the prose box grow to match. */
  @media (min-width: 1200px) {
    .prose:has(> .article-toc-shell) {
      max-width: var(--container-measure-wide);
    }
  }
  .article-sections:has(:global(.content-panel)) {
    background: var(--color-base-200);
    border-radius: var(--radius-box);
    padding: var(--spacing-m);
  }
  .article-sections > :global(* + *) {
    margin-top: var(--spacing-xl);
  }
  .prose :global(.content-panel) {
    /* Redeclared here, the same owl-selector idiom `.toc` uses on itself just above: with no
       redeclaration this custom property inherits `.article-toc-shell`'s own `--spacing-xl`,
       matching the panel-to-panel gutter exactly and reading as one loose, undifferentiated gap
       from a heading straight through to its own lede (the panel-rhythm sweep's finding,
       2026-07-07). Half the gutter, per the site's own "large fixed inter-section rhythm, half
       within sections" spacing rule (docs/2026-07-06-asc-phase-1-design.md), binds a panel's
       heading to its own content while the panel-to-panel gap stays the more decisive break. */
    --flow-space: var(--spacing-m);
    background: var(--color-base-100);
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
    box-shadow: var(--cairn-shadow);
    padding: var(--spacing-m);
  }
  .prose :global(.content-panel > * + *) {
    margin-top: var(--flow-space);
  }
  /* The lede treatment: font-weight alone (not a color or size change), the quieter of the two
     devices the plan offered, so a panel's opening line reads with a touch more presence without
     competing against the h2 immediately above it. */
  .prose :global(.content-panel .panel-lede) {
    font-weight: 450;
  }
  @media (min-width: 48rem) {
    .article-sections:has(:global(.content-panel)) {
      padding: var(--spacing-l);
    }
    .prose :global(.content-panel) {
      padding: var(--spacing-l);
    }
  }

  /* The mobile/tablet collapsible TOC (the pre-existing `.toc` recipe above) and the wide-viewport
     sticky gutter TOC render the same `tocList` snippet twice and toggle by breakpoint, rather
     than mounting and unmounting one or the other: both exist with no JavaScript at all, so a
     no-JS reader on a narrow viewport still gets the disclosure and a no-JS reader past 1200px
     still gets a plain (unhighlighted) sticky list. */
  .page-toc-sticky {
    display: none;
  }
  @media (min-width: 1200px) {
    .article-toc-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 14rem;
      gap: var(--spacing-l);
      align-items: start;
    }
    .mobile-toc {
      display: none;
    }
    .page-toc-sticky {
      display: block;
      position: sticky;
      /* Reuses site.css's own --header-clearance, the sticky header's height plus its padding, so
         a sticky-scrolled TOC clears the header the same way an in-page anchor jump already does. */
      top: var(--header-clearance);
      max-height: calc(100vh - var(--header-clearance) - var(--spacing-l));
      overflow-y: auto;
      background: var(--color-base-100);
      border: var(--border) solid var(--color-card-border);
      border-radius: var(--radius-box);
      padding: var(--spacing-s) var(--spacing-m);
    }
  }
  .page-toc-heading {
    margin: 0 0 var(--spacing-2xs);
    padding-bottom: var(--spacing-2xs);
    border-bottom: var(--border) solid var(--color-card-border);
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  /* site.css's own `.site-main .prose a:not(.asc-card-link)` rule (three classes, unlayered) sets
     every prose link to the primary link color; it out-specifies a plain `.page-toc-sticky nav a`
     (one class), so the quiet default state below needs the same three-class weight to actually
     win, not just declare a different value. `.site-main` belongs to the layout component, not
     this one, so it needs `:global()`; `.prose` is this component's own element and scopes as
     usual. */
  :global(.site-main) .prose .page-toc-sticky nav a {
    display: block;
    padding: 0.25rem 0;
    color: var(--color-base-content);
    text-decoration: none;
  }
  :global(.site-main) .prose .page-toc-sticky nav a:hover {
    color: var(--color-primary);
  }
  /* No transition on the active state: the highlight swap is already instant, so there is nothing
     to gate behind prefers-reduced-motion. */
  :global(.site-main) .prose .page-toc-sticky nav .toc-active {
    color: var(--color-primary);
    font-weight: 650;
  }
</style>
