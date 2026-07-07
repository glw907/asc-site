<!-- @component
ASC's home page (Task 3, live-data-wired in Task 4): the north star made real, section for
section (docs/superpowers/specs/assets/2026-07-06-asc-home-northstar.html in the cairn-cms repo,
the build's design contract). A1's quieting recipe governs every section here: bands mark
sections (the sage News band, the navy-deep closing band), cards mark objects (the news grid
only), and the notification is an unboxed slim accent strip rather than a card. The Season band's
gold dot is the C7 recipe (a class or clinic, never spending the amber/gold hue on anything
else); its data is the club's live D1 events (`$theme/season-data.ts`, read at request time, so
this page cannot be prerendered the way an ordinary content route is). The Fleet and Facilities
photo compositions are the real club photography Task 3 pulled into the media library
(home-images.ts); a resolver miss degrades to the gradient placeholder the north star itself used
before the photography existed, never a broken image. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import SeasonList from '$theme/components/SeasonList.svelte';
  import { ICON_PATHS } from '$theme/markdown/icons';

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }

  // The What-do-we-do band's three photo placeholders (manifest item 13): the label, link, and
  // the alt text the eventual real photo should carry, ready for Geoff to wire once uploaded.
  const WHAT_WE_DO = [
    { label: 'Learn', cta: 'Courses & clinics', href: '/education/', altPreview: 'A sailing instructor coaching a student aboard a club dinghy.' },
    { label: 'Race', cta: 'Regattas & events', href: '/racing/', altPreview: 'Club boats racing close together under spinnaker on Big Lake.' },
    { label: 'Relax', cta: 'Facilities & membership', href: '/join/', altPreview: 'Members relaxing at the clubhouse grounds after a day on the water.' },
  ];
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => title} />

<!-- The home template's full-bleed marker: site.css's `:has()` rule detects this direct child of
     `.site-main` and cancels the shared reading-column box for the whole page, so every section
     below owns its own full-bleed background. Each section boxes its own content to
     `max-w-measure-wide`, the same width SiteHeader/SiteFooter use, so the page still reads as one
     aligned content column under the alternating bands. -->
