<!-- @component
The events deep-look pass: the full `/events` calendar (docs/events-manifest.md), built from
`$theme/events-data.ts`'s grouped data. A TOC of jump links (only a populated section gets one),
then one alternating-band section per populated month with the full-detail card variant, then
Off-Season and Meetings & Governance in the compact variant (no image; Meetings also drops the
type badge, since the section heading already names it). A genuinely empty calendar (every table
read came back with nothing visible) shows one honest line instead of a silent blank page, the one
deliberate addition over the live page's own untested empty state. -->
<script lang="ts">
  import type { EventsPageData } from '$theme/events-data';
  import { OFF_SEASON_ID, MEETINGS_ID } from '$theme/events-data';
  import EventCard from './EventCard.svelte';

  let { events }: { events: EventsPageData } = $props();
</script>

{#if events.isEmpty}
  <p class="events-empty text-muted">No events are on the calendar right now. Check back soon.</p>
{:else}
  {#if events.tocLinks.length > 0}
    <nav class="events-toc" aria-label="Jump to a section of the calendar">
      {#each events.tocLinks as link (link.href)}
        <a href={link.href} class="events-toc-link">{link.label}</a>
      {/each}
    </nav>
  {/if}

  {#each events.monthSections as section, i (section.id)}
    <section id="section-{section.id}" class="events-band" class:events-band--alt={i % 2 === 1}>
      <h2 class="events-band-title">{section.label}</h2>
      <div class="events-grid">
        {#each section.events as event (event.slug)}
          <EventCard {event} variant="full" />
        {/each}
      </div>
    </section>
  {/each}

  {#if events.offSeason.length > 0}
    <section id="section-{OFF_SEASON_ID}" class="events-band" class:events-band--alt={events.monthSections.length % 2 === 1}>
      <h2 class="events-band-title">Off-Season</h2>
      <div class="events-compact-list">
        {#each events.offSeason as event (event.slug)}
          <EventCard {event} variant="compact" />
        {/each}
      </div>
    </section>
  {/if}

  {#if events.meetings.length > 0}
    <section id="section-{MEETINGS_ID}" class="events-band events-band--meetings">
      <h3 class="events-band-title events-band-title--subordinate">Meetings &amp; Governance</h3>
      <div class="events-compact-list">
        {#each events.meetings as event (event.slug)}
          <EventCard {event} variant="compact" showTypeBadge={false} />
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  .events-empty {
    padding: var(--spacing-m) 0;
  }

  .events-toc {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2xs) var(--spacing-m);
    padding: var(--spacing-xs) 0 var(--spacing-m);
  }
  .events-toc-link {
    font-family: var(--font-display);
    font-size: var(--text-step-1);
    font-weight: 300;
    color: var(--color-muted);
    text-decoration: none;
  }
  .events-toc-link:hover {
    color: var(--color-base-content);
  }

  .events-band {
    padding: var(--spacing-l) 0;
    border-top: var(--border) solid var(--color-card-border);
  }
  .events-band--alt {
    background: var(--color-base-200);
    margin-inline: calc(var(--spacing-m) * -1);
    padding-inline: var(--spacing-m);
    border-radius: var(--radius-box);
  }
  .events-band--meetings {
    border-top: var(--border) solid var(--color-card-border);
  }
  .events-band-title {
    margin: 0 0 var(--spacing-m);
    font-family: var(--font-display);
    font-weight: 300;
    font-size: var(--text-step-4);
    color: var(--color-muted);
  }
  .events-band-title--subordinate {
    font-size: var(--text-step--1);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .events-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--spacing-m);
  }
  .events-compact-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-s);
  }

  /* The family's 900px collapse threshold: two columns of full event cards above it. */
  @media (min-width: 56.25rem) {
    .events-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
