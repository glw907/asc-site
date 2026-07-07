<!-- @component
The events-redesign pass: one event or class hanging off the season spine (`EventsListing.svelte`)
— a uniform, quiet compact row: a tabular-nums date block, the event's name (linking to its own
`/events/[id]` page), a category chip, a registration-status chip when meaningful, and a one-line
truncated description. Its marker dot sits ON the spine line (`.spine-marker`, positioned via the
shared `--spine-content-gap` custom property the parent `.spine` declares); a class or clinic gets
the established gold marker (`--color-star-gold-dot`), the same vocabulary the home page's Season
band and the C7 taxonomy already use, with the matching sr-only text for a screen reader. -->
<script lang="ts">
  import type { EventCard } from '$theme/events-data';

  let {
    event,
    showTypeBadge = true,
  }: {
    event: EventCard;
    showTypeBadge?: boolean;
  } = $props();

  const typeClass = $derived(event.dot ? 'type-accent' : event.muted ? 'type-muted' : 'type-plain');
</script>

<div class="spine-row" id={event.routeId}>
  <span class="spine-marker" class:spine-marker--class={event.dot} aria-hidden="true"></span>
  {#if event.dot}<span class="sr-only">Class or clinic: </span>{/if}

  <div class="spine-row-date">{event.dateDisplay}</div>

  <div class="spine-row-content">
    <div class="spine-row-title-line">
      <a href="/events/{event.routeId}" class="spine-row-title">{event.title}</a>
      {#if showTypeBadge}
        <span class="spine-chip {typeClass}">{event.typeLabel}</span>
      {/if}
      {#if event.registrationStatusLabel}
        <span class="spine-chip spine-chip--reg-{event.registrationStatusKind}">{event.registrationStatusLabel}</span>
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
    padding: var(--spacing-2xs) 0;
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
    font-size: var(--text-step-0);
    font-weight: 600;
    color: var(--color-base-content);
    text-decoration: none;
  }
  .spine-row-title:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }

  .spine-chip {
    flex-shrink: 0;
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .spine-chip.type-accent {
    background: color-mix(in oklab, var(--color-secondary) 18%, transparent);
    color: color-mix(in oklab, var(--color-secondary) 55%, var(--color-base-content));
  }
  .spine-chip.type-plain {
    background: transparent;
    border: 1px solid var(--color-card-border);
    color: var(--color-base-content);
  }
  .spine-chip.type-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }
  .spine-chip--reg-success {
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: var(--cairn-success-ink);
  }
  .spine-chip--reg-info {
    background: color-mix(in oklab, var(--color-info) 14%, transparent);
    color: var(--cairn-info-ink);
  }
  .spine-chip--reg-warning {
    background: color-mix(in oklab, var(--color-warning) 18%, transparent);
    color: var(--cairn-warning-ink);
  }
  .spine-chip--reg-error {
    background: color-mix(in oklab, var(--color-error) 14%, transparent);
    color: var(--cairn-error-ink);
  }
  .spine-chip--reg-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
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