<div class="home-shell">
  <!-- Ahoy! hero: the welcome unboxed (A1), the lede opening directly beneath the heading. The
       top keeps its own distinct treatment (a touch shallower than the band scale below, since
       nothing sits above it); the bottom joins the one band-padding rhythm (`pb-xl`) every other
       full-width section uses, per the design-polish pass's section-rhythm fix. -->
  <section class="pb-xl pt-l md:pt-xl">
    <div class="hero-grid mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m">
      <!-- The text column measures to ~54ch (the north star's own balance target, restored from
           the completion pass's fix: an earlier ~36ch cap wrapped the lede to six narrow lines),
           so the row reads as a deliberate photo/text pairing rather than a narrow text column
           dwarfed by the photo. -->
      <div class="max-w-[54ch]">
        <h1 class="m-0 font-display text-step-5 font-semibold italic leading-tight tracking-tight text-base-content">
          Ahoy!
        </h1>
        <p class="mt-2xs text-base-content">
          &hellip;and welcome to the Alaska Sailing Club. Founded in 1967, we&rsquo;re an engaged,
          community-involved 501(c)(3) with an active yearly schedule of classes, regattas, and
          family-friendly events &mdash; fun, friends, and sailing under the midnight sun.
        </p>
        <a href="/education/" class="cta-btn mt-m">Take a sailing class &rarr;</a>
      </div>
      <div class="hero-figure" class:has-photo={!!data.images.hero}>
        {#if data.images.hero}
          <img src={data.images.hero.url} alt={data.images.hero.alt} class="h-full w-full rounded-box object-cover" />
        {/if}
      </div>
    </div>
  </section>

  <!-- The notification: a slim accent strip, unboxed, never a card (A1). Only renders while a
       notification is current; an expired one is correct, honest silence. -->
  {#if data.notification}
    <section class="pb-xl">
      <div class="mx-auto max-w-measure-wide px-m">
        <div class="notification-strip max-w-[40rem] rounded-r-field border-l-[3px] border-secondary bg-base-200 px-[1.15rem] py-xs">
          <strong class="text-base-content">{data.notification.title}</strong>
          <div class="mt-[0.15rem] text-step--1 text-muted">
            {data.notification.body}
            <a href="/join/" class="font-semibold text-primary">Join now</a>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- News & updates: cards mark objects (A1); the one place body content gets real card chrome. -->
  <section id="news" class="border-y border-card-border bg-base-200 py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">News &amp; updates</h2>
      {#if data.news.length > 0}
        <div class="news-grid mt-m grid grid-cols-1 gap-m">
          {#each data.news as post (post.id)}
            <a href={post.permalink} class="news-card block overflow-hidden rounded-box border border-card-border bg-base-100">
              {#if post.image}
                <!-- data-crop="3/2": the design probe's deliberate-editorial-crop opt-out. Every
                     source photo (3:2 or 2:1) is intentionally cropped to one uniform card
                     ratio here, not a layout accident. alt="": decorative in this context, since
                     the card's own headline below is the whole card's accessible name (the
                     `news-card` anchor wraps both); the post's own page keeps the descriptive alt
                     on this same photo. -->
                <img
                  src={post.image.url}
                  alt=""
                  class="news-card-art aspect-[3/2] w-full object-cover"
                  data-crop="3/2"
                />
              {:else}
                <div class="news-card-art aspect-[3/2]"></div>
              {/if}
              <div class="px-m py-s">
                <!-- min-height reserves two title lines at the 3-up (1440px) width: a one-line
                     title in a sibling card would otherwise leave that card's meta line sitting
                     higher than a two-line neighbor's, breaking the row's baseline alignment
                     (the completion pass's measured finding, manifest item 6). -->
                <strong class="news-card-title block text-step-0 text-base-content">{post.title}</strong>
                <div class="mt-[0.2rem] text-step--1 text-muted">
                  {#if post.date}
                    <time datetime={post.date}>{formatDate(post.date)}</time>
                    <span aria-hidden="true"> &middot; </span>
                  {/if}
                  <span title="Reading time">{post.readMinutes} min read</span>
                </div>
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <p class="mt-m text-muted">No news yet.</p>
      {/if}
      <p class="mt-m">
        <a href="/posts/" class="arrow-link font-semibold text-primary underline underline-offset-[3px]">View all news &rarr;</a>
      </p>
    </div>
  </section>

  <!-- What do we do?: restored from live (manifest item 13), sanctioned with one change. Live's
       three icon tiles read weak in the walkthrough; Geoff's call replaces them with real
       photography instead, and since that photography does not exist yet, each tile ships as a
       clearly-labeled placeholder (a dashed frame, the "photo coming" glyph, and the alt text the
       real shot will carry) rather than a silent gradient like the hero/fleet/facilities panels
       use for the same gap. Geoff drops the real photo into each slot through the media library. -->
  <section class="py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">What do we do?</h2>
      <p class="mt-xs max-w-[65ch] text-base-content">
        The Alaska Sailing Club is a welcoming environment with beautiful lakeside grounds and
        plenty to do for new sailors and old salts alike. Whether you&rsquo;re here to develop
        your skills, compete on the water, or enjoy our facilities and community, the ASC offers
        something for everyone under the midnight sun.
      </p>
      <div class="what-we-do-grid mt-m grid grid-cols-1 gap-m sm:grid-cols-3">
        {#each WHAT_WE_DO as tile (tile.label)}
          <div class="what-we-do-tile">
            <div class="photo-placeholder aspect-[4/3] rounded-box border border-dashed border-card-border bg-base-200">
              <svg class="h-8 w-8 text-muted" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
                ><path d={ICON_PATHS.image} /></svg
              >
              <span class="text-step--1 font-semibold text-muted">Photo coming</span>
              <span class="photo-placeholder-alt text-step--2 text-muted">{tile.altPreview}</span>
            </div>
            <h3 class="mt-xs mb-0 font-display text-step-1 font-semibold text-base-content">{tile.label}</h3>
            <p class="mt-[0.2rem]">
              <a href={tile.href} class="arrow-link font-semibold text-primary underline underline-offset-[3px]">{tile.cta} &rarr;</a>
            </p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- The Season: C7's gold-dot taxonomy, mission-first (education most prominent, since the club
       is an educational 501(c)(3)). Live D1 events (Task 4), same markup Task 3 built. -->
  <section class="py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">The Season</h2>
      <p class="mt-[-0.4rem] mb-m text-step--1 text-muted">
        Racing runs May through September. Social events bookend the year, and a
        <span class="season-dot mr-[0.3rem] inline-block" aria-hidden="true"></span>marks classes and clinics.
        <a href="/events/" class="arrow-link font-semibold text-primary underline underline-offset-[3px]">See all events &rarr;</a>
      </p>
      <SeasonList months={data.season} />
    </div>
  </section>

  <!-- Our fleet: a two-column composition with the real club photography (Task 3). -->
  <section class="border-y border-card-border bg-base-200 py-xl">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m twocol-panel">
      <div>
        <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">Our fleet</h2>
        <p class="mt-xs text-step-0 text-base-content">
          The ASC has a well-maintained collection of club boats for sailors of all ages and
          abilities: six Lido 14s, three Lasers, a Laser II, five Optimists &mdash; plus a
          Buccaneer 18, a Catalina 16.5, a Skipjack 15, and an Ensign 22. All available to
          qualified club members.
        </p>
        <a href="/club-boat-use-and-qualification/" class="mt-xs inline-block font-semibold text-primary underline underline-offset-[3px]">
          Learn about club boat use &rarr;
        </a>
      </div>
      <div class="panel-figure" class:has-photo={!!data.images.fleet}>
        {#if data.images.fleet}
          <img src={data.images.fleet.url} alt={data.images.fleet.alt} class="h-full w-full rounded-box object-cover" />
        {/if}
      </div>
    </div>
  </section>

  <!-- Our facilities: image first at desktop width (order swaps via the panel-figure-first class).
       `facilities-row` is the scoped variant of `twocol-panel` (the completion pass's composition
       fix, manifest item 9): the amenity list runs noticeably taller than the fleet section's own
       three-line paragraph, so the shared `items-center` alignment left the photo floating in a
       band of empty space above and below it; this row top-aligns instead and gives the photo a
       touch more width, so it reads as a deliberate, fuller presence next to the list rather than
       a smaller panel adrift beside it. -->
  <section class="py-xl">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m twocol-panel facilities-row">
      <div class="panel-figure panel-figure-first" class:has-photo={!!data.images.facilities}>
        {#if data.images.facilities}
          <img src={data.images.facilities.url} alt={data.images.facilities.alt} class="h-full w-full rounded-box object-cover" />
        {/if}
      </div>
      <div>
        <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">Our facilities</h2>
        <p class="mt-xs text-step-0 text-base-content">
          To the best of our knowledge, the ASC is the northernmost sailing club in the United
          States. But despite this (or maybe because of it?) we have facilities that would be the
          envy of any sailing club in the world. Our facilities include:
        </p>
        <ul class="amenity-list mt-xs text-step-0 text-base-content">
          <li class="amenity-item">A clubhouse with a sauna and storage shed</li>
          <li class="amenity-item">A harbor with nine mooring spots for small keelboats</li>
          <li class="amenity-item">Year-round parking for trailered dinghies</li>
          <li class="amenity-item">An electric hoist with 2000 lb capacity</li>
          <li class="amenity-item">Trailer and RV parking available for members</li>
          <li class="amenity-item">A tenting area for overnight stays</li>
          <li class="amenity-item">A campfire spot and firewood storage</li>
          <li class="amenity-item">A small boat rack for kayaks and canoes</li>
          <li class="amenity-item">Park-style grounds with beautiful lake views</li>
        </ul>
        <a href="/join/" class="mt-xs inline-block font-semibold text-primary underline underline-offset-[3px]">
          Learn about membership &rarr;
        </a>
      </div>
    </div>
  </section>

  <!-- The closing band: the navy-deep "brand device" (SiteFooter's own comment), mission-first CTA. -->
  <section class="closing-band bg-flag-navy-deep py-xl">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m closing-grid">
      <div>
        <h2 class="m-0 font-display text-step-3 font-semibold text-white">Interested in learning more?</h2>
        <p class="mt-xs max-w-[50ch] text-step-0 text-footer-ink">
          Whether you&rsquo;re brand-new to sailing or looking for a community of fellow sailors,
          we&rsquo;d love to meet you.
        </p>
      </div>
      <div class="flex flex-wrap gap-[0.9rem]">
        <a href="/join/" class="cta-btn">Ready to join? &rarr;</a>
        <a href="/contact/" class="ghost-btn">Questions? Contact us</a>
      </div>
    </div>
  </section>
</div>

<style>
  .cta-btn {
    display: inline-block;
    background: var(--color-fireweed);
    color: white;
    font-weight: 650;
    font-size: 0.95rem;
    padding: 0.6rem 1.25rem;
    border-radius: var(--radius-field);
    text-decoration: none;
    transition: filter 0.15s ease, transform 0.15s ease;
  }
  .cta-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  /* Navy on white by default (the hero's own ground): the completion pass's contrast fix, manifest
     item 1. The prior white outline was invisible against the hero's white background, since this
     class is shared with the closing band's own CTA on a navy ground; the scoped override just
     below restores white there, where navy would be the one that disappears. */
  .cta-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  .closing-band .cta-btn:focus-visible {
    outline-color: white;
  }
  .ghost-btn {
    display: inline-flex;
    align-items: center;
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: var(--radius-field);
    padding: 0.6rem 1.25rem;
    font-size: 0.95rem;
    text-decoration: none;
    transition: background 0.15s ease;
  }
  .ghost-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .ghost-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  /* The hero and Fleet/Facilities photo panels: a gradient placeholder until real photography
     resolves (the `.has-photo` modifier drops the gradient once an <img> fills the box), matching
     the north star's own pre-photography state as the safe degrade for a resolver miss. Each
     panel carries its own real photo's natural ratio (the hero shot is 4:3; the fleet and
     facilities shots are both 2:1) as an explicit `aspect-ratio`, so the box never depends on the
     grid row's incidental height and the photo audit's box-vs-natural check holds regardless of
     viewport. */
  .hero-figure,
  .panel-figure {
    border-radius: var(--radius-box);
  }
  .hero-figure {
    aspect-ratio: 4 / 3;
    background: linear-gradient(140deg, #7ba7d9 0%, #4a7fb5 55%, #e8956b 100%);
  }
  .panel-figure {
    aspect-ratio: 2 / 1;
    background: linear-gradient(120deg, var(--color-flag-navy), #7ba7d9 60%, #c9dcee);
  }
  .hero-figure.has-photo,
  .panel-figure.has-photo {
    background: none;
  }

  /* The What-do-we-do band's placeholder tiles (manifest item 13): a dashed frame distinct from
     the hero/fleet/facilities panels' silent gradient, since these are genuinely waiting on a
     photo rather than degrading gracefully from one that may never come. */
  .photo-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    text-align: center;
    padding: var(--spacing-s);
  }
  .photo-placeholder-alt {
    max-width: 22ch;
    font-style: italic;
  }

  /* News cards: the one place body content gets real chrome (A1); the gentle hover lift is the
     spec's "motion keeps refined" recipe, matching the north star's own onmouseover/onmouseout. */
  .news-card {
    text-decoration: none;
    color: inherit;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .news-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--cairn-shadow);
  }
  .news-card:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  /* aspect-[3/2] (on the element itself, in the markup above) sets the box; every card art slot
     crops to that one ratio regardless of its source photo's own natural ratio, a deliberate
     editorial crop (the `data-crop="3/2"` attribute is the design probe's opt-out for it). */
  .news-card-art {
    background: linear-gradient(140deg, #7ba7d9, #4a7fb5);
  }
  /* Reserves two title lines at the 3-up (1440px) grid (the completion pass's fix, manifest item
     6): without it, a one-line title left its card's meta line sitting higher than a two-line
     sibling's, breaking the row's baseline alignment. `line-height` here is the same 1.4 the
     `text-step-0` line naturally sets; 2 lines' worth reserves the space a wrapped title needs
     without changing a one-line card's own rendered text position. */
  .news-card-title {
    min-height: calc(1.4em * 2);
    line-height: 1.4;
  }

  /* The Season's gold accent dot (C7): spends no hue on event names, marks a class or clinic only.
     `--color-star-gold-dot`, not `--color-secondary` itself: the completion pass's contrast fix
     (theme.css carries the derivation), so the marker reads >=3:1 against white. Shared with
     SeasonList.svelte's own copy of this rule (the intro legend above uses the dot outside that
     component, so this page still needs its own). */
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-star-gold-dot);
    vertical-align: 1px;
  }

  /* The facilities amenity list (manifest item 12): the live site's own 9-item list, restored in
     place of the summarizing paragraph the theme build had substituted, and restyled off the
     browser-default disc marker (the design-polish pass's finding) onto a real two-column grid.
     Its own marker is flag navy (`--color-primary`), not the Season's gold dot (the completion
     pass's fix, manifest item 9c): the gold dot's whole point is to mean "class or clinic"
     specifically, and a second, unrelated list reusing the same mark would spend that meaning on
     housekeeping instead. One column below 640px, matching the family's own 900px-vs-640px
     two-tier collapse for a list this short. */
  .amenity-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0 var(--spacing-l);
  }
  .amenity-item {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    padding-block: 0.3rem;
  }
  /* align-self: flex-start plus a top offset centers the marker on the item's FIRST line rather
     than the item's full (possibly two-line, once wrapped) box, matching a bullet's usual
     placement (the completion pass's fix, manifest item 9b): `align-self: center` on a taller,
     wrapped item centered the dot across both lines instead. `1lh` is the CSS line-height unit
     (the item's own computed line-height, whatever it resolves to), so the offset stays exact
     without hard-coding a multiplier that could drift from the actual cascade. */
  .amenity-item::before {
    content: '';
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    align-self: flex-start;
    margin-top: calc((1lh - 8px) / 2);
    border-radius: 999px;
    background: var(--color-primary);
  }
  @media (min-width: 40rem) {
    .amenity-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* The family's 900px collapse threshold (the north star's own `.twocol`/`.cols2` breakpoint):
     below it every two-column section stacks to one. */
  @media (min-width: 56.25rem) {
    /* Slightly favors the photo over the north star's own 1.25fr:1fr split (46% vs 44%), since
       this site's narrower `--container-measure-wide` (58rem, vs the north star's 1120px shell)
       otherwise renders the photo smaller in absolute pixels for the same ratio. */
    .hero-grid {
      grid-template-columns: 1.15fr 1fr;
    }
    .twocol-panel {
      grid-template-columns: 1fr 1fr;
    }
    /* Facilities gives its photo a touch more width than the fleet section's own even split, and
       top-aligns it against the list instead of vertically centering it in the list's own taller
       box (the completion pass's composition fix, manifest item 9a). */
    .facilities-row {
      grid-template-columns: 1.08fr 1fr;
      align-items: start;
    }
    .closing-grid {
      grid-template-columns: 1.2fr 1fr;
    }
    .news-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    /* Image-first on wide screens only; the mobile order is the natural DOM order (text first). */
    .panel-figure-first {
      order: -1;
    }
  }

  /* A shared inline touch-target expansion (the completion pass's fix, manifest item 4): "View all
     news", the three What-do-we-do CTAs, and "See all events" all measured 19-22px tall, short of
     the 24px minimum, since a plain inline link's hit area is just its line box. Vertical padding
     on an inline (not inline-block) element does not affect line-height at all per the CSS spec,
     so this grows the clickable/paintable box without shifting any surrounding text, a pixel or
     two of visual overlap into the line above/below aside. */
  .arrow-link {
    padding-block: 0.3rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-btn,
    .ghost-btn,
    .news-card {
      transition: none;
    }
  }
</style>
