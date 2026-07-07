<!-- @component
The Season listing (the C7-gold recipe): month-grouped events with the gold dot marking a class
or clinic and the quieter ink marking a routine, non-racing entry. Shared by the home page's
Season section and the dedicated /events page (`$theme/season-data.ts` supplies both with the
same live D1 read); markup and styling are unchanged from Task 3's static home template, just
factored out for the second caller. -->
<script lang="ts">
  import type { SeasonMonth } from '$theme/season-data';

  let { months }: { months: SeasonMonth[] } = $props();
</script>

<div class="season-columns">
  {#each months as month (month.label)}
    <div class="season-month">
      <div class="season-month-label">{month.label}</div>
      {#each month.events as event (event.dateRange + event.name)}
        <div class="season-row">
          <span class="season-date">{event.dateRange}</span>
          <span class={event.muted ? 'text-muted' : 'text-base-content'}>
            {#if event.dot}<span class="season-dot mr-[0.5rem] inline-block align-middle"></span>{/if}{event.name}
          </span>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  /* The Season's gold accent dot (C7): spends no hue on event names, marks a class or clinic only. */
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--color-secondary);
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
    font-size: 0.9rem;
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
    font-size: 0.85rem;
  }

  /* The family's 900px collapse threshold (the north star's own breakpoint): two columns above it. */
  @media (min-width: 56.25rem) {
    .season-columns {
      columns: 2;
      column-gap: 5rem;
    }
  }
</style>
