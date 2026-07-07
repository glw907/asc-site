<!-- @component
The events-redesign pass: one event or class's own inviting, anchorable home. A hero photo (or
the type-glyph placeholder when the row has none), a facts slab (date, time, location, category,
registration status, a class's fee), the full description, the action zone (a register link, a
class's own signup route, or an honest "opens later" state), a per-event add-to-calendar link, and
quiet prev/next along the season. -->
<script lang="ts">
  import type { PageData } from './$types';
  import { CairnHead } from '@glw907/cairn-cms/delivery/head';
  import { siteConfig } from '$theme/cairn.config';
  import { ICON_PATHS } from '$theme/markdown/icons';

  let { data }: { data: PageData } = $props();

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
      <dd><span class="event-chip {typeClass}">{data.event.typeLabel}</span></dd>
    </div>
    {#if data.event.registrationStatusLabel}
      <div class="event-fact">
        <dt>Registration</dt>
        <dd><span class="event-chip reg-chip--{data.event.registrationStatusKind}">{data.event.registrationStatusLabel}</span></dd>
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
      <a href="/events/{data.event.routeId}.ics" class="ics-link">Add to calendar</a>
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

  .event-facts {
    margin: var(--spacing-s) 0 0;
    padding: var(--spacing-s) var(--spacing-m);
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs) var(--spacing-l);
    border: var(--border) solid var(--color-card-border);
    border-radius: var(--radius-box);
  }
  .event-fact dt {
    font-size: var(--text-step--2);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-eyebrow);
    color: var(--color-muted);
  }
  .event-fact dd {
    margin: 0.15rem 0 0;
    font-size: var(--text-step-0);
    color: var(--color-base-content);
  }
  .event-fact dd.is-tbd {
    color: var(--color-primary);
    font-weight: 600;
  }

  .event-chip {
    display: inline-block;
    padding: 0.125rem 0.55rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .event-chip.type-accent {
    background: color-mix(in oklab, var(--color-secondary) 18%, transparent);
    color: color-mix(in oklab, var(--color-secondary) 55%, var(--color-base-content));
  }
  .event-chip.type-plain {
    background: transparent;
    border: 1px solid var(--color-card-border);
    color: var(--color-base-content);
  }
  .event-chip.type-muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }
  .reg-chip--success {
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: var(--cairn-success-ink);
  }
  .reg-chip--info {
    background: color-mix(in oklab, var(--color-info) 14%, transparent);
    color: var(--cairn-info-ink);
  }
  .reg-chip--warning {
    background: color-mix(in oklab, var(--color-warning) 18%, transparent);
    color: var(--cairn-warning-ink);
  }
  .reg-chip--error {
    background: color-mix(in oklab, var(--color-error) 14%, transparent);
    color: var(--cairn-error-ink);
  }
  .reg-chip--muted {
    background: var(--color-base-200);
    color: var(--color-muted);
  }

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
  .cta-btn {
    display: inline-block;
    background: var(--color-fireweed);
    color: white;
    font-weight: 650;
    font-size: var(--text-step--1);
    padding: 0.6rem 1.25rem;
    border-radius: var(--radius-field);
    text-decoration: none;
  }
  .cta-btn:hover {
    filter: brightness(1.08);
  }
  .event-detail-registration-note {
    margin: 0;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }
  .ics-link {
    font-size: var(--text-step--1);
    font-weight: 500;
    color: var(--color-muted);
    text-decoration: none;
  }
  .ics-link:hover {
    color: var(--color-primary);
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
  .event-detail-nav-link--next {
    text-align: right;
    margin-left: auto;
  }
</style>
