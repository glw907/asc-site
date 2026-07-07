<!-- @component
The Season listing (the C7-gold recipe): month-grouped events with the gold dot marking a class
or clinic and the quieter ink marking a routine, non-racing entry. Shared by the home page's
Season section and the dedicated /events page (`$theme/season-data.ts` supplies both with the
same live D1 read); markup and styling are unchanged from Task 3's static home template, just
factored out for the second caller. Each event's name links to its own `/events/[id]` page (the
events-redesign pass), the same `routeId` the full listing's spine rows and the per-event page
itself resolve on. -->
<script lang="ts">
  import type { SeasonMonth } from '$theme/season-data';

  let { months }: { months: SeasonMonth[] } = $props();
</script>

<div class="season-columns">
  {#each months as month (month.label)}
    <div class="season-month">
      <div class="season-month-label">{month.label}</div>
      {#each month.events as event (event.routeId)}
        <div class="season-row">
          <span class="season-date">{event.dateRange}</span>
          <a href="/events/{event.routeId}" class="season-link text-step-0 {event.muted ? 'text-muted' : 'text-base-content'}">
            {#if event.dot}<span class="season-dot mr-[0.5rem] inline-block align-middle" aria-hidden="true"
              ></span><span class="sr-only">Class or clinic: </span>{/if}{event.name}
          </a>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  /* The Season's gold accent dot (C7): spends no hue on event names, marks a class or clinic only.
     `--color-star-gold-dot` (not `--color-secondary` itself) is the darkened, >=3:1-on-white gold
     the completion pass's contrast fix introduced (theme.css carries the derivation); the sibling
     `sr-only` span in the markup above carries the same "class or clinic" meaning for a screen
     reader, since the dot itself is `aria-hidden`. */
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-star-gold-dot);
    vertical-align: 1px;
  }
  .season-columns {
    columns: 1;
  }
  .season-month {
    break-inside: avoid;
    margin-bottom: 1.8rem;
  }
  .season-month-label {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-base-content);
    margin: 0 0 0.5rem;
  }
  .season-row {
    display: grid;
    grid-template-columns: 5.8rem 1fr;
    align-items: baseline;
    padding: 0.18rem 0;
  }
  .season-date {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-step--2);
  }
  .season-link {
    text-decoration: none;
  }
  .season-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }

  /* The family's 900px collapse threshold (the north star's own breakpoint): two columns above it. */
  @media (min-width: 56.25rem) {
    .season-columns {
      columns: 2;
      column-gap: 5rem;
    }
  }
</style>
