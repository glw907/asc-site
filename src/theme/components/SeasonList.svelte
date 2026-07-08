<!-- @component
The Season listing: one printed race-calendar, month-grouped (round-3 design review, 2026-07-07,
replacing the C7-gold recipe's original per-tier CSS-multicol build). Geoff's live-review verdict
on the prior build was a gestalt one ("at a casual glance, the whole section feels messy and
disorganized"), diagnosed as two compounding causes: font-treatment category coding (a `muted`
grey ink for every non-racing, non-class row) that read as an accidentally weaker row rather than
a deliberate marker, and CSS multi-column layout, whose column-balance is opaque and unpredictable
against a real, unevenly-sized club calendar (the very thing that read "ragged"). This rebuild
answers both: every event name shares one body-scale, full-ink treatment (`SeasonDotKind` moves
ALL category emphasis into the dot slot, see `$theme/season-data.ts`'s header comment), and every
row grid, the type scale, and the dot system stay exactly this shape, never CSS multi-column, so
no row can ever land in the wrong visual month or an uneven column.

Round-4 addendum (2026-07-07): the single column, while never disorganized, made the section a
scroll marathon ("The Season Keeps Going", Geoff's own read). `$theme/season-data.ts`'s
`splitSeasonColumns` balances the SAME month groups (never split across columns, and never
reordered) into a deliberate two-column pair by total row count, a plain, predictable prefix
split, not the CSS-multicolumn approach ruled out above (that rejection was about `columns:` own
opaque per-row wrapping; this is a whole-month decision made once in script). The two-column grid
below only ever applies at the family's 900px two-column breakpoint; below it, both returned
arrays render stacked in their own original order, so the calendar is visually identical to the
single-column build at narrow widths.

Shared by the home page's Season section and the dedicated /events page (`$theme/season-data.ts`
supplies both with the same live D1 read). Each event's name links to its own `/events/[id]` page,
the same `routeId` the full listing's spine rows and the per-event page itself resolve on. -->
<script lang="ts">
  import { splitSeasonColumns, type SeasonMonth, type SeasonDotKind } from '$theme/season-data';

  let { months }: { months: SeasonMonth[] } = $props();

  const columns = $derived(splitSeasonColumns(months));

  /** The dot's screen-reader label, since the dot itself is `aria-hidden` (color is never the
   *  only channel carrying its meaning). */
  const DOT_LABEL: Record<SeasonDotKind, string> = {
    class: 'Class or clinic',
    social: 'Social event',
    business: 'Club business',
    racing: 'Racing event',
  };
</script>

{#snippet monthGroup(month: SeasonMonth)}
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
          <a href="/events/{event.routeId}" class="season-link text-base-content">
            {#if event.dot}<span class="sr-only">{DOT_LABEL[event.dot]}: </span>{/if}{event.name}
          </a>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<!-- Filters out an empty column (the split falls back to [months, []] for zero or one month, see
     splitSeasonColumns's own comment): rendering it anyway would add a trailing `row-gap` on the
     stacked mobile tier with nothing after it, an empty gap at the section's own bottom edge. -->
<div class="season-calendar-grid">
  {#each columns.filter((columnMonths) => columnMonths.length > 0) as columnMonths, i (i)}
    <div class="season-column">
      {#each columnMonths as month (month.label)}
        {@render monthGroup(month)}
      {/each}
    </div>
  {/each}
</div>

<style>
  /* One column below the family's 900px two-column breakpoint (matching the site's own
     `.twocol-panel`/`.cols2` convention), two balanced columns above it (round-4 addendum, see
     the header comment): a taller tidy list beats CSS multi-column's opaque, unpredictable
     balance against a real, unevenly-sized club calendar, and splitting by whole months in script
     keeps that same predictability while cutting the band's own scroll length roughly in half. A
     wide `column-gap` (`--spacing-2xl`, the scale's largest token) keeps the two columns clearly
     apart, so no row could ever read as attached across the gutter. */
  .season-calendar-grid {
    display: grid;
    grid-template-columns: 1fr;
    row-gap: var(--spacing-l);
  }
  @media (min-width: 56.25rem) {
    .season-calendar-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--spacing-2xl);
      row-gap: 0;
      align-items: start;
    }
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
  /* The four dot colors (round-5 addendum, 2026-07-07: see their own derivation comments in
     theme.css for why the palette was reworked as a system rather than four independent picks). */
  .season-dot-class {
    background: var(--color-star-gold-dot);
  }
  .season-dot-social {
    background: var(--color-sage-dot);
  }
  .season-dot-business {
    background: var(--color-business-dot);
  }
  .season-dot-racing {
    background: var(--color-racing-dot);
  }
  /* Event names step down one notch (round-5 addendum, 2026-07-07, Geoff's own "slightly too
     large/present" finding): `text-step-0` matched ordinary body copy, reading as more present
     than a printed calendar's own event line should. `text-step--1` (the UI-link family, the same
     token the Season month label and every arrow link already read) restores the calmer read
     while keeping names clearly the row's own lead over `.season-date`'s smaller, quieter
     `text-step--2` below. */
  .season-link {
    font-size: var(--text-step--1);
    text-decoration: none;
  }
  .season-link:hover {
    color: var(--color-primary);
    text-decoration: underline;
  }
</style>
