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
  /* The band's three-level grouping hierarchy, tightest to loosest (the owner-round-2 fix,
     2026-07-07): a date and its own event name (`.season-row`'s own `column-gap`, below) < one
     event and the next, and the month label and its first event, within one month (this rule's
     `gap`, on the flex column that now carries the label and every row) < one month and the next
     (this rule's own `margin-bottom`). Tightened overall from a flat 1.8rem month gap with no
     finer structure, so the whole calendar reads as one compact schedule (Geoff's live-review
     finding) whose months hold together as visibly distinct chunks (the same Gestalt-proximity fix
     the member directory's own rows use): each tier reads clearly smaller than the one above it,
     `--spacing-3xs` (about 0.3rem) to `--spacing-2xs` (about 0.5rem) to `--spacing-m` (about
     1.6rem). */
  .season-month {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2xs);
    break-inside: avoid;
    margin-bottom: var(--spacing-m);
  }
  .season-month-label {
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-base-content);
    /* Spacing below the label comes from the parent flex column's own `gap` now, at the same
       tier as the row-to-row gap: the label is part of its month's own chunk, not a header sitting
       at arm's length from the events it names. */
    margin: 0;
  }
  /* The date-to-event gap, this hierarchy's tightest tier (`column-gap`, below): the date column
     dropped its old fixed 5.8rem width (sized for the longest realistic range, "May 30–Jun 2", but
     leaving every shorter date sitting in dead space before the name started) for `max-content`,
     so each row's own date text and event name sit snug together as one unit, reading as a single
     entry rather than "two loosely floating fragments" (Geoff's live-review finding). The trade is
     that dates no longer align into a straight scanning column down the month, a fair exchange for
     the tighter pairing. */
  .season-row {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: var(--spacing-3xs);
    align-items: baseline;
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
