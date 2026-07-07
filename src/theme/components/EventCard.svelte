<!-- @component
The events deep-look pass: one event or class, in either of the two variants the live page's own
re-enumeration found (docs/events-manifest.md). The `full` variant (a month section) shows a real
photo or a type-colored placeholder glyph; the `compact` variant (Off-Season, Meetings &
Governance) never does. `showTypeBadge` is false only for a Meetings & Governance card, where the
section heading itself already names the type. -->
<script lang="ts">
  import type { EventCard as EventCardData } from '$theme/events-data';
  import { ICON_PATHS } from '$theme/markdown/icons';

  let {
    event,
    variant = 'full',
    showTypeBadge = true,
  }: {
    event: EventCardData;
    variant?: 'full' | 'compact';
    showTypeBadge?: boolean;
  } = $props();

  const typeClass = $derived(event.dot ? 'type-accent' : event.muted ? 'type-muted' : 'type-plain');
</script>

<div class="event-card" class:event-card--compact={variant === 'compact'} id={event.slug}>
  {#if variant === 'full'}
    <div class="event-card-media">
      {#if event.image}
        <img src={event.image.url} alt={event.image.alt} loading="lazy" />
      {:else}
        <div class="event-card-placeholder {typeClass}">
          <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d={ICON_PATHS[event.typeIcon] ?? ICON_PATHS.sailboat}></path>
          </svg>
        </div>
      {/if}
    </div>
  {/if}

  <div class="event-card-body">
    <div class="event-card-title-row">
      <h3 class="event-card-title">{event.title}</h3>
      {#if showTypeBadge}
        <span class="event-badge {typeClass}">{event.typeLabel}</span>
      {/if}
      {#if event.registrationStatusLabel}
        <span class="reg-badge reg-badge--{event.registrationStatusKind}">{event.registrationStatusLabel}</span>
      {/if}
    </div>

    <div class="event-card-dateline">
      <span class="event-card-date" class:is-tbd={event.isTbd}>{event.dateDisplay}</span>
      {#if event.location}
        <span class="event-card-sep" aria-hidden="true">&middot;</span>
        <span class="event-card-location">{event.location}</span>
      {/if}
    </div>

    {#if event.shortDescription}
      <p class="event-card-short-desc">{event.shortDescription}</p>
    {/if}
    {#if event.longDescriptionHtml}
      <div class="event-card-long-desc">{@html event.longDescriptionHtml}</div>
    {/if}
    {#if event.registrationUrl}
      <a href={event.registrationUrl} class="event-card-register">Register &rarr;</a>
    {/if}
  </div>
</div>

<style>
  .event-card {
    display: flex;
    flex-direction: column;
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
    background: var(--color-base-100);
    overflow: hidden;
    scroll-margin-top: 6rem;
    transition: box-shadow 0.15s ease;
  }
  .event-card:hover {
    box-shadow: var(--cairn-shadow);
  }
  .event-card--compact {
    padding: var(--spacing-xs) var(--spacing-s);
  }

  .event-card-media {
    aspect-ratio: 3 / 2;
    background: var(--color-base-200);
  }
  .event-card-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .event-card-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .event-card-placeholder svg {
    width: 3rem;
    height: 3rem;
    opacity: 0.4;
  }
  .event-card-placeholder.type-accent {
    background: color-mix(in oklab, var(--color-secondary) 14%, var(--color-base-100));
    color: var(--color-secondary);
  }
  .event-card-placeholder.type-plain {
    background: var(--color-base-200);
    color: var(--color-base-content);
  }
  .event-card-placeholder.type-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }

  .event-card-body {
    padding: var(--spacing-s) var(--spacing-m);
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .event-card--compact .event-card-body {
    padding: 0;
  }

  .event-card-title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-2xs);
    margin-bottom: var(--spacing-3xs);
  }
  .event-card-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-step-0);
    font-weight: 600;
    color: var(--color-base-content);
  }

  .event-badge {
    flex-shrink: 0;
    display: inline-block;
    padding: 0.125rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .event-badge.type-accent {
    background: color-mix(in oklab, var(--color-secondary) 18%, transparent);
    color: color-mix(in oklab, var(--color-secondary) 55%, var(--color-base-content));
  }
  .event-badge.type-plain {
    background: transparent;
    border: 1px solid var(--color-card-border);
    color: var(--color-base-content);
  }
  .event-badge.type-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }

  .reg-badge {
    flex-shrink: 0;
    display: inline-block;
    padding: 0.125rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .reg-badge--success {
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: var(--cairn-success-ink);
  }
  .reg-badge--info {
    background: color-mix(in oklab, var(--color-info) 14%, transparent);
    color: var(--cairn-info-ink);
  }
  .reg-badge--warning {
    background: color-mix(in oklab, var(--color-warning) 18%, transparent);
    color: var(--cairn-warning-ink);
  }
  .reg-badge--error {
    background: color-mix(in oklab, var(--color-error) 14%, transparent);
    color: var(--cairn-error-ink);
  }
  .reg-badge--muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }

  .event-card-dateline {
    font-size: var(--text-step--1);
    color: var(--color-muted);
    margin-bottom: var(--spacing-2xs);
  }
  .event-card-date.is-tbd {
    color: var(--color-primary);
    font-weight: 600;
  }
  .event-card-sep {
    margin: 0 0.35rem;
  }

  .event-card-short-desc {
    margin: 0 0 var(--spacing-2xs);
    font-size: var(--text-step-0);
    color: var(--color-base-content);
  }
  .event-card-long-desc {
    font-size: var(--text-step--1);
    color: var(--color-muted);
    line-height: var(--leading-body);
  }
  .event-card-long-desc :global(p) {
    margin: 0 0 0.6rem;
  }
  .event-card-long-desc :global(p:last-child) {
    margin-bottom: 0;
  }

  .event-card-register {
    display: inline-block;
    margin-top: var(--spacing-2xs);
    font-weight: 600;
    color: var(--color-primary);
    text-decoration: none;
  }
  .event-card-register:hover {
    text-decoration: underline;
  }
</style>
