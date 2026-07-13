<!-- @component
The events deep-look pass: the "events" content entry's own editorial intro (ordinary cairn
markdown, rendered through the same plumbing (site)/[...path] uses), a calendar-subscribe bar
(the real iCal/Apple and Google Calendar links, both reading the live `/events/calendar.ics`
feed), then the full club calendar (`$theme/events-data.ts`, `EventsListing.svelte`) against
docs/events-manifest.md's re-enumeration of the live page: month sections, Off-Season, and
Meetings & Governance, each event or class carrying its type and registration-status badges,
description, and register link. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import EventsListing from '$theme/components/EventsListing.svelte';

  let { data }: { data: PageData } = $props();

  // Hardened the same way the [...path] template reads `promise`: hand-editable frontmatter, so
  // a whitespace-only or non-string value counts as absent and the plain title h1 renders.
  const promise = $derived.by(() => {
    const raw = data.entry.frontmatter.promise;
    return typeof raw === 'string' ? raw.trim() : '';
  });
</script>

<CairnHead seo={data.seo} titleTemplate={(title) => `${title} — ${siteConfig.siteName}`} />

<article class="prose">
  {#if promise}
    <!-- The light promise hero (the page-template pass): Events is a primary-nav destination, so
         it opens with the same eyebrow-plus-promise header the [...path] template's light variant
         gives Contact, mirrored locally because this dedicated route never passes through that
         template. The typography below matches `.promise-hero-eyebrow`/`.promise-hero-title`
         there; the calendar keeps its own composition (the listing's month waypoints already
         carry the spine's gold marks, so no prose-h2 tier rule belongs here). -->
    <header class="events-hero not-prose">
      <p class="events-hero-eyebrow">{data.entry.title}</p>
      <h1 class="events-hero-title">{promise}</h1>
    </header>
  {:else}
    <h1>{data.entry.title}</h1>
  {/if}
  {@html data.html}
</article>

<div class="calendar-subscribe">
  <span class="calendar-subscribe-label">Add to your calendar</span>
  <div class="calendar-subscribe-row">
    <a href={data.webcalUrl} class="calendar-subscribe-link">
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path
          d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z"
        ></path>
      </svg>
      iCal / Apple
    </a>
    <a href={data.googleCalendarUrl} class="calendar-subscribe-link" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
        <path
          d="M224,128a96,96,0,1,1-21.95-61.09,8,8,0,1,1-12.33,10.18A80,80,0,1,0,207.6,136H128a8,8,0,0,1,0-16h88A8,8,0,0,1,224,128Z"
        ></path>
      </svg>
      Google Calendar
    </a>
  </div>
</div>

<section class="events-season">
  <EventsListing events={data.events} />
</section>

<style>
  /* The light promise hero's pair of type roles, matched declaration-for-declaration to the
     [...path] template's `.promise-hero-eyebrow`/`.promise-hero-title` so the two light variants
     read as one device. Consolidate into a shared component if a third consumer appears. */
  .events-hero-eyebrow {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-eyebrow);
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  .events-hero-title {
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
  .events-hero {
    margin-bottom: var(--spacing-m);
  }

  .calendar-subscribe {
    margin-top: var(--spacing-m);
    padding-top: var(--spacing-xs);
    border-top: var(--border) solid var(--color-card-border);
  }
  .calendar-subscribe-label {
    display: block;
    font-size: var(--text-step--1);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted);
    margin-bottom: 0.4rem;
  }
  .calendar-subscribe-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem var(--spacing-m);
  }
  .calendar-subscribe-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-step--1);
    font-weight: 500;
    color: var(--color-muted);
    text-decoration: none;
  }
  .calendar-subscribe-link:hover {
    color: var(--color-primary);
  }
  .calendar-subscribe-link svg {
    opacity: 0.7;
  }
  .calendar-subscribe-link:hover svg {
    opacity: 1;
  }

  .events-season {
    margin-top: var(--spacing-l);
  }
</style>
