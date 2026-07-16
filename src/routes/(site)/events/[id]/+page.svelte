<!-- @component
The events-redesign pass: one event or class's own inviting, anchorable home. A hero photo (or
the type-glyph placeholder when the row has none), a facts slab (date, time, location, category,
registration status, a class's fee), the full description, the action zone (a register link, a
class's own signup route, or an honest "opens later" state), a per-event add-to-calendar link, and
quiet prev/next along the season. The category and registration-status facts (2026-07-15 shared-
components pass, conductor addendum) render the same `.asc-category-chip`/`.asc-availability-chip`
vocabulary SpineRow.svelte's season spine already unified on, so a category chip's colored dot (or
gold star for a class/clinic) and a registration status's quiet outline chip read identically on
both event surfaces. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import { ICON_PATHS } from '$theme/markdown/icons';

  let { data }: { data: PageData } = $props();

  // The media placeholder's own background tint (no photo on this event/class); unrelated to the
  // category/registration chips below, which read `dotKind`/`registrationStatusLabel` directly.
  const typeClass = $derived(data.event.dot ? 'type-accent' : data.event.muted ? 'type-muted' : 'type-plain');

  // A registration-status label only ever marks a class or clinic (toEventCard's own rule), so its
  // presence is also how this page tells a class row from a plain event without a second field.
  const isClass = $derived(!!data.event.registrationStatusLabel);
  const registrationOpensLater = $derived(data.event.registrationStatusLabel === 'Not Scheduled');
  const registrationCtaLabel = $derived(
    data.event.registrationStatusKind === 'warning' || data.event.registrationStatusKind === 'error'
      ? 'Join the waitlist →'
      : 'Sign up →',
  );
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<article class="event-detail">
  <div class="event-detail-media">
    {#if data.event.image}
      <img src={data.event.image.url} alt={data.event.image.alt} class="event-detail-photo" />
    {:else}
      <div class="event-detail-placeholder {typeClass}">
        <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d={ICON_PATHS[data.event.typeIcon] ?? ICON_PATHS.sailboat}></path>
        </svg>
      </div>
    {/if}
  </div>

  <h1 class="event-detail-title">{data.event.title}</h1>

  <dl class="event-facts">
    <div class="event-fact">
      <dt>Date</dt>
      <dd class:is-tbd={data.event.isTbd}>{data.event.dateDisplay}</dd>
    </div>
    {#if data.event.timeDisplay}
      <div class="event-fact"><dt>Time</dt><dd>{data.event.timeDisplay}</dd></div>
    {/if}
    {#if data.event.location}
      <div class="event-fact"><dt>Location</dt><dd>{data.event.location}</dd></div>
    {/if}
    <div class="event-fact">
      <dt>Category</dt>
      <dd>
        <span class="asc-category-chip">
          {#if data.event.dotKind === 'class'}
            <span class="asc-category-mark asc-category-mark--star" aria-hidden="true">★</span>
          {:else if data.event.dotKind}
            <span class="asc-category-mark asc-category-mark--{data.event.dotKind}" aria-hidden="true"></span>
          {/if}
          <span class="asc-category-label">{data.event.typeLabel}</span>
        </span>
      </dd>
    </div>
    {#if data.event.registrationStatusLabel}
      <div class="event-fact">
        <dt>Registration</dt>
        <dd><span class="asc-availability-chip">{data.event.registrationStatusLabel}</span></dd>
      </div>
    {/if}
    {#if data.event.fee !== undefined}
      <div class="event-fact"><dt>Fee</dt><dd>${data.event.fee}</dd></div>
    {/if}
  </dl>

  {#if data.event.shortDescription}
    <p class="event-detail-lede">{data.event.shortDescription}</p>
  {/if}
  {#if data.event.longDescriptionHtml}
    <div class="event-detail-body prose">{@html data.event.longDescriptionHtml}</div>
  {/if}

  <div class="event-detail-actions">
    {#if registrationOpensLater}
      <p class="event-detail-registration-note">Registration opens later.</p>
    {:else if isClass}
      <a href={data.event.registrationUrl} class="cta-btn">{registrationCtaLabel}</a>
    {:else if data.event.registrationUrl}
      <a href={data.event.registrationUrl} class="cta-btn">Register &rarr;</a>
    {/if}
    {#if !data.event.isTbd}
      <a href="/events/{data.event.routeId}.ics" class="ics-link">
        <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d={ICON_PATHS['calendar-dots']}></path>
        </svg>
        Add to calendar
      </a>
    {/if}
  </div>

  {#if data.prev || data.next}
    <nav class="event-detail-nav" aria-label="Other events this season">
      {#if data.prev}
        <a href="/events/{data.prev.routeId}" class="event-detail-nav-link event-detail-nav-link--prev">
          &larr; {data.prev.title}
        </a>
      {:else}
        <span></span>
      {/if}
      {#if data.next}
        <a href="/events/{data.next.routeId}" class="event-detail-nav-link event-detail-nav-link--next">
          {data.next.title} &rarr;
        </a>
      {/if}
    </nav>
  {/if}
</article>

<style>
  .event-detail {
    max-width: var(--container-measure);
  }

  .event-detail-media {
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-box);
    overflow: hidden;
    background: var(--color-base-200);
  }
  .event-detail-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .event-detail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .event-detail-placeholder svg {
    width: 4rem;
    height: 4rem;
    opacity: 0.4;
  }
  .event-detail-placeholder.type-accent {
    background: color-mix(in oklab, var(--color-secondary) 14%, var(--color-base-100));
    color: var(--color-secondary);
  }
  .event-detail-placeholder.type-plain {
    background: var(--color-base-200);
    color: var(--color-base-content);
  }
  .event-detail-placeholder.type-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }

  .event-detail-title {
    margin: var(--spacing-m) 0 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: var(--text-step-4);
    line-height: var(--leading-tight);
    color: var(--color-base-content);
  }

  /* The borderless `:::facts` label/value anatomy (asc-components.css's `.asc-fact` rows are the
     idiom this matches, restated locally since this page sits outside `.prose`), replacing the
     bordered card-chrome strip. Two fixed tracks, not `.asc-facts`'s own `minmax(8rem,
     max-content)` label column: this strip's own labels (Date, Location, Category...) are
     uniformly short, and a fixed pair holds steady at every width instead of an auto-fill/
     flex-wrap row that fit two facts per line at some widths and three at others (the 390
     "2-then-3" ragged wrap this fixes). `display: contents` on
     `.event-fact` is the same wrapper-disappears trick `.asc-fact` uses, so `dt`/`dd` sit as direct
     grid items of the `dl`'s own two-column grid while the markup still nests validly. */
  .event-facts {
    margin: var(--spacing-s) 0 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: var(--spacing-m);
  }
  .event-fact {
    display: contents;
  }
  .event-fact dt,
  .event-fact dd {
    padding: var(--spacing-2xs) 0;
    border-top: var(--border) solid var(--color-card-border);
  }
  .event-fact:first-child dt,
  .event-fact:first-child dd {
    border-top: none;
  }
  /* dt/dd share one size (the component-body step, matching the shared-components `:::facts`
     label/value idiom in asc-components.css) and split hierarchy by weight and ink alone, not
     by size. */
  .event-fact dt {
    margin: 0;
    font-size: var(--text-step--1);
    font-weight: 600;
    color: var(--color-muted);
  }
  .event-fact dd {
    margin: 0;
    font-size: var(--text-step--1);
    /* An `em`-relative (not unitless) line-height computes once, off `dd`'s own font-size, and
       inherits to a nested child as that fixed length rather than recomputing against the
       child's own smaller font-size. The Category/Registration
       facts nest a chip at a step down in size (`.asc-category-chip`/`.asc-availability-chip`,
       asc-components.css); without this, that smaller font gave the chip a shorter line box than
       its plain-text siblings (Date, Location, Fee), so its own text baseline sat visibly higher
       in the row. */
    line-height: 1.3em;
    color: var(--color-base-content);
  }
  .event-fact dd.is-tbd {
    color: var(--color-primary);
    font-weight: 600;
  }

  /* Category and availability chip look now come from the shared `.asc-category-chip`/
     `.asc-availability-chip` classes (asc-components.css), the same vocabulary SpineRow.svelte's
     season spine and ClassSchedule.svelte's status cell already use (2026-07-15 shared-
     components pass, conductor addendum). No local chip rules needed here any more. */

  .event-detail-lede {
    margin: var(--spacing-m) 0 0;
    font-size: var(--text-step-1);
    color: var(--color-base-content);
  }
  .event-detail-body {
    margin-top: var(--spacing-s);
  }

  .event-detail-actions {
    margin-top: var(--spacing-l);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-m);
  }
  /* The solid CTA tier (two-tier CTA grammar, ratified 2026-07-15): the same craft recipe as the
     home closing band's `.cta-btn`, using the light-ground shadow variant (asc-components.css's
     `.prose .asc-cta-btn`) since this page's action zone sits on the plain page ground, not navy. */
  .cta-btn {
    display: inline-block;
    background: var(--color-fireweed);
    color: white;
    font-weight: 650;
    font-size: var(--text-step--1);
    padding: 0.625rem 1.375rem;
    border-radius: var(--radius-field);
    text-decoration: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 1px 2px color-mix(in oklab, var(--color-fireweed) 40%, transparent),
      0 4px 12px -6px color-mix(in oklab, var(--color-fireweed) 55%, transparent);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }
  .cta-btn:hover {
    background: color-mix(in oklab, var(--color-fireweed), black 8%);
  }
  /* One step past hover on the same axis (2026-07-15 invisible-polish fix), applied instantly. */
  .cta-btn:active {
    background: color-mix(in oklab, var(--color-fireweed), black 12%);
    transition: none;
  }
  .cta-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  .event-detail-registration-note {
    margin: 0;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  /* The listing's own iconed calendar-link idiom (events/+page.svelte's
     `.calendar-subscribe-link`): an inline glyph beside the text, quieter than the register CTA
     beside it, so both surfaces read as one calendar vocabulary. */
  .ics-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-step--1);
    font-weight: 500;
    color: var(--color-muted);
    text-decoration: none;
  }
  .ics-link svg {
    opacity: 0.7;
  }
  .ics-link:hover svg {
    opacity: 1;
  }
  .ics-link:hover {
    color: var(--color-primary);
  }
  .ics-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .event-detail-nav {
    margin-top: var(--spacing-xl);
    padding-top: var(--spacing-s);
    border-top: var(--border) solid var(--color-card-border);
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-m);
  }
  .event-detail-nav-link {
    font-size: var(--text-step--1);
    color: var(--color-muted);
    text-decoration: none;
    max-width: 40ch;
  }
  .event-detail-nav-link:hover {
    color: var(--color-primary);
  }
  .event-detail-nav-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  .event-detail-nav-link--next {
    text-align: right;
    margin-left: auto;
  }
</style>
