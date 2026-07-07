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

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => title} />

<!-- The home template's full-bleed marker: site.css's `:has()` rule detects this direct child of
     `.site-main` and cancels the shared reading-column box for the whole page, so every section
     below owns its own full-bleed background. Each section boxes its own content to
     `max-w-measure-wide`, the same width SiteHeader/SiteFooter use, so the page still reads as one
     aligned content column under the alternating bands. -->
<div class="home-shell">
  <!-- Ahoy! hero: the welcome unboxed (A1), the lede opening directly beneath the heading. -->
  <section class="pb-s pt-l md:pt-xl">
    <div class="hero-grid mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m">
      <div>
        <h1 class="m-0 font-display text-step-5 font-semibold italic leading-tight tracking-tight text-base-content">
          Ahoy!
        </h1>
        <p class="mt-2xs max-w-[54ch] text-base-content">
          &hellip;and welcome to the Alaska Sailing Club. Founded in 1967, we&rsquo;re an engaged,
          community-involved 501(c)(3) with an active yearly schedule of classes, regattas, and
          family-friendly events &mdash; fun, friends, and sailing under the midnight sun.
        </p>
        <a href="/education/" class="cta-btn mt-s">Take a sailing class &rarr;</a>
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
    <section class="pb-s">
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
              <div class="news-card-art"></div>
              <div class="px-m py-s">
                <strong class="text-step-0 text-base-content">{post.title}</strong>
                {#if post.date}
                  <div class="mt-[0.2rem] text-step--1 text-muted"><time datetime={post.date}>{formatDate(post.date)}</time></div>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <p class="mt-m text-muted">No news yet.</p>
      {/if}
      <p class="mt-m">
        <a href="/posts/" class="font-semibold text-primary underline underline-offset-[3px]">View all news &rarr;</a>
      </p>
    </div>
  </section>

  <!-- The Season: C7's gold-dot taxonomy, mission-first (education most prominent, since the club
       is an educational 501(c)(3)). Live D1 events (Task 4), same markup Task 3 built. -->
  <section class="py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">The Season</h2>
      <p class="mt-[-0.4rem] mb-m text-step--1 text-muted">
        Racing runs May through September. Social events bookend the year.
        <span class="whitespace-nowrap">
          <span class="season-dot mr-[0.4rem] inline-block"></span>classes and clinics.
        </span>
        <a href="/events/" class="font-semibold text-primary underline underline-offset-[3px]">See all events &rarr;</a>
      </p>
      <SeasonList months={data.season} />
    </div>
  </section>

  <!-- Our fleet: a two-column composition with the real club photography (Task 3). -->
  <section class="border-y border-card-border bg-base-200 py-l">
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

  <!-- Our facilities: image first at desktop width (order swaps via the panel-figure-first class). -->
  <section class="py-l">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m twocol-panel">
      <div class="panel-figure panel-figure-first" class:has-photo={!!data.images.facilities}>
        {#if data.images.facilities}
          <img src={data.images.facilities.url} alt={data.images.facilities.alt} class="h-full w-full rounded-box object-cover" />
        {/if}
      </div>
      <div>
        <h2 class="m-0 font-display text-step-3 font-semibold text-base-content">Our facilities</h2>
        <p class="mt-xs text-step-0 text-base-content">
          The northernmost sailing club in the United States &mdash; with facilities that would be
          the envy of any: a clubhouse with a sauna, a nine-mooring harbor, an electric hoist,
          year-round dinghy parking, tenting and RV space, a campfire spot, and park-style grounds
          with beautiful lake views.
        </p>
        <a href="/join/" class="mt-xs inline-block font-semibold text-primary underline underline-offset-[3px]">
          Learn about membership &rarr;
        </a>
      </div>
    </div>
  </section>

  <!-- The closing band: the navy-deep "brand device" (SiteFooter's own comment), mission-first CTA. -->
  <section class="closing-band bg-flag-navy-deep py-l">
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
  .cta-btn:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
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
     the north star's own pre-photography state as the safe degrade for a resolver miss. */
  .hero-figure,
  .panel-figure {
    border-radius: var(--radius-box);
    min-height: 14rem;
    background: linear-gradient(140deg, #7ba7d9 0%, #4a7fb5 55%, #e8956b 100%);
  }
  .panel-figure {
    background: linear-gradient(120deg, var(--color-flag-navy), #7ba7d9 60%, #c9dcee);
    min-height: 13rem;
  }
  .hero-figure.has-photo,
  .panel-figure.has-photo {
    background: none;
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
  .news-card-art {
    min-height: 7rem;
    background: linear-gradient(140deg, #7ba7d9, #4a7fb5);
  }

  /* The Season's gold accent dot (C7): spends no hue on event names, marks a class or clinic only.
     Shared with SeasonList.svelte's own copy of this rule (the intro legend above uses the dot
     outside that component, so this page still needs its own). */
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-secondary);
    vertical-align: 1px;
  }

  /* The family's 900px collapse threshold (the north star's own `.twocol`/`.cols2` breakpoint):
     below it every two-column section stacks to one. */
  @media (min-width: 56.25rem) {
    .hero-grid {
      grid-template-columns: 1.25fr 1fr;
    }
    .twocol-panel {
      grid-template-columns: 1fr 1fr;
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

  @media (prefers-reduced-motion: reduce) {
    .cta-btn,
    .ghost-btn,
    .news-card {
      transition: none;
    }
  }
</style>
