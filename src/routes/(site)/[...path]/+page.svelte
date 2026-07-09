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

  // The presentation round's "promise hero" (round 3, pass C): a long-form page named here trades
  // the title-adjacent hero for a whole-column composition, eyebrow, an italic display promise as
  // the page's own h1, the document's lede, a full-width photo, and a fact strip, all read top to
  // bottom in the plain reading column (the photo is the one element that breaks out wider; see
  // `.promise-hero-photo` below). The eyebrow is always the page's own title, not configured here.
  // A long-form page with no entry keeps the older title-adjacent hero (`isPageHero`) unchanged; a
  // page outside `LONG_FORM_PAGE_SLUGS` never reads this map at all.
  const LONG_FORM_HERO: Record<string, { promise: string; facts: string[] }> = {
    education: {
      promise: 'Come learn to sail on an Alaska lake.',
      facts: ['4 days', 'Adults, teens & kids 8–12', 'Big Lake', 'Summer sessions'],
    },
  };

  // A long-form page's own group structure (the 2026-07-08 benchmark-alignment pass, axis B): a
  // hairline-and-label divider announces the start of each named part after the first, so the
  // page's multi-part shape reads at a glance across a long scroll rather than as one
  // undifferentiated stack of h2 sections. Keyed by slug; a long-form page with no entry here
  // renders with no dividers at all. A heading id not found in the document contributes no split
  // (see splitAtHeadingIds below), so a content edit that renames or removes a group heading
  // degrades to fewer, larger groups rather than throwing or dropping content.
  const GROUP_HEADINGS: Record<string, { headingId: string; label: string }[]> = {
    education: [
      { headingId: 'how-to-register--pricing', label: 'Registration & logistics' },
      { headingId: 'swim-test-capsize-drill-and-life-jackets', label: 'Preparing for class' },
      { headingId: 'cancellation-and-refund-policy', label: 'Policies & questions' },
    ],
  };

  // The round-2 registration band (owner-ratified amendment, docs/2026-07-06-asc-phase-1-design.md:
  // "a long-form page may use ONE tinted band around its primary action group... education's
  // registration + CTA moment is the first"): the h2 named here, through the next h2, gets wrapped
  // in the page's one deliberate full-bleed band (wrapSectionAsBand, below). Keyed by slug for the
  // same reason GROUP_HEADINGS is: a future long-form page can opt in with one line, and a missing
  // id degrades to no band rather than a broken wrap.
  const REGISTRATION_BAND_HEADING_ID: Record<string, string> = {
    education: 'how-to-register--pricing',
  };

  // Round 3's closing card (owner note 9): the h2 named here, through the end of its own group
  // segment, gets wrapped in the page's one warm close (wrapClosingSection, below). Keyed by slug
  // for the same reason REGISTRATION_BAND_HEADING_ID is: a missing id degrades to no wrap.
  const CLOSING_SECTION_HEADING_ID: Record<string, string> = {
    education: 'questions',
  };

  // The round-2 program-section identity fix (owner's live read, 2026-07-08: "Introduction to
  // Dinghy Sailing seems to roll straight into Fleet Tune-Up Weekend"): each heading named here,
  // through the next heading of the SAME OR HIGHER level, gets wrapped in `.program-section`
  // (wrapHeadingSection, below), which gives it its own photo-led identity and a decisively bigger
  // gap before the next one than the page's ordinary inter-heading rhythm. `level` is the wrapped
  // heading's own level (2 or 3): Adult/Youth are h3 siblings inside "Introduction to Dinghy
  // Sailing," so their own boundary is the next h2-or-h3; Fleet Tune-Up is itself an h2, so its
  // boundary is the next h2 only (its own "What to Expect"/"Who Can Participate" h3s stay inside
  // its wrap, correctly, since they are its own subsections, not siblings).
  const PROGRAM_SECTION_HEADINGS: Record<string, { headingId: string; level: 2 | 3 }[]> = {
    education: [
      { headingId: 'adult--teen-track-ages-13', level: 3 },
      { headingId: 'youth-track-ages-8-12', level: 3 },
      { headingId: 'fleet-tune-up-weekend', level: 2 },
    ],
  };

  const longFormSlug = $derived(
    data.entry.concept === 'pages' && LONG_FORM_PAGE_SLUGS.has(data.entry.slug) ? data.entry.slug : undefined,
  );

  // The promise hero (round 3, pass C): set only for a long-form page with its own LONG_FORM_HERO
  // entry. A long-form page with no entry falls through to the older title-adjacent hero below.
  const longFormHero = $derived(longFormSlug ? LONG_FORM_HERO[longFormSlug] : undefined);

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

  /** Wraps one heading's own section (from its heading through the index `endIndex` computes) with
   *  `wrap`, which receives the section's own raw HTML and returns the full replacement markup
   *  (its own wrapper element(s) around that HTML). A `headingId` not found in `html` leaves it
   *  untouched, degrading to no wrap rather than throwing (the same missing-id tolerance
   *  splitAtHeadingIds already carries). Shared by wrapHeadingSection (program identity,
   *  level-aware, one wrapper) and wrapSectionAsBand (the registration band, always h2-to-h2, two
   *  nested wrappers) below. */
  function wrapRange(html: string, headingId: string, endIndex: (afterStart: number) => number, wrap: (section: string) => string): string {
    const match = new RegExp(`<h[23] id="${headingId}"[^>]*>`).exec(html);
    if (!match) return html;
    const start = match.index;
    const end = endIndex(start + match[0].length);
    const before = html.slice(0, start);
    const section = html.slice(start, end);
    const after = html.slice(end);
    return `${before}${wrap(section)}${after}`;
  }

  /** Finds the index of the next heading whose level is <= `level`, starting the scan at
   *  `afterStart`, or `html.length` when none follows (the section then runs to the document's own
   *  end). Shared end-boundary logic for wrapHeadingSection (level-gated) and wrapSectionAsBand
   *  (always h2-to-h2, i.e. level 2). */
  function nextHeadingAtOrAbove(html: string, afterStart: number, level: 2 | 3): number {
    const rest = html.slice(afterStart);
    const next = /<h([23]) id="[^"]+"[^>]*>/.exec(rest);
    return next && Number(next[1]) <= level ? afterStart + (next.index ?? 0) : html.length;
  }

  /** Wraps one program section (Adult & Teen Track, Youth Track, Fleet Tune-Up Weekend): its own
   *  heading through the next heading whose level is <= `level` (a same-or-higher-level heading
   *  ends it; a deeper subheading, like Fleet Tune-Up's own h3s, stays inside), in a single
   *  `.program-section` wrapper (its own photo-led identity and inter-section rhythm; see the
   *  style block). */
  function wrapHeadingSection(html: string, headingId: string, level: 2 | 3): string {
    return wrapRange(
      html,
      headingId,
      (afterStart) => nextHeadingAtOrAbove(html, afterStart, level),
      (section) => `<div class="program-section not-prose">${section}</div>`,
    );
  }

  /** Wraps one h2 section (from its own heading through, but excluding, the next h2) in the page's
   *  one deliberate full-bleed band (the design doc's 2026-07-08 amendment: "a long-form page may
   *  use ONE tinted band around its primary action group"). Two nested wrappers, matching the
   *  site's own established full-bleed-plus-recentered-content shape (`.cairn-place-full`'s figure
   *  role is the single-element version of the same idea; a whole SECTION needs an inner element to
   *  hold the content measure separately from the outer element that stretches the ground):
   *  `.registration-band` bleeds to the viewport and carries the sage tint, `.registration-band-
   *  inner` re-centers the section's own content back to `--container-measure`, so only the ground
   *  stretches full width, never the text or the cards (the amendment's own rule). Runs AFTER
   *  wrapHeadingSection within the same group segment (wrapLongFormSegment, below) so the band's
   *  own h2 tag (still a plain top-level match at this point) is found correctly regardless of any
   *  earlier program-section wraps in that segment, which all close before this heading starts. */
  function wrapSectionAsBand(html: string, headingId: string): string {
    return wrapRange(
      html,
      headingId,
      (afterStart) => nextHeadingAtOrAbove(html, afterStart, 2),
      (section) => `<div class="registration-band not-prose"><div class="registration-band-inner">${section}</div></div>`,
    );
  }

  /** Wraps one heading's own section, from its heading through the end of `html` (the whole rest
   *  of its group segment), in the page's one warm close (round 3, owner note 9: "card + heading +
   *  one sentence, nothing louder"). Always runs to the segment's own end rather than the next
   *  heading, since the Questions section is the last one in its group. */
  function wrapClosingSection(html: string, headingId: string): string {
    return wrapRange(
      html,
      headingId,
      () => html.length,
      (section) => `<div class="questions-close not-prose">${section}</div>`,
    );
  }

  /** Applies one long-form page's own wraps, program sections, then the registration band, then
   *  the closing card, to a single already-split group segment's own html (used by groupSegments
   *  below). wrapRange's missing-id tolerance (its own doc comment above) makes running every wrap
   *  against every segment safe: a heading id absent from a given segment simply no-ops there, so
   *  only the segment that actually contains a wrap's own heading is ever changed. */
  function wrapLongFormSegment(html: string, slug: string): string {
    let wrapped = html;
    for (const { headingId, level } of PROGRAM_SECTION_HEADINGS[slug] ?? []) {
      wrapped = wrapHeadingSection(wrapped, headingId, level);
    }
    const bandHeadingId = REGISTRATION_BAND_HEADING_ID[slug];
    if (bandHeadingId) wrapped = wrapSectionAsBand(wrapped, bandHeadingId);
    const closingHeadingId = CLOSING_SECTION_HEADING_ID[slug];
    if (closingHeadingId) wrapped = wrapClosingSection(wrapped, closingHeadingId);
    return wrapped;
  }

  // The full long-form body pipeline, in order: split the PLAIN, unwrapped body into its named
  // groups first (splitAtHeadingIds), then wrap each group's own segment independently
  // (wrapLongFormSegment: program sections, the registration band, then the closing card).
  // Splitting before
  // wrapping, rather than after, is what keeps every segment's own html balanced for its own
  // {@html} below: a wrap applied to the whole body before the split could straddle a group
  // boundary (the registration band's own heading is also a group boundary here) and leave one
  // segment with an unclosed wrapper div and the next with its stray closer, which is exactly the
  // shape that let the browser's own error-correcting HTML parser silently duplicate the section
  // on hydration. Splitting first guarantees every cut lands on a plain top-level heading tag,
  // never on wrapper markup, since the wraps have not been applied yet at split time.
  const groupSegments = $derived(
    longFormSlug
      ? splitAtHeadingIds(longFormBody, GROUP_HEADINGS[longFormSlug] ?? []).map((segment) => ({
          ...segment,
          html: wrapLongFormSegment(segment.html, longFormSlug),
        }))
      : [],
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
  {#if longFormHero}
    <!-- The promise hero (round 3, pass C, the approved candidate): eyebrow, the display promise
         as the page's own h1, the document's lede, a full-width photo, and a fact strip, top to
         bottom in the plain reading column. The eyebrow is a <p>, never a heading, so the promise
         h1 stays the document's only h1. -->
    <div class="promise-hero not-prose">
      <p class="promise-hero-eyebrow">{data.entry.title}</p>
      <h1 class="promise-hero-title">{longFormHero.promise}</h1>
      {#if heroLede}
        <div class="promise-hero-support">{@html heroLede}</div>
      {/if}
      {#if data.heroImage}
        <figure class="promise-hero-photo">
          <img src={data.heroImage.url} alt={data.heroImage.alt} />
        </figure>
      {/if}
      <!-- Each fact carries its own leading separator dot as a CSS ::before (below), rather than a
           sibling dot element between facts: a dot that is its OWN flex item can be stranded alone
           at the end of a wrapped row, which is exactly the "balanced rows" wrap this page's own
           reading measure (narrower here than the standalone reference render, which carried no
           site chrome padding) needs at ordinary desktop widths, not just 390px. No whitespace
           between the tags below either: a flex container turns even a single collapsed space
           between inline children into its own anonymous flex item, widening the row for no
           visible reason. -->
      <p class="promise-hero-facts">
        {#each longFormHero.facts as fact (fact)}<span class="promise-hero-fact">{fact}</span>{/each}
      </p>
    </div>
  {:else if isPageHero}
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
    <!-- Round 2 (owner's live read, 2026-07-08): "the expanded nine-item TOC eats a viewport before
         content" at narrow widths. A <details> collapsed by default (the same chevron-disclosure
         gesture the boxed-panel template's own `.toc` already uses below) replaces the always-open
         flex row; the rail past 1280px is untouched (it was never the complaint). -->
    <details class="jump-links not-prose">
      <summary class="jump-links-label">On this page</summary>
      <nav aria-label="Jump to section">
        {@render tocList(jumpLinks, null)}
      </nav>
    </details>
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
  /* Round 3, owner note 8: the divider steps up from a quiet caption to a real hand-off, a
     decisively bigger gap before it (2xl scaled up further, rather than 2xl itself) and a label
     that reads as page ink, not muted furniture, so the multi-part shape announces itself rather
     than needing a close look to notice. */
  .group-divider {
    --flow-space: calc(var(--spacing-2xl) * 1.33);
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
    font-size: var(--text-step-0);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-base-content);
  }

  /* The long-form site TOC standard (Geoff, 2026-07-07): a compact in-flow "on this page" list
     right after the intro (`.jump-links`) below the width a true gutter rail can hold, and the
     rail itself (`.page-toc-rail`) past it — never both visible at once. The rail is deliberately
     unlike the shared `.article-toc-shell` frame above: it sits OUTSIDE the reading column via
     `position: fixed`, anchored to the viewport rather than a wider ancestor box, so `.prose`
     never widens to make room for it and the article's own measure is identical whether or not
     the rail is visible (the frame above widens `.prose` instead, which is exactly what read as
     a narrowed, docs-app-framed column on education). */
  /* Round 2, item 2 (owner's live read: "the TOC is oversized," "the expanded nine-item TOC eats a
     viewport before content"): a collapsed-by-default disclosure, the same chevron gesture `.toc`
     below already uses, instead of the always-open flex row round 1 shipped. */
  .jump-links {
    --flow-space: var(--spacing-s);
    margin: var(--spacing-m) 0;
    padding: var(--spacing-s) var(--spacing-m);
    background: var(--color-base-200);
    border-radius: var(--radius-box);
  }
  .jump-links-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2xs);
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
    list-style: none;
  }
  .jump-links-label::-webkit-details-marker {
    display: none;
  }
  .jump-links-label::before {
    content: '\25B8';
    display: inline-block;
    transition: transform 0.15s ease;
  }
  .jump-links[open] .jump-links-label::before {
    transform: rotate(90deg);
  }
  .jump-links nav {
    margin-top: var(--spacing-2xs);
  }
  .jump-links :global(ul) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs) var(--spacing-m);
  }
  @media (prefers-reduced-motion: reduce) {
    .jump-links-label::before {
      transition: none;
    }
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
      /* Round 2's own paint-order bug, caught only by a render (a getBoundingClientRect probe said
         "visible and correctly positioned," the screenshot showed nothing): `.registration-band`'s
         `transform` (needed for its own full-bleed centering trick) makes it establish a stacking
         context, and at tied `z-index: auto`, same-context siblings paint in DOM order, not by
         `position` value — the band sits LATER in the document than this rail, so its own solid
         sage background silently painted over the earlier fixed-position rail. A plain z-index
         lifts the rail out of that tie; it needs no z-index of its own on `.registration-band`
         since z-index only matters relative to siblings sharing ITS parent stacking context, and
         this rail already isn't one of them. */
      z-index: 1;
    }
  }
  /* Round 2, item 2 (owner's live read: "the TOC is oversized"): dropped from the ambient body
     size to the quiet register (`--text-step--2`, one step below every other quiet furniture on
     this page, e.g. `.season-date`'s own `--text-step--2`) and from full ink to `--color-muted`,
     so the rail reads as wayfinding beside the article, never a peer of it; the active item's own
     navy-plus-gold-underline accent (below, unchanged) is what still draws the eye when it needs
     to. */
  :global(.site-main) .prose .page-toc-rail a {
    display: block;
    padding: 0.2rem 0;
    font-size: var(--text-step--2);
    line-height: var(--leading-snug);
    color: var(--color-muted);
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

  /* The long-form page's own wide-breakout device (the Registration Path card row, and, since
     round 3, the promise hero's own photo): a per-element wide breakout, the same technique
     site.css's own `.cairn-place-wide` figure role uses, so an element that needs more than
     `container-measure` reads as one wide band while the reading measure around it stays exactly
     `container-measure` (rule 1 of the information-presentation rebuild: "the column width never
     changes mid-page," with a per-element exception for the rare element that needs it). `min(...)`
     clamps the breakout to the viewport itself below the width where there is no room to spare, so
     it never overflows a narrower viewport. Both elements share this one clamp rather than each
     duplicating it, so the >=80rem rail-clamp media query right below stays a single source of
     truth for both.

     Below the rail's own breakpoint (the media query just past this rule) the breakout is
     unconstrained: the gutter rail is not on screen there (`.jump-links` renders in its place),
     so there is nothing for the row to run into. */
  .long-form-page :global(.asc-cards),
  .long-form-page .promise-hero-photo,
  .long-form-page .promise-hero-facts {
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
    .long-form-page :global(.asc-cards),
    .long-form-page .promise-hero-photo,
    .long-form-page .promise-hero-facts {
      width: min(calc(var(--container-measure) + var(--spacing-m)), 100vw - 3rem);
    }
  }

  /* Round 2, item 3 (owner-ratified amendment, docs/2026-07-06-asc-phase-1-design.md, 2026-07-08:
     "a long-form page may use ONE tinted band around its primary action group... education's
     registration + CTA moment is the first"): the same full-bleed trick site.css's own
     `.cairn-place-full` figure role uses (`width:100vw; position:relative; left:50%;
     transform:translateX(-50%)`), applied to `.registration-band` (the wrapper wrapSectionAsBand
     injects around "How to Register & Pricing" through "Ready to Join?") rather than touching that
     shared file. `.registration-band-inner` re-centers the section's own content back to the plain
     reading measure, so only the GROUND stretches full width (the amendment's own "content never
     exceeds the wide breakout" rule right above it, never the text or the cards). */
  .prose :global(.registration-band) {
    width: 100vw;
    position: relative;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-base-200);
    padding-block: var(--spacing-xl);
  }
  .prose :global(.registration-band-inner) {
    max-width: var(--container-measure);
    margin-inline: auto;
    padding-inline: var(--spacing-m);
  }
  /* The wrapper adds a nesting level `.prose > * + *`'s owl selector no longer reaches (the
     design-review-round2 pattern, `.pitch-band`'s own precedent): restated one level deeper so
     headings/paragraphs/cards inside the band keep the SAME flow rhythm they'd carry as plain
     `.prose` children, and the heading-tight-to-its-own-body override right after it wins back the
     specificity tie the general restatement would otherwise cost it (prose.css's own `.prose h2 +
     *` pattern, one level deeper). */
  .prose :global(.registration-band-inner > * + *) {
    margin-top: var(--flow-space);
  }
  .prose :global(.registration-band-inner > h2 + *),
  .prose :global(.registration-band-inner > h3 + *) {
    margin-top: var(--spacing-xs);
  }
  /* The band's own cards and table read fine directly on the sage tint with no extra treatment
     (home's own Fleet band, a plain list on the same tint, is the precedent): the pricing table's
     white row ground and each `.asc-card`'s own `--color-base-100` both already clear the tint. The
     registration-path row below (Your Registration Path, item 6) is the one card grid living
     inside the band; it drops the page's usual wide breakout while here (the band's own tint
     already gives the row presence, so breaking out past the band's own measure would compete with
     it rather than add to it) and restyles from a 3-up grid to a numbered stack — see the next rule
     block for why (the owner's live read: 3 different-height boxes read as "a faceplant" and
     crowded the rail). The `article.prose` prefix (beyond `.registration-band-inner` alone) is the
     same defensive specificity bump the Questions-card and program-photo rules below use, to beat
     asc-components.css's own tied specificity outright regardless of build-time source order. */
  article.prose :global(.registration-band-inner .asc-cards) {
    width: 100%;
    position: static;
    left: auto;
    transform: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-m);
    counter-reset: registration-path;
  }
  /* The numbered-path badge (owner's live read, 2026-07-08: "consider whether three slimmer
     stacked rows... reads better" than three columns; it IS a sequence of alternative paths, so
     rows plus a numeral read that shape at a glance). A CSS counter, not a markup change: the three
     `:::card` entries stay exactly the semantic markup they already were, this only re-skins them.
     Flag navy for the badge fill is the color story's own "structure" use of navy (not just links),
     the same license the header's brand mark already spends. */
  article.prose :global(.registration-band-inner .asc-card) {
    counter-increment: registration-path;
    position: relative;
    padding-left: calc(var(--spacing-m) + 2.5rem);
  }
  article.prose :global(.registration-band-inner .asc-card)::before {
    content: counter(registration-path);
    position: absolute;
    left: var(--spacing-m);
    /* Round 3 verification fix: the card's own real padding-top token (`.asc-card`'s
       `padding: var(--spacing-s) var(--spacing-m)`, asc-components.css), not `--spacing-m`, which
       overshot the badge past the card's own first line of text by ~7.5px. */
    top: var(--spacing-s);
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    background: var(--color-primary);
    color: white;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: var(--text-step-0);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Round 3, owner note 6: "What Membership Includes" reuses home's own facilities checkmark
     device (`.amenity-list`/`.amenity-item`, src/routes/(site)/+page.svelte), the family's one
     "included" mark, rather than inventing a second one: the same two-segment-border checkmark
     geometry (7x11px, 40deg, muted border color) and the same `1lh`-based vertical centering math.
     What differs is the context: these are real benefits inside the band, not a quieter outro
     list, so the ink stays full body ink with no muted mix, and the layout is a two-column grid
     (not home's CSS multi-column) at the same 768px/desktop threshold this page's own
     program-section photos use.

     The LAYOUT MECHANISM differs from home's own recipe, not just its numbers: home's amenity
     items are flat text with no nested inline markup, so `display: flex` on the `<li>` wraps the
     text as a single flex item next to the `::before` checkmark. This list's items carry a
     markdown-rendered bold lead followed by plain description text (`<strong>Use of club
     boats</strong> after qualification: ...`), two separate inline-level children; under flex,
     EACH becomes its own anonymous flex item, so the bold lead and the description each wrap
     independently in their own shrunk column instead of flowing as one sentence (caught by a
     render, not evident from the CSS alone). The hanging-indent technique this file's own
     `.learn-cluster li` already uses just above solves it instead: `position: absolute` takes the
     checkmark out of the text's own flow entirely, so the `<strong>` and the text after it wrap
     together as ordinary inline content within one `padding-left`-reserved margin.

     `.membership-benefits` is the plain wrapper `not-prose` div the content markdown puts around
     the list (the `.learn-cluster`/`.course-schedule` pattern above: a class-scoped div wrapping
     raw markdown, so the grid and marker rules below target the rendered `ul`/`li` one level
     inside it, never the wrapper itself). `article.prose.long-form-page` is the same defensive
     specificity bump the Questions-card and program-photo rules use, to beat asc-components.css
     outright regardless of source order. */
  article.prose.long-form-page :global(.membership-benefits ul) {
    margin: 0;
    margin-top: var(--spacing-xs);
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0 var(--spacing-l);
  }
  @media (min-width: 48rem) {
    article.prose.long-form-page :global(.membership-benefits ul) {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  article.prose.long-form-page :global(.membership-benefits li) {
    position: relative;
    padding-left: 1.5rem;
    padding-block: 0.2rem;
    break-inside: avoid;
    font-size: var(--text-step-0);
  }
  article.prose.long-form-page :global(.membership-benefits li)::before {
    content: '';
    position: absolute;
    left: 0;
    top: calc((1lh - 11px) / 2);
    width: 7px;
    height: 11px;
    border-right: 2px solid var(--color-muted);
    border-bottom: 2px solid var(--color-muted);
    transform: rotate(40deg);
  }

  /* Item 6, the Questions close (conductor's decided direction, 2026-07-08): the single "Get in
     touch" card widens to the full content measure instead of `asc-components.css`'s own
     centered-narrow single-card treatment (`.asc-cards:has(> :only-child)`, tuned for a small
     closing nudge elsewhere on the site, not this page's own full-width prose-with-inline-action
     close). Scoped to `.long-form-page` so the site-wide single-card default is untouched
     everywhere else; `article.prose.long-form-page` (rather than the plain `.long-form-page
     :global(...)` prefix the breakout rule above uses) adds one more type selector specifically to
     beat asc-components.css's own tied specificity outright, regardless of build-time source
     order, since this rule has no in-band position to rely on for a same-file tie-break. */
  article.prose.long-form-page :global(.asc-cards:has(> :only-child)) {
    grid-template-columns: minmax(0, 1fr);
    justify-content: stretch;
  }

  /* Round 3, owner note 9: the page's own warm close (wrapClosingSection above wraps the
     "Questions?" heading through the end of its own group segment in this card), a bordered card
     rather than plain prose trailing off the document's end. Full width of the reading measure, no
     breakout, matching "card + heading + one sentence, nothing louder." Two levels of restatement,
     the same shape `.registration-band-inner` uses above: the owl selector reads back inside the
     card's own nesting (never a direct `.prose` child, so prose.css's own owl selector doesn't
     reach it), and the heading-tight override wins the specificity tie back for the sentence right
     under the h2. Neither restatement sets its own `--flow-space`, so both read the ambient
     default (tokens.css's `--flow-space: 1.35em`), the plain prose rhythm, never a section-sized
     gap. The h2 is the card's own first child (wrapClosingSection starts its wrap at the heading),
     so the owl selector's `* + *` never matches it; the explicit `margin-top: 0` below is the
     card's own guarantee against Tailwind's preflight to a future style change, not corrective. */
  .prose :global(.questions-close) {
    width: 100%;
    background: var(--color-base-100);
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
    padding: var(--spacing-l);
  }
  .prose :global(.questions-close > * + *) {
    margin-top: var(--flow-space);
  }
  .prose :global(.questions-close > h2 + *) {
    margin-top: var(--spacing-xs);
  }
  .prose :global(.questions-close > h2) {
    margin-top: 0;
  }

  /* Round 2, owner note 2 (live read, 2026-07-08: "Introduction to Dinghy Sailing seems to roll
     straight into Fleet Tune-Up Weekend"): each program section (Adult & Teen Track, Youth Track,
     Fleet Tune-Up Weekend, wrapped server-side by wrapHeadingSection above) gets a decisively
     bigger gap BEFORE it than the page's ordinary inter-heading rhythm, so the next program reads
     as a fresh start on scroll alone, without needing to read the heading. `--flow-space` on the
     wrapper itself is what the PARENT's owl selector (`.prose > * + *`) reads for the section's own
     margin-top, the boundary gap this note is about.

     Round 3, owner note 8 ("large gaps between some paragraphs"): custom properties inherit, so
     that same 2xl value was also what the CHILDREN'S owl selector below picked up, giving every
     ordinary paragraph inside a program section a section-sized gap instead of the plain prose
     rhythm. The fix restates prose.css's own un-overridden default (tokens.css's `--flow-space:
     1.35em` at `:root`) as a literal on the children rule, rather than reading the custom property
     a second time, which would keep resolving to the wrapper's own overridden value. */
  :global(.program-section) {
    --flow-space: var(--spacing-2xl);
  }
  .prose :global(.program-section > * + *) {
    margin-top: 1.35em;
  }
  .prose :global(.program-section > h2 + *),
  .prose :global(.program-section > h3 + *) {
    margin-top: var(--spacing-xs);
  }
  /* The photo-led identity (owner note 2: "photo + h2 + warm first sentence as a unit"; item 7:
     "a consistent, slightly stronger presence"). Each of the three program photos is already close
     to 3:2 natively (verified render-first against the actual R2 bytes, not assumed from the
     source's own reported dimensions): a fixed 3:2 frame replaces site.css's default
     natural-height-under-a-32rem-cap sizing, so the three read as one matched set rather than three
     different heights, still at the page's own full content-column width (no breakout). Scoped the
     same defensive way as the Questions-card rule above (an extra `article` type selector) to beat
     site.css's own tied specificity outright. */
  article.prose.long-form-page :global(.program-section figure img) {
    aspect-ratio: 3 / 2;
    height: auto;
    max-height: none;
    object-fit: cover;
  }

  /* Item 4: "A Typical Course Weekend" trades its plain table for the Season calendar's own
     grammar (SeasonList.svelte), adapted to this page's shape: a day label (small-caps, its own
     hairline, the Season month-label recipe) instead of a month; time in the quiet register instead
     of a compact date; the activity itself leading, full ink, instead of an event name; and a
     filled-vs-open dot in place of Season's four hue-coded dots, since "on the water" and
     "classroom & rigging" is a different axis from Season's class/social/business/racing taxonomy
     and the ratified color story's dots are that taxonomy's alone (gold "marks classes and clinics
     only," blue is "exclusively the link affordance"). Filled vs. a hollow ring spends no new hue
     at all, in the same muted ink as the time column; the sr-only label beside each dot (in the
     markup) is the real channel, same as Season's own per-row sr-only text. */
  :global(.course-schedule) {
    --flow-space: var(--spacing-l);
  }
  /* Mobile-first: the fixed 4-column grid (day/time/dot/focus) needs more room than a 390px
     viewport has (a first render caught this outright: the focus column collapsed to one word per
     line). Below 30rem, day/time/dot share a flex row and the focus text wraps onto its own line
     below (`flex-basis: 100%` is the standard flexbox "start a new row" trick, no grid-template-
     areas needed); the 4-column grid only applies past that width, where there is room for it. */
  .prose :global(.course-schedule .schedule-row) {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--spacing-s);
    row-gap: 0.3rem;
    padding-block: var(--spacing-xs);
    border-bottom: var(--border) solid var(--color-card-border);
  }
  .prose :global(.course-schedule .schedule-focus) {
    flex: 1 1 100%;
  }
  @media (min-width: 30rem) {
    .prose :global(.course-schedule .schedule-row) {
      display: grid;
      grid-template-columns: 6.75rem 8.5rem 0.9rem 1fr;
    }
  }
  .prose :global(.course-schedule .schedule-row:first-child) {
    padding-top: 0;
  }
  .prose :global(.course-schedule .schedule-row:last-child) {
    border-bottom: none;
    padding-bottom: 0;
  }
  .prose :global(.course-schedule .schedule-day) {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-base-content);
    border-bottom: 1px solid var(--color-card-border);
    padding-bottom: 0.2rem;
    align-self: start;
  }
  .prose :global(.course-schedule .schedule-time) {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  .prose :global(.course-schedule .schedule-dot-slot) {
    display: inline-flex;
    align-items: center;
  }
  .prose :global(.course-schedule .schedule-focus) {
    font-size: var(--text-step-0);
    color: var(--color-base-content);
  }
  .prose :global(.course-schedule .schedule-dot) {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }
  .prose :global(.course-schedule .schedule-dot-water) {
    background: var(--color-muted);
  }
  .prose :global(.course-schedule .schedule-dot-ashore) {
    background: transparent;
    border: 1.5px solid var(--color-muted);
    width: 5px;
    height: 5px;
  }
  :global(.schedule-legend) {
    margin-top: var(--spacing-s);
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs) var(--spacing-m);
    font-size: var(--text-step--2);
    color: var(--color-muted);
  }
  :global(.schedule-legend-item) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  :global(.schedule-legend .schedule-dot) {
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }
  :global(.schedule-legend .schedule-dot-water) {
    background: var(--color-muted);
  }
  :global(.schedule-legend .schedule-dot-ashore) {
    background: transparent;
    border: 1.5px solid var(--color-muted);
    width: 5px;
    height: 5px;
  }

  /* Owner note 5 (live read, 2026-07-08): "What You'll Learn" reorganizes from a flat ~8-bullet
     list into 3 honest clusters (Boat handling / Seamanship & safety / Rules of the water, derived
     from the original items, nothing invented), each under a small-caps mini-label, reusing home's
     own facilities-list idiom (`.amenity-list`/`.season-month-label`): quiet muted ink, a dash
     marker, a hairline under each cluster's own label. Two columns at desktop, one at 390 (the
     family's own 40rem two-column threshold, matching `.amenity-list`'s). */
  :global(.learn-clusters) {
    --flow-space: var(--spacing-m);
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--spacing-m) var(--spacing-l);
  }
  @media (min-width: 40rem) {
    :global(.learn-clusters) {
      grid-template-columns: repeat(2, 1fr);
    }
    :global(.learn-cluster-wide) {
      grid-column: 1 / -1;
    }
  }
  :global(.learn-cluster-label) {
    margin: 0 0 var(--spacing-2xs);
    padding-bottom: var(--spacing-3xs);
    border-bottom: 1px solid var(--color-card-border);
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-base-content);
  }
  .prose :global(.learn-cluster ul) {
    margin: 0;
    padding: 0;
    list-style: none;
    color: color-mix(in oklab, var(--color-muted) 67%, var(--color-base-content) 33%);
    font-size: var(--text-step--1);
  }
  .prose :global(.learn-cluster li) {
    position: relative;
    padding-block: 0.2rem;
    padding-left: 1em;
  }
  .prose :global(.learn-cluster li)::before {
    content: '\2013';
    position: absolute;
    left: 0;
  }

  /* The promise hero (round 3, pass C, the approved candidate): a whole-column composition that
     replaces the title-adjacent hero for a long-form page with its own LONG_FORM_HERO entry. Every
     child nests one level inside `.promise-hero`, never a direct child of `.prose`, so prose.css's
     own `.prose > h1` selector never reaches the promise h1 and this block owns its typography
     outright with no specificity fight to win back. */
  .promise-hero-eyebrow {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-eyebrow);
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  .promise-hero-title {
    margin: var(--spacing-2xs) 0 0;
    font-family: var(--font-display);
    font-weight: 650;
    font-style: italic;
    font-size: clamp(2.4rem, 2.1rem + 1.6vw, 3.4rem);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-tight);
    color: var(--color-base-content);
    text-wrap: balance;
  }
  /* max-width matches the approved candidate render: at the promise hero's own larger lede size,
     the plain `--container-measure` column runs a touch wide for comfortable line length. */
  .promise-hero-support :global(p) {
    margin: 0;
    max-width: 38rem;
    font-size: var(--text-step-1);
    line-height: var(--leading-snug);
  }
  .promise-hero-support {
    margin-top: var(--spacing-m);
  }
  /* The lede's own trailing action link ("See class dates →"), always the last node in its
     paragraph: `display: block` alone drops it to its own line below the lede text, with no markup
     change needed. Color, underline, and the focus-visible ring already come from site.css's own
     `.site-main .prose a` rule and prose.css's `a:focus-visible` rule (both apply to this injected
     `{@html}` markup unscoped), so only the weight this action earns beyond a plain inline link is
     restated here. */
  .promise-hero-support :global(a:last-child) {
    display: block;
    margin-top: var(--spacing-s);
    font-family: var(--font-display);
    font-weight: 650;
    font-size: var(--text-step-0);
  }
  .promise-hero-photo {
    margin: var(--spacing-l) 0 0;
  }
  .promise-hero-photo img {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 2;
    object-fit: cover;
    border-radius: var(--radius-box);
  }
  .promise-hero-facts {
    margin: var(--spacing-s) 0 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-s);
  }
  .promise-hero-fact {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-s);
    font-family: var(--font-display);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-eyebrow);
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  /* The separator dot lives on the item it introduces, not as its own sibling flex item: a dot
     glued to its own fact never strands alone on a wrapped row. */
  .promise-hero-fact:not(:first-child)::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-star-gold-dot);
    flex-shrink: 0;
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

  /* Round 2, item 1 (owner: the opening "should feel more like an intro than just the first
     paragraph of a document"): the hero lede reads at the site's own designated lede register,
     `.prose .lead` (prose.css: "step-1, slightly recessed ink, a touch more air above"), restated
     here since the lede is injected via `{@html}` one level inside `.hero-lede`, a plain wrapper
     div `.prose .lead`'s own selector never reaches. Not home's own hero-lede treatment (plain
     `text-step-0`): home's hero has no competing detail paragraph below it, education's does (the
     intro's remaining detail moves to ordinary body prose right under the hero), so the LEDE
     itself needs to read a step above that body prose to still feel like an opening line, not
     merely the document's first sentence. */
  .hero-lede :global(p) {
    margin: 0;
    font-size: var(--text-step-1);
    line-height: var(--leading-snug);
    color: color-mix(in oklab, var(--color-base-content) 86%, transparent);
  }
  /* The lede's own trailing action link ("See class dates →"): plain prose-link weight already
     carries it (`.prose a`, prose.css), this only widens its tap target the family's other inline
     arrow-links already get (`.arrow-link`, home's own convention) without pulling in that whole
     class's unrelated underline-opacity rule. */
  .hero-lede :global(a) {
    padding-block: 0.2rem;
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
