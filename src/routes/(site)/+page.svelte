<!-- @component
ASC's home page (Task 3, live-data-wired in Task 4): the north star made real, section for
section (docs/superpowers/specs/assets/2026-07-06-asc-home-northstar.html in the cairn-cms repo,
the build's design contract). A1's quieting recipe governs every section here: bands mark
sections (the sage News band, the navy-deep closing band), cards mark objects (the news grid
only), and the notification is an unboxed slim accent strip rather than a card. The Season band's
gold dot is the C7 recipe (a class or clinic, never spending the amber/gold hue on anything
else); its data is the club's live D1 events (`$theme/season-data.ts`, read at request time, so
this page cannot be prerendered the way an ordinary content route is). Every photo composition
(hero, What-do-we-do, Fleet, Facilities) is real club photography pulled into the media library
(home-images.ts); a resolver miss degrades to the gradient placeholder the north star itself used
before the photography existed, never a broken image. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import SeasonList from '$theme/components/SeasonList.svelte';
  import NotificationStrip from '$theme/components/NotificationStrip.svelte';

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function formatDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }

  // The What-do-we-do band's three tiles (design-polish pass, 2026-07-07): the placeholder
  // "photo coming" boxes are gone, replaced by the real class-instruction, spinnaker, and grounds
  // photography home-images.ts resolves; `key` picks each tile's own slot out of `data.images`.
  const WHAT_WE_DO = [
    { label: 'Learn', cta: 'Courses & clinics', href: '/education/', key: 'learn' as const },
    { label: 'Race', cta: 'Regattas & events', href: '/racing/', key: 'race' as const },
    { label: 'Relax', cta: 'Facilities & membership', href: '/join/', key: 'relax' as const },
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
       full-width section uses, per the design-polish pass's section-rhythm fix.

       The design-polish pass (2026-07-07) let the photography lead: the source photo
       (site-header-4x3.jpeg, a tight action portrait with no calm ground anywhere in the frame)
       ruled out a text-over-photo scrim treatment (WCAG contrast has nowhere honest to land on
       it), so the fix is the decisively photo-dominant split the Facilities section already
       proves works at this site (a photo given real size beside a scannable block), pushed
       further here since the hero has no competing list to balance against. At 900px+ the photo
       column now outweighs the text column (`.hero-grid`'s own ratio, below) instead of the
       other way around, which grows its rendered height for free at the photo's true 4:3 ratio
       (no crop). Below 900px the photo leads the stack (`order: -1`) rather than following the
       text, so a mobile reader meets the photography first.

       The text column's own vertical edges (round-3 fix, 2026-07-07): at 900px+, the tall photo
       column (its own 4:3 ratio at the row's 0.75fr track) runs noticeably taller than the text
       column's intrinsic content height, and the row's prior `align-items: end` (bottom-anchoring
       the CTA to the photo's own bottom edge, still correct) left roughly 80px of dead air above
       the title, which read as the text block floating apart from the photo rather than resolving
       against BOTH its edges (Geoff's live-review finding). `.hero-text` (the scoped rule below)
       now stretches to the row's full height and distributes its own three children with
       `justify-content: space-between`, so the title's own cap line resolves against the photo's
       top edge and the CTA keeps its existing bottom-edge resolution, with the lede's natural
       flow filling the space between. The title gains a display-scale step and the lede gains a
       touch more leading (this rule block, below) so that distributed space reads as generous
       paragraph breathing room, not a stretched void: the text now reads full beside the photo at
       every tested width, never centered as a fallback (this pass's own render check). -->
  <section class="pb-xl pt-l md:pt-xl">
    <div class="hero-grid mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m">
      <!-- The text column measures to ~54ch (the north star's own balance target, restored from
           the completion pass's fix: an earlier ~36ch cap wrapped the lede to six narrow lines),
           so the row reads as a deliberate photo/text pairing rather than a narrow text column
           dwarfed by the photo. The cap only ever binds at very wide viewports: at the row's own
           0.75fr:1fr split it is well short of the nominal 54ch in practice, still narrower than a
           long-form reading measure ought to be, which is exactly why the title and lede both gain
           a touch more presence below rather than the column simply growing wider (that would
           require reopening the photo-dominant ratio the design-polish pass deliberately chose for
           the source photo's own composition, out of this round's scope). -->
      <div class="hero-text max-w-[54ch]">
        <h1 class="hero-title m-0 font-display font-semibold italic leading-tight tracking-tight text-base-content">
          Ahoy!
        </h1>
        <p class="hero-lede mt-xs text-step-0 text-base-content">
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

  <!-- The notification: a hoisted pennant (the round-3 redesign, 2026-07-07), replacing the
       gray admonition box (fill, border, bold title prefix) Geoff's live review flagged. Unboxed,
       on the page's own white ground, in the hero's own measure. Only renders while a
       notification is current; an expired one is correct, honest silence. See
       NotificationStrip.svelte's own header comment. -->
  {#if data.notification}
    <section class="pb-xl">
      <div class="mx-auto max-w-measure-wide px-m">
        <NotificationStrip notification={data.notification} />
      </div>
    </section>
  {/if}

  <!-- Every section h2 on this page reads `text-step-4` (the design-polish pass, 2026-07-07):
       `text-step-3` sat only one modest step above the body text's own `text-step-0`, reading
       as a weak break between sections. One shared class across all six headings keeps the
       page's own hierarchy consistent rather than singling out a few. -->
  <!-- News & updates: cards mark objects (A1); the one place body content gets real card chrome. -->
  <section id="news" class="border-y border-card-border bg-base-200 py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-base-content">News &amp; updates</h2>
      {#if data.news.length > 0}
        <div class="news-grid mt-xs grid grid-cols-1 gap-m">
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
                <strong class="news-card-title block text-step-1 text-base-content">{post.title}</strong>
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
      <p class="mt-s">
        <a href="/posts/" class="arrow-link font-semibold text-primary underline underline-offset-[3px]">View all news &rarr;</a>
      </p>
    </div>
  </section>

  <!-- What do we do?: restored from live (manifest item 13), sanctioned with one change. Live's
       three icon tiles read weak in the walkthrough; the design-polish pass (2026-07-07) replaces
       them with the real class-instruction, spinnaker, and grounds photography home-images.ts
       resolves, closing the "photo coming" gap that was the page's loudest unfinished signal. A
       resolver miss (never expected in production) degrades to the same silent gradient the
       hero/fleet/facilities panels use, not a placeholder box. -->
  <section class="py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-base-content">What do we do?</h2>
      <!-- Full row width, not a `ch`-capped column (the owner-round-2 fix, 2026-07-07): the prior
           `max-w-[65ch]` cap wrapped this two-sentence intro to a measure that, purely by char-
           count coincidence, stopped its right edge right at the three-tile grid's second tile
           below, an arbitrary-looking seam (Geoff's live-page finding). Matching the grid's own
           full width instead gives the paragraph's edge the same compositional line the row
           already has, rather than a text-wrap accident; a two-sentence lede reads fine as two or
           three wide lines, unlike a long-form paragraph the ~75ch reading-measure guideline
           actually protects against. -->
      <p class="mt-xs text-step-0 text-base-content">
        The Alaska Sailing Club is a welcoming environment with beautiful lakeside grounds and
        plenty to do for new sailors and old salts alike. Whether you&rsquo;re here to develop
        your skills, compete on the water, or enjoy our facilities and community, the ASC offers
        something for everyone under the midnight sun.
      </p>
      <div class="what-we-do-grid mt-m grid grid-cols-1 gap-l sm:grid-cols-3">
        {#each WHAT_WE_DO as tile (tile.label)}
          {@const photo = data.images[tile.key]}
          <div class="what-we-do-tile">
            <div class="what-we-do-figure aspect-[4/3] rounded-box" class:has-photo={!!photo}>
              {#if photo}
                <!-- data-crop="4/3": the design probe's deliberate-editorial-crop opt-out, the
                     same recipe the News grid's own cards use just above. The three source photos
                     carry three different natural ratios; this band crops all of them to one
                     uniform tile shape on purpose. -->
                <img src={photo.url} alt={photo.alt} class="h-full w-full rounded-box object-cover" data-crop="4/3" />
              {/if}
            </div>
            <h3 class="what-we-do-label mt-xs mb-0 font-display text-step-1 leading-tight text-base-content">{tile.label}</h3>
            <p class="mt-3xs">
              <a href={tile.href} class="arrow-link font-semibold text-primary underline underline-offset-[3px]">{tile.cta} &rarr;</a>
            </p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- The Season: one printed race-calendar (the round-3 rebuild, 2026-07-07), replacing the
       original per-tier CSS-multicol build Geoff's live review found "messy and disorganized at a
       casual glance". `SeasonList` carries the calendar itself (one column, month groups as
       bounded units, all category emphasis in the dot slot); see its own header comment for the
       full diagnosis and rebuild. Carries its own sage band (the owner-round fix, 2026-07-07): it
       previously sat on the same transparent ground as "What do we do?" directly above it, reading
       as one long white stretch (the design probe's own band-sequence line showed two consecutive
       "—" entries here). Facilities picks up the sage band the Fleet section below gives up
       (Fleet's own fix, same pass), so the full sequence alternates cleanly top to bottom with no
       two adjacent sections sharing a ground.

       The intro sentence reads at full body scale and ink now (`text-step-0 text-base-content`,
       the round-3 fix), not the caption-scale muted line it was: this is the band's own orienting
       sentence and its dot legend, naming every color the calendar below uses, so it earns the same
       reading weight as the event names it explains rather than reading as a footnote beneath
       them. -->
  <section class="border-y border-card-border bg-base-200 py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-base-content">The Season</h2>
      <p class="mt-xs mb-s text-step-0 text-base-content">
        Racing runs May through September. A
        <span class="season-dot season-dot-class mx-[0.3rem] inline-block" aria-hidden="true"></span>gold dot marks classes and clinics, a
        <span class="season-dot season-dot-social mx-[0.3rem] inline-block" aria-hidden="true"></span>sage dot marks social events, and a
        <span class="season-dot season-dot-business mx-[0.3rem] inline-block" aria-hidden="true"></span>slate dot marks club business.
        <a href="/events/" class="arrow-link font-semibold text-primary underline underline-offset-[3px]">See all events &rarr;</a>
      </p>
      <SeasonList months={data.season} />
    </div>
  </section>

  <!-- Our fleet: a list beside a portrait photo (the owner-round-2 fix, 2026-07-07), replacing
       the full-width-photo-then-paragraph composition: the paragraph sat well short of the row's
       full width beneath a wide photo, reading as a blank column beside it (Geoff's live-page
       finding). The boat inventory is now a real list rather than an inline run of clauses, and
       sits beside a deliberate PORTRAIT crop of the same fleet-racing-spinnakers source (1200x600,
       four boats racing under spinnaker); no portrait fleet asset exists in the library, and none
       was needed, since a landscape source cropped into a taller-than-2:1 box always shows its own
       FULL height under `object-fit: cover` (the box's own aspect ratio sits far short of the
       source's 2:1, so `cover` can only crop horizontally, per CSS `cover` semantics) — exactly
       the "no beheaded masts" constraint, satisfied for free. `object-position` (below) picks the
       horizontal slice, centered on the two most legible sails (the red/white and blue/green
       spinnakers). `.fleet-row` reuses `.facilities-row`'s own stretch-to-match trick (`panel-
       figure`'s `aspect-ratio: auto; height: 100%` at the shared 900px breakpoint) to balance the
       two columns' heights, an even 1fr/1fr split (not Facilities' own 1.08fr, since there is no
       photo-first reorder here to compensate for). -->
  <section class="py-xl">
    <div class="mx-auto max-w-measure-wide px-m">
      <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-base-content">Our fleet</h2>
      <div class="mt-s grid grid-cols-1 items-center gap-l twocol-panel fleet-row">
        <div>
          <p class="text-step-0 text-base-content">
            The ASC has a well-maintained collection of club boats for sailors of all ages and
            abilities:
          </p>
          <ul class="fleet-list text-step-0 text-base-content">
            <li><span class="fleet-count">Six</span> Lido 14s</li>
            <li><span class="fleet-count">Three</span> Lasers</li>
            <li><span class="fleet-count">A</span> Laser II</li>
            <li><span class="fleet-count">Five</span> Optimists</li>
            <li><span class="fleet-count">A</span> Buccaneer 18</li>
            <li><span class="fleet-count">A</span> Catalina 16.5</li>
            <li><span class="fleet-count">A</span> Skipjack 15</li>
            <li><span class="fleet-count">An</span> Ensign 22</li>
          </ul>
          <p class="mt-xs text-step-0 text-base-content">All available to qualified club members.</p>
          <a href="/club-boat-use-and-qualification/" class="arrow-link mt-s inline-block font-semibold text-primary underline underline-offset-[3px]">
            Learn about club boat use &rarr;
          </a>
        </div>
        <div class="panel-figure" class:has-photo={!!data.images.fleet}>
          {#if data.images.fleet}
            <img
              src={data.images.fleet.url}
              alt={data.images.fleet.alt}
              class="h-full w-full rounded-box object-cover fleet-photo"
              data-crop="portrait"
            />
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Our facilities: image first at desktop width (order swaps via the panel-figure-first class).
       `facilities-row` is the scoped variant of `twocol-panel` (the completion pass's composition
       fix, manifest item 9). The amenity list runs noticeably taller than the fleet section's own
       three-line paragraph; an earlier top-aligned, fixed-2:1 photo left a tall empty region below
       it (Geoff's live-page finding, 2026-07-07). The desktop rule below now stretches the figure
       to the row's full height instead (`.facilities-row .panel-figure`'s own `aspect-ratio: auto;
       height: 100%`), so the photo fills the column beside the list with no gap; `data-crop` opts
       it out of the design probe's natural-ratio check, since filling the column deliberately
       diverges from the source photo's own 2:1 shot. Below the 900px breakpoint the row stacks to
       one column and this override never applies, so the photo keeps its natural-ish 2:1 shape
       there instead of towering. Picks up the sage band Fleet gives up above (the owner-round fix,
       2026-07-07), so the page's band sequence still alternates with no two adjacent sections
       sharing a ground.

       The amenity list reads as subordinate to the intro paragraph above it (the owner-round-2
       fix, 2026-07-07): the intro stays at body scale and full ink (`text-step-0 text-base-
       content`, untouched), while the list steps down one size (`text-step--1`) and one voice
       (`text-muted`, the site's own quiet-but-passing tone; the checkmark's own border color
       follows suit below) with a tighter row `padding-block`, so the section reads heading, then
       intro prose, then a compact supporting inventory, rather than two co-equal blocks of text.
       The section's prior exit CTA ("Learn about membership") is gone outright (a second Geoff
       finding, same review): the closing band's own CTA, two sections down, already owns that
       job, and a mid-page duplicate diluted it; the section now simply ends with the list. -->
  <section class="border-y border-card-border bg-base-200 py-xl">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m twocol-panel facilities-row">
      <div class="panel-figure panel-figure-first" class:has-photo={!!data.images.facilities}>
        {#if data.images.facilities}
          <img
            src={data.images.facilities.url}
            alt={data.images.facilities.alt}
            class="h-full w-full rounded-box object-cover facilities-photo"
            data-crop="fill"
          />
        {/if}
      </div>
      <div>
        <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-base-content">Our facilities</h2>
        <p class="mt-xs text-step-0 text-base-content">
          To the best of our knowledge, the ASC is the northernmost sailing club in the United
          States. But despite this (or maybe because of it?) we have facilities that would be the
          envy of any sailing club in the world. Our facilities include:
        </p>
        <ul class="amenity-list text-step--1">
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
      </div>
    </div>
  </section>

  <!-- The closing band: the navy-deep "brand device" (SiteFooter's own comment), mission-first CTA. -->
  <section class="closing-band bg-flag-navy-deep py-xl">
    <div class="mx-auto grid max-w-measure-wide grid-cols-1 items-center gap-l px-m closing-grid">
      <div>
        <h2 class="m-0 font-display text-step-4 font-semibold leading-tight text-white">Interested in learning more?</h2>
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
    font-size: var(--text-step--1);
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
    font-size: var(--text-step--1);
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

  /* The hero title and lede's own added presence (round-3 fix, 2026-07-07): both gain a touch
     more weight so the text column reads full beside the photo rather than needing the vertical
     distribution (`.hero-text`, below) to stretch across an otherwise-thin block. "Ahoy!" steps up
     a display size past the shared `--text-step-5` heading token (a bespoke `calc`, not a new
     token: no page uses a heading bigger than this one, and the greeting is this page's own single
     largest mark) while staying well under the What-do-we-do band's own tile treatment, still the
     page's louder highlight. The lede's leading opens from the ambient `1.5` to the theme's own
     `--leading-body` token, the same generous body rhythm prose.css already uses, so its six lines
     read as calmer, better-spaced prose instead of a tightly packed block. */
  .hero-title {
    font-size: calc(var(--text-step-5) * 1.15);
  }
  .hero-lede {
    line-height: var(--leading-body);
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
    /* Photo-first below the two-column breakpoint (the design-polish pass): a mobile reader meets
       the photography before the welcome text, not after. Reset to source order at 900px+, where
       the two columns already sit side by side and reordering would only scramble the DOM's own
       reading order for no visual gain. */
    order: -1;
  }
  @media (min-width: 56.25rem) {
    .hero-figure {
      order: 0;
    }
  }
  .panel-figure {
    aspect-ratio: 2 / 1;
    background: linear-gradient(120deg, var(--color-flag-navy), #7ba7d9 60%, #c9dcee);
  }
  .hero-figure.has-photo,
  .panel-figure.has-photo {
    background: none;
  }
  /* Facilities' own crop focus (re-derived, owner-round-2 fix, 2026-07-07): the desktop rule
     below stretches this box so much taller than any landscape source's own shape that the
     vertical axis never actually crops (the box's height alone drives `object-fit: cover`'s
     scale, so the full image height always shows, top to bottom, no matter what `object-position`
     reads: CSS `cover` can only crop the ONE axis whose fit ratio is smaller, and a box this much
     taller than wide always loses that comparison on height). That made the box's own bottom edge
     a direct window onto the source photo's own bottom edge, which sliced through four club
     dinghies' sails mid-mast (Geoff's live-review finding); no `object-position` value could have
     hidden that, only a real crop of the source could. `home-images.ts` now points this slot at a
     deliberate derived crop (`clubhouse-grounds-crop`, the same source's own top 420 of 600 rows),
     trimmed to end on open water below the shoreline, so the box's guaranteed full-height display
     no longer has any boat left in it to slice. `object-position`'s job is therefore purely
     horizontal now: this box's own tall, narrow shape only has room for about a third of the
     frame's width, so it cannot hold both the shot's two landmarks (the near island with its own
     dock and boathouse, and the clubhouse further down the shoreline) at once; 38% centers on the
     island, the closer and more legible of the two, rather than drifting onto open water on
     either side. A wider box (Facilities' own mobile breakpoint, and every viewport below 900px)
     has room for both. */
  .facilities-photo {
    object-position: 38% center;
  }

  /* The What-do-we-do band's tiles (design-polish pass, 2026-07-07): the same silent-gradient
     degrade the hero/fleet/facilities panels use for a resolver miss, so three real photos never
     have a "waiting on art" moment in production. */
  .what-we-do-figure {
    background: linear-gradient(140deg, #7ba7d9 0%, #4a7fb5 55%, #e8956b 100%);
  }
  .what-we-do-figure.has-photo {
    background: none;
  }

  /* The label reads as the tile's own caption, not a plain semibold heading (the craft pass's fix,
     2026-07-07): a touch heavier than `font-semibold` (600) binds it visually to the tile above,
     while `.arrow-link` right beneath keeps its own lighter weight so the pair reads as label, then
     action, rather than two headings stacked. */
  .what-we-do-label {
    font-weight: 650;
  }

  /* Our fleet's own list (the fleet-treatment pass, 2026-07-07): the owner flagged the plain en
     dash as untreated next to Facilities' designed checkmark. This list is the section's PRIMARY
     content, not subordinate the way Facilities' amenity list reads, so it keeps full body scale
     and ink (`text-step-0 text-base-content`, unchanged) rather than borrowing Facilities' quieted
     `text-step--1 text-muted` treatment; only the marker and row rhythm get real design attention.
     The marker is a small filled diamond in `--color-muted`, the "quiet point in the muted tone"
     recipe: a designed waypoint mark, not a copy of Facilities' checkmark (a different meaning,
     "included with membership") or the Season's gold dot, which the club-grounds story reserves
     for classes/clinics only ("marks and waypoints... never body text" elsewhere) — reusing that
     hue here would blur the one meaning it carries. The diamond's own shape (not a circle) also
     keeps it visibly distinct from the Season's dot at a glance. Row spacing steps up from the
     prior arbitrary 0.2rem to the `--spacing-3xs` token, a touch more generous than Facilities'
     tight, subordinate rhythm, since this list is the primary read. One column: eight short
     entries never runs tall enough to need the amenity list's multi-column balance. */
  .fleet-list {
    margin: 0;
    margin-top: var(--spacing-xs);
    padding: 0;
    list-style: none;
  }
  .fleet-list li {
    padding-block: var(--spacing-3xs);
    padding-left: 1.1rem;
    position: relative;
  }
  /* `1lh` centers the mark on the item's first line (the amenity checkmark's own technique, see
     its comment below), so it reads as a bullet at the text's own cap-height rather than floating
     a few pixels off. */
  .fleet-list li::before {
    content: '';
    position: absolute;
    left: 0.15rem;
    top: calc((1lh - 6px) / 2);
    width: 6px;
    height: 6px;
    background: var(--color-muted);
    transform: rotate(45deg);
  }
  /* The leading quantity ("Six", "A", "An") steps up half a weight (the same 650 the page's other
     quiet-emphasis labels use: the news card title, the What-do-we-do label), so a reader scanning
     straight down the column sees the fleet's own counts at a glance rather than reading each line
     as a full sentence to find the number. */
  .fleet-count {
    font-weight: 650;
  }

  /* Our fleet's photo (the owner-round-2 fix, 2026-07-07): unlike Facilities, this crop needs no
     source-file trim, because the full vertical extent CSS `cover` is guaranteed to show (see
     `.fleet-row .panel-figure`'s own comment above) already IS the wanted content: the source
     shot's boats and sails run the full height of the frame already, so showing all of it is
     correct, not a defect to route around. `object-position` only ever needed to choose a
     horizontal slice; centered on the red/white and blue/green spinnakers (the source's own most
     legible boats, roughly the frame's second and third quarters), not the plain default 50%,
     which centers on the gap between the third and fourth boats instead. */
  .fleet-photo {
    object-position: 53% center;
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
  /* Sized to `text-step-1` at weight 650 (the design-scale audit's fix, 2026-07-07): a card title
     at plain `text-step-0`/700 read the same size as the card's own body copy, once every stray
     16px paragraph on the page joined the same step-0 token, a collision this weight-and-size step
     up resolves without reaching for a heading-sized token that would fight the card's own
     compact chrome. Reserves two title lines at the 3-up (1440px) grid (the completion pass's fix,
     manifest item 6): without it, a one-line title left its card's meta line sitting higher than a
     two-line sibling's, breaking the row's baseline alignment. `min-height` is `em`-relative to
     this rule's own `line-height`, so it keeps reserving exactly two lines' worth of space at the
     new, larger size with no separate edit. */
  .news-card-title {
    font-weight: 650;
    min-height: calc(1.4em * 2);
    line-height: 1.4;
    /* Two lines exactly: the reserve handles a short title's meta alignment, and the clamp
       handles a long one's (a third wrapped line pushed the middle card's meta below its
       siblings at the step-1 size). The full title lives on the post's own page. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  /* The Season legend's three dots (the round-3 calendar rebuild): the same three colors
     SeasonList.svelte's own row dots use (that component's copy of this rule; the intro legend
     above uses the dot outside that component, so this page still needs its own), each spending
     no hue on the event names themselves, marks only. */
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    vertical-align: 1px;
  }
  .season-dot-class {
    background: var(--color-star-gold-dot);
  }
  .season-dot-social {
    background: var(--color-sage-dot);
  }
  .season-dot-business {
    background: var(--color-muted);
  }

  /* The facilities amenity list (manifest item 12; restyled again in the owner-round pass,
     2026-07-07): the live site's own 9-item list, restored in place of the summarizing paragraph
     the theme build had substituted, off the browser-default disc marker (the design-polish pass's
     finding) onto a real two-column grid. Its own marker reads as a small checkmark, not a plain
     dot (Geoff's finding: the list needed "better list markers... spacing that reads designed"),
     never the Season's gold dot (the completion pass's fix, manifest item 9c: the gold dot's whole
     point is to mean "class or clinic" specifically, and a second, unrelated list reusing the same
     mark would spend that meaning on housekeeping instead). One column below 640px, matching the
     family's own 900px-vs-640px two-tier collapse for a list this short.

     The list reads as subordinate to the intro paragraph above it (the owner-round-2 fix,
     2026-07-07: `text-step--1` in the markup, one size quieter than the paragraph's own
     `text-step-0 text-base-content`), so the rows themselves stay tightened to read as a compact
     inventory rather than a second co-equal block of prose; the checkmark keeps its own quieted
     `--color-muted` border below, untouched by the round-3 ink fix (next comment).

     The list's own text ink steps up one notch toward reading ink (the round-3 fix, 2026-07-07:
     Geoff's live-review finding, "a tad too light"): plain `--color-muted` (the same token every
     quiet caption on the page reads) read as too faint for a list of real included amenities, not
     housekeeping. A third-toward-ink color-mix (not a full step to `--color-base-content`, which
     would erase the intended subordination to the intro paragraph above) keeps the list reading
     quieter than body text while no longer reading washed out. Size, spacing, and the checkmark
     itself are unchanged; only this rule's `color` differs from the owner-round-2 version. */
  /* margin-top set here, not the markup's own `mt-xs` (there was one, and it did nothing): this
     unlayered scoped rule already outranks any Tailwind utility class regardless of specificity
     (the same mechanism `.facilities-row`'s `align-items` override relies on above), so a `margin:
     0` here had silently zeroed that utility's own margin-top too, leaving no gap at all between
     the intro paragraph and the list (the design-scale audit's finding, 2026-07-07). */
  .amenity-list {
    margin: 0;
    margin-top: var(--spacing-xs);
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0 var(--spacing-l);
    color: color-mix(in oklab, var(--color-muted) 67%, var(--color-base-content) 33%);
  }
  .amenity-item {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    /* Tightened from 0.4rem (the owner-round-2 fix): a compact inventory reads as one small block,
       not a list spaced to the same rhythm as the body-scale text above it. */
    padding-block: 0.2rem;
    /* Only matters once the two-column rule below switches the list to CSS multi-column: keeps a
       single amenity from splitting its own two lines across the column break. */
    break-inside: avoid;
  }
  /* align-self: flex-start plus a top offset centers the marker on the item's FIRST line rather
     than the item's full (possibly two-line, once wrapped) box, matching a bullet's usual
     placement (the completion pass's fix, manifest item 9b): `align-self: center` on a taller,
     wrapped item centered the mark across both lines instead. `1lh` is the CSS line-height unit
     (the item's own computed line-height, whatever it resolves to), so the offset stays exact
     without hard-coding a multiplier that could drift from the actual cascade. The checkmark itself
     (the owner-round restyle) is the classic two-segment border technique, rotated 40deg: a plain
     CSS shape, no icon dependency, that reads as "included" rather than an unlabeled bullet. Its
     border color follows the list's own quieter ink (the owner-round-2 fix), `--color-muted`
     rather than the navy `--color-primary` the rest of the page reserves for real emphasis. */
  .amenity-item::before {
    content: '';
    flex-shrink: 0;
    width: 7px;
    height: 11px;
    align-self: flex-start;
    margin-top: calc((1lh - 11px) / 2);
    border-right: 2px solid var(--color-muted);
    border-bottom: 2px solid var(--color-muted);
    transform: rotate(40deg);
  }
  /* CSS multi-column, not a second grid track: a 9-item list split into a 5/4 grid ran the two
     columns row-major (item 1 and 2 side by side, 3 and 4 below them, and so on), which read as a
     zigzag rather than the familiar top-to-bottom-per-column list, and left the shorter column's
     last row dangling well above the taller one's (the design-polish pass's finding, 2026-07-07).
     `columns` reads top-to-bottom per column and balances the two columns' total height on its
     own (`column-fill: balance`, the default for an unconstrained-height container). The hairline
     `column-rule` (the owner-round restyle) gives the two columns a consistent visible seam instead
     of relying on the reader's eye to find the break in the gap alone. */
  @media (min-width: 40rem) {
    .amenity-list {
      display: block;
      columns: 2;
      column-gap: var(--spacing-l);
      column-rule: var(--border) solid var(--color-card-border);
    }
  }

  /* The family's 900px collapse threshold (the north star's own `.twocol`/`.cols2` breakpoint):
     below it every two-column section stacks to one. */
  @media (min-width: 56.25rem) {
    /* The design-polish pass's photo-dominant split (2026-07-07), replacing the north star's own
       text-favoring 1.15fr:1fr ratio: the photo column now outweighs the text column (58% vs 42%
       of the row), so the photo's own 4:3 ratio renders substantially taller at this container's
       58rem measure, with no crop, letting the photography lead the section the way the
       Facilities panel already does further down the page. */
    .hero-grid {
      grid-template-columns: 0.75fr 1fr;
      /* Stretches both columns to the row's own height (the round-3 edge-resolution fix,
         2026-07-07), overriding the row's shared `items-center` utility (an unlayered scoped rule
         already outranks any Tailwind utility class regardless of specificity, the same mechanism
         `.facilities-row`'s own `align-items` override relies on below): `.hero-text`'s own
         `justify-content: space-between` (below) needs a full-height box to distribute against.
         Plain `end` (the craft pass's prior fix) anchored only the CTA to the photo's bottom edge
         and left the title floating in dead air above; stretch resolves both edges at once. */
      align-items: stretch;
    }
    /* The text column's own edge resolution (round-3 fix): stretched to the row's full height by
       the grid's `align-items: stretch` above, then distributes its three children so the title
       resolves against the photo's top edge, the CTA keeps its existing bottom-edge resolution,
       and the lede's own flow fills the space between. Judged against the render at 1440 and 768:
       the title/lede's own added presence (below) keeps this reading as generous paragraph
       breathing room rather than a stretched void, so this is the shipped state, not the
       centered fallback the task allowed for. */
    .hero-text {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    /* The optical cap-height nudge: a line box's own leading sits above a letter's true cap
       height, so top-anchoring the column's box (above) still leaves a small visible gap before
       "Ahoy!"'s own ink starts. Pulled up by eye against the photo's top edge at 1440 and 768. */
    .hero-title {
      margin-top: -0.08em;
    }
    .twocol-panel {
      grid-template-columns: 1fr 1fr;
    }
    /* Facilities gives its photo a touch more width than the fleet section's own even split
       (the completion pass's composition fix, manifest item 9a) and, since the fix below, fills
       the row's full height rather than top-aligning at its own natural 2:1 shape (Geoff's
       live-page finding, 2026-07-07: a top-aligned fixed-ratio photo left a tall empty region
       under it beside the taller amenity list). `align-items: stretch` overrides the row's own
       inline `items-center` utility (this unlayered scoped rule already outranks any Tailwind
       utility class regardless of specificity, the same mechanism the prior `align-items: start`
       relied on), so the figure's cross-size matches the list column's own height. */
    .facilities-row {
      grid-template-columns: 1.08fr 1fr;
      align-items: stretch;
    }
    /* Cancels the generic `.panel-figure` aspect-ratio so the stretched cross-size (above) can
       actually take effect: with both dimensions definite (the grid track's width, the stretched
       row's height), the browser has nothing left for `aspect-ratio` to resolve, and the img's own
       `object-fit: cover` crops the source photo to fill that box exactly. */
    .facilities-row .panel-figure {
      aspect-ratio: auto;
      height: 100%;
    }
    /* Our fleet's own row (the owner-round-2 fix, 2026-07-07): an even split, unlike Facilities'
       1.08fr (which compensates for that section's own photo-first reorder; Fleet keeps DOM order,
       list then photo, so no compensation is needed). The same stretch-to-match-height trick
       balances the list and photo columns' heights; see `.fleet-photo`'s own comment for why full
       image height is exactly what "no beheaded masts" needs here, unlike Facilities' need to
       actually crop vertically. */
    .fleet-row {
      align-items: stretch;
    }
    .fleet-row .panel-figure {
      aspect-ratio: auto;
      height: 100%;
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
     two of visual overlap into the line above/below aside. The Fleet and Facilities "Learn about
     ..." links share this class too (added by the design-scale audit, 2026-07-07), the same
     UI-link family as the class's other five users. `font-size` joins that family here rather than
     on `.news-card` alone: every arrow link on the page had been rendering at the browser's own
     default 1rem (16px), a stray the audit caught, with no token backing it at all. */
  .arrow-link {
    padding-block: 0.3rem;
    font-size: var(--text-step--1);
  }

  @media (prefers-reduced-motion: reduce) {
    .cta-btn,
    .ghost-btn,
    .news-card {
      transition: none;
    }
  }
</style>
