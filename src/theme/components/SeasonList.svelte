<!-- @component
The Season listing: one printed race-calendar, month-grouped (round-3 design review, 2026-07-07,
replacing the C7-gold recipe's original per-tier CSS-multicol build). Geoff's live-review verdict
on the prior build was a gestalt one ("at a casual glance, the whole section feels messy and
disorganized"), diagnosed as two compounding causes: font-treatment category coding (a `muted`
grey ink for every non-racing, non-class row) that read as an accidentally weaker row rather than
a deliberate marker, and CSS multi-column layout, whose column-balance is opaque and unpredictable
against a real, unevenly-sized club calendar (the very thing that read "ragged"). This rebuild
answers both: every event name shares one body-scale, full-ink treatment (`SeasonDotKind` moves
ALL category emphasis into the dot slot, see `$theme/season-data.ts`'s header comment), and the
whole calendar is one column at a readable measure, never CSS multi-column, so no row can ever
land in the wrong visual month or an uneven column.

Shared by the home page's Season section and the dedicated /events page (`$theme/season-data.ts`
supplies both with the same live D1 read). Each event's name links to its own `/events/[id]` page,
the same `routeId` the full listing's spine rows and the per-event page itself resolve on. -->
<script lang="ts">
  import type { SeasonMonth, SeasonDotKind } from '$theme/season-data';

  let { months }: { months: SeasonMonth[] } = $props();

  /** The dot's screen-reader label, since the dot itself is `aria-hidden` (color is never the
   *  only channel carrying its meaning). */
  const DOT_LABEL: Record<SeasonDotKind, string> = {
    class: 'Class or clinic',
    social: 'Social event',
    business: 'Club business',
  };
</script>

<div class="season-calendar">
  {#each months as month (month.label)}
    <div class="season-month">
      <div class="season-month-label">
        <span>{month.label}</span>
      </div>
      <div class="season-rows">
        {#each month.events as event (event.routeId)}
          <div class="season-row">
            <span class="season-date">{event.dateRange}</span>
            <span class="season-dot-slot" aria-hidden="true">
              {#if event.dot}<span class="season-dot season-dot-{event.dot}"></span>{/if}
            </span>
            <a href="/events/{event.routeId}" class="season-link text-step-0 text-base-content">
              {#if event.dot}<span class="sr-only">{DOT_LABEL[event.dot]}: </span>{/if}{event.name}
            </a>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  /* One column, always: a taller tidy list beats CSS multi-column's opaque, unpredictable balance
     against a real, unevenly-sized club calendar (see the header comment). Capped to a printed-
     calendar-width measure, narrower than the page's own full band width, so the eye scans a
     single consistent column rather than a wide, sparse-feeling list. */
  .season-calendar {
    max-width: 30rem;
  }

  /* The three-tier grouping hierarchy, tightest to loosest: a date and its own event name (the
     row's own `column-gap`) < one row and the next (`.season-rows`'s `gap`) < one month and the
     next (`.season-month`'s `margin-bottom`, clearly the largest of the three so a month reads as
     a bounded unit, never a row that could be mistaken for belonging to its neighbor). */
  .season-month {
    margin-bottom: var(--spacing-l);
  }
  .season-month:last-child {
    margin-bottom: 0;
  }
  .season-month-label {
    margin-bottom: var(--spacing-2xs);
    padding-bottom: var(--spacing-3xs);
    border-bottom: 1px solid var(--color-card-border);
    font-family: var(--font-display);
    font-size: var(--text-step--1);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    /* Full reading ink, not `--color-muted`: a label that reads weaker than the rows it caps
       fails the "must not read weaker than its rows" requirement. */
    color: var(--color-base-content);
  }
  .season-rows {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3xs);
  }

  /* One row grid, shared by every row in every month: [fixed date column | dot slot | name],
     so every event name's left edge lines up down the whole calendar. The date column's width is
     fixed (not `max-content`, which would size to each row's own text and break the shared edge)
     to the widest realistic range this format produces, "Jun 12–14", measured at the date's own
     `--text-step--2` size. */
  .season-row {
    display: grid;
    grid-template-columns: 4.4rem 0.9rem 1fr;
    column-gap: var(--spacing-2xs);
    align-items: baseline;
  }
  .season-date {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-step--2);
  }
  .season-dot-slot {
    display: inline-flex;
    align-items: center;
    /* Baseline-aligned with the row (see `.season-row`'s `align-items`); nudged up a hair so the
       dot optically centers on the event name's own x-height rather than sitting on its baseline. */
    transform: translateY(-0.35em);
  }
  .season-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
  }
  /* The C7 gold: classes and clinics, mission-first, the club's own sanctioned meaning. Darkened
     off the brand's literal star gold for a >=3:1 mark (see `--color-star-gold-dot`'s own
     derivation comment in theme.css). */
  .season-dot-class {
    background: var(--color-star-gold-dot);
  }
  /* Social events: a sage dot, derived from the club-grounds story's own "building sage" hue
     (theme.css's `--color-sage-dot`) rather than the pale band-tint sage tokens, which read as
     invisible at dot size. */
  .season-dot-social {
    background: var(--color-sage-dot);
  }
  /* Club business (operations, governance): the same slate ink the date column and every other
     quiet caption on the page already reads, so it never introduces a fourth hue. */
  .season-dot-business {
    background: var(--color-muted);
  }
  .season-link {
    text-decoration: none;
  }
  .season-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
</style>
