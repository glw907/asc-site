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
  /* The quiet link idiom (navy, underline only on hover), the same affordance every other
     cross-page link on the site carries, in place of a muted gray with no underline at any
     state, which read as inert text rather than a jump link. */
  .events-toc-link {
    font-family: var(--font-display);
    font-size: var(--text-step-1);
    font-weight: 300;
    color: var(--color-primary);
    text-decoration: none;
  }
  .events-toc-link:hover {
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, var(--color-primary) 35%, transparent);
    text-underline-offset: 3px;
  }
  .events-toc-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
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
  /* The line used to run the full height of `.spine` (`top: 0; bottom: 0`), overshooting past
     both the first waypoint marker's own top offset and the last row's marker, into that row's
     own trailing padding and description text. `top` now starts
     exactly at the first waypoint marker's vertical center (its own `top: 0.5em` plus half its
     0.75rem diameter); the tail past the last row's marker is erased below, since a marker's own
     vertical offset is a fixed, content-independent value but the LAST row's total height is not
     (a longer description wraps to more lines), so trimming the far end from this side alone isn't
     expressible in one static value. */
  .spine::before {
    content: '';
    position: absolute;
    top: calc(0.5em + 0.375rem);
    bottom: 0;
    left: var(--spine-line-x);
    width: 1px;
    background: var(--color-card-border);
  }
  /* Erases the line's tail below the last row's own marker center, from that row's own box
     (`.spine-row`, rendered by the child `SpineRow.svelte` component, reached with `:global()`):
     positioning relative to the row's own top edge, rather than `.spine`'s, keeps this correct
     regardless of the row's own content-driven height. The left offset mirrors `.spine-marker`'s
     own centering math in SpineRow.svelte (`-(content-gap)`, the line's x position expressed in
     the row's local coordinate space, offset from `.spine`'s padding-box by that same gap). Painted
     in the page's own ground color, matching every card/band surface `.spine` ever sits on. */
  :global(.spine-row:last-child)::after {
    content: '';
    position: absolute;
    top: calc(0.65em + 0.25rem);
    bottom: 0;
    left: calc(-1 * var(--spine-content-gap));
    width: 1px;
    background: var(--color-base-100);
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
