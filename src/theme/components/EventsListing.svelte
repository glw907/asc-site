<!-- @component
The events-redesign pass: the full `/events` listing as one season spine — a single vertical
timeline line down the page, month waypoints marking it, and each event or class a uniform quiet
row hanging off it (`SpineRow.svelte`). Off-Season and Meetings & Governance close the spine as two
more labeled waypoints, not orphan bordered sections, so the whole calendar reads as one continuous
season rather than a stack of separate cards. A genuinely empty calendar (every table read came
back with nothing visible) shows one honest line instead of a silent blank page. -->
<script lang="ts">
  import type { EventsPageData } from '$theme/events-data';
  import { OFF_SEASON_ID, MEETINGS_ID } from '$theme/events-data';
  import SpineRow from './SpineRow.svelte';

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

  <div class="spine">
    {#each events.monthSections as section (section.id)}
      <div class="spine-waypoint" id="section-{section.id}">
        <span class="spine-waypoint-marker" aria-hidden="true"></span>
        <h2 class="spine-waypoint-label">{section.label}</h2>
      </div>
      {#each section.events as event (event.routeId)}
        <SpineRow {event} />
      {/each}
    {/each}

    {#if events.offSeason.length > 0}
      <div class="spine-waypoint" id="section-{OFF_SEASON_ID}">
        <span class="spine-waypoint-marker" aria-hidden="true"></span>
        <h2 class="spine-waypoint-label">Off-Season</h2>
      </div>
      {#each events.offSeason as event (event.routeId)}
        <SpineRow {event} />
      {/each}
    {/if}

    {#if events.meetings.length > 0}
      <div class="spine-waypoint" id="section-{MEETINGS_ID}">
        <span class="spine-waypoint-marker" aria-hidden="true"></span>
        <h2 class="spine-waypoint-label">Meetings &amp; Governance</h2>
      </div>
      {#each events.meetings as event (event.routeId)}
        <SpineRow {event} showTypeBadge={false} />
      {/each}
    {/if}
  </div>
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

  /* The season spine: one vertical line down the whole listing (`::before`, drawn once on this
     wrapper rather than per-row), with every waypoint and row's own marker positioned off the
     shared `--spine-content-gap` custom property (an inherited CSS variable), so the line's
     horizontal position (`--spine-line-x`) can shrink at a narrow viewport with no change to any
     marker's own math: a marker's offset from its row's left edge is `-(line-to-content gap)`,
     independent of where the line itself sits. */
  .spine {
    --spine-line-x: 0.5rem;
    --spine-content-gap: 1.75rem;
    position: relative;
    padding-left: calc(var(--spine-line-x) + var(--spine-content-gap));
  }
  .spine::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--spine-line-x);
    width: 1px;
    background: var(--color-card-border);
  }

  .spine-waypoint {
    position: relative;
    padding: var(--spacing-m) 0 var(--spacing-2xs);
  }
  .spine-waypoint:first-child {
    padding-top: 0;
  }
  .spine-waypoint-marker {
    position: absolute;
    top: 0.5em;
    left: calc(-1 * var(--spine-content-gap) - 0.1875rem);
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
    background: var(--color-base-100);
    border: 2px solid var(--color-muted);
  }
  .spine-waypoint-label {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 300;
    font-size: var(--text-step-3);
    color: var(--color-muted);
  }

  /* Hugs the left edge at a narrow viewport (390px composure): the line and the marker gap both
     shrink, and every marker's own math (defined off `--spine-content-gap` alone) re-centers with
     no separate override needed. */
  @media (max-width: 30rem) {
    .spine {
      --spine-line-x: 0.2rem;
      --spine-content-gap: 1.15rem;
    }
  }
</style>
