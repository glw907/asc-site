<!-- @component
The events-redesign pass: one event or class hanging off the season spine (`EventsListing.svelte`)
— a uniform, quiet compact row: a tabular-nums date block, the event's name (linking to its own
`/events/[id]` page), a category chip, an availability chip when meaningful, and a one-line
truncated description. Its marker dot sits ON the spine line (`.spine-marker`, positioned via the
shared `--spine-content-gap` custom property the parent `.spine` declares); a class or clinic gets
the established gold marker (`--color-star-gold-dot`), the same vocabulary the home page's Season
band and the C7 taxonomy already use, with the matching sr-only text for a screen reader.

The category and availability chips (2026-07-15 shared-components pass) are the same two classes
`ClassSchedule.svelte`'s status cell uses (`.asc-category-chip`/`.asc-availability-chip` in
`asc-components.css`), so both event surfaces read as one vocabulary: category is a colored dot
(or the gold star glyph for a class/clinic) plus a small-caps label, and availability is a
separate, deliberately uncolored outline chip, never sharing the category's slot. -->
<script lang="ts">
  import type { EventCard } from '$theme/events-data';

  let {
    event,
    showTypeBadge = true,
  }: {
    event: EventCard;
    showTypeBadge?: boolean;
  } = $props();
</script>

<div class="spine-row" id={event.routeId}>
  <span class="spine-marker" class:spine-marker--class={event.dot} aria-hidden="true"></span>
  {#if event.dot}<span class="sr-only">Class or clinic: </span>{/if}

  <div class="spine-row-date">{event.dateDisplay}</div>

  <div class="spine-row-content">
    <div class="spine-row-title-line">
      <a href="/events/{event.routeId}" class="spine-row-title">{event.title}</a>
      {#if showTypeBadge}
        <span class="spine-chip asc-category-chip">
          {#if event.dotKind === 'class'}
            <span class="asc-category-mark asc-category-mark--star" aria-hidden="true">★</span>
          {:else if event.dotKind}
            <span class="asc-category-mark asc-category-mark--{event.dotKind}" aria-hidden="true"></span>
          {/if}
          <span class="asc-category-label">{event.typeLabel}</span>
        </span>
      {/if}
      {#if event.registrationStatusLabel}
        <span class="spine-chip asc-availability-chip">{event.registrationStatusLabel}</span>
      {/if}
    </div>
    {#if event.summary}
      <p class="spine-row-summary">{event.summary}</p>
    {/if}
  </div>
</div>

<style>
  .spine-row {
    position: relative;
    /* One token step tighter than the prior --spacing-2xs, matching ClassSchedule.svelte's
       row-padding treatment. */
    padding: var(--spacing-3xs) 0;
    scroll-margin-top: 6rem;
  }

  .spine-marker {
    position: absolute;
    top: 0.65em;
    left: calc(-1 * var(--spine-content-gap) - 0.25rem);
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--color-card-border);
  }
  .spine-marker--class {
    background: var(--color-star-gold-dot);
  }

  .spine-row-content {
    min-width: 0;
  }
  .spine-row-title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-2xs);
  }
  .spine-row-title {
    font-family: var(--font-display);
    /* Row hierarchy comes from weight and ink, not size, so the title steps down to the
       component-body register alongside the date below. */
    font-size: var(--text-step--1);
    font-weight: 600;
    color: var(--color-base-content);
    text-decoration: none;
  }
  .spine-row-title:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .spine-row-title:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Layout only: the chip's own look (color, border, radius) comes from the shared
     `.asc-category-chip`/`.asc-availability-chip` classes in asc-components.css. */
  .spine-chip {
    flex-shrink: 0;
  }

  .spine-row-summary {
    margin: 0.15rem 0 0;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }

  /* Desktop: the date block sits to the left of the row content, tabular-nums so the digits align
     down the column. Below the narrow breakpoint (the spine's own `--spine-line-x` shrink) the
     date drops above the title instead, a composed stack rather than a cramped two-column squeeze. */
  .spine-row {
    display: grid;
    grid-template-columns: 4.75rem 1fr;
    column-gap: var(--spacing-s);
    align-items: baseline;
  }
  .spine-row-date {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }

  @media (max-width: 30rem) {
    .spine-row {
      grid-template-columns: 1fr;
      row-gap: 0.15rem;
    }
    .spine-row-date {
      font-size: var(--text-step--2);
    }
  }
</style>
