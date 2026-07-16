<!-- @component
The education page's live class schedule (Geoff's 2026-07-13 ask, mirroring the live site's
table): one row per class in the current season, with dates, a lifecycle status chip, and the
row's own door (Register, Join waitlist) or its human line ("Just show up!" on a drop-in
clinic). Mounted as a `class-schedule` island (markdown/components.ts): the static fallback is
a pointer to the events page, and this component replaces it once mounted, reading through
`getClassSchedule` (class-schedule.remote.ts). While the read is in flight it renders ghost
rows in the final geometry, so the mount never shifts the page. An empty or failed read renders
the same events-page pointer the fallback carries, permanently.

The status chip (2026-07-15 shared-components pass) is the same `.asc-availability-chip` class
`SpineRow.svelte`'s registration-status chip uses (asc-components.css): a quiet outline, no
semantic-palette color, since Open/Full/Completed and every other lifecycle label now read the
same neutral chip rather than a color-per-status vocabulary. -->
<script lang="ts">
  import { getClassSchedule } from '$theme/class-schedule.remote';

  // No props: an index signature (not an empty-object type) keeps this island component
  // assignable to IslandRegistry's Component<Record<string, unknown>> signature.
  let {}: Record<string, unknown> = $props();
</script>

<div class="class-schedule">
  {#await getClassSchedule()}
    <ul class="cs-rows" aria-busy="true" aria-label="Loading the class schedule">
      {#each { length: 5 } as _, i (i)}
        <li class="cs-row" aria-hidden="true">
          <span class="cs-ghost cs-ghost-name"></span>
          <span class="cs-ghost cs-ghost-dates"></span>
          <span class="cs-ghost cs-ghost-chip"></span>
          <span class="cs-ghost cs-ghost-action"></span>
        </li>
      {/each}
    </ul>
  {:then schedule}
    {#if schedule.pending}
      <p class="cs-season-note">
        We haven't posted the {schedule.season} class schedule yet. Classes are announced in
        early spring, and registration opens in mid-March.
      </p>
    {:else if schedule.entries.length === 0}
      <p>
        Class dates, openings, and sign-up links live on the
        <a href="/events/">events page</a>.
      </p>
    {:else}
      <ul class="cs-rows">
        {#each schedule.entries as entry (entry.id)}
          <li class="cs-row">
            <span class="cs-name">{entry.name}</span>
            <span class="cs-dates">{entry.dateDisplay}</span>
            <span class="cs-chip asc-availability-chip">{entry.statusLabel}</span>
            {#if entry.action}
              <a class="cs-action" href={entry.action.href}>{entry.action.label}</a>
            {:else if entry.note}
              <span class="cs-note">{entry.note}</span>
            {:else}
              <span class="cs-action" aria-hidden="true"></span>
            {/if}
          </li>
        {/each}
      </ul>
      {#if schedule.seasonComplete}
        <p class="cs-season-note">
          The {schedule.season} class season has wrapped. Registration for next summer opens in
          mid-March.
        </p>
      {/if}
    {/if}
  {:catch}
    <p>
      Class dates, openings, and sign-up links live on the
      <a href="/events/">events page</a>.
    </p>
  {/await}
</div>

<style>
  /* The island mounts inside the page's .prose scope, whose list styling (markers, padding)
     would otherwise reach these rows. */
  .cs-rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .cs-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto minmax(7.5rem, auto);
    grid-template-areas: 'name dates chip action';
    gap: 0.35rem 1rem;
    align-items: baseline;
    /* One step tighter than the row's old 0.6rem literal, moved onto the site's own spacing
       scale so the row rhythm reads off the same tokens as everything around it rather than a
       hand-picked value. */
    padding-block: var(--spacing-2xs);
  }
  .cs-row + .cs-row {
    border-block-start: 1px solid var(--color-card-border);
  }

  .cs-name {
    grid-area: name;
    font-size: var(--text-step--1);
    font-weight: 600;
  }

  .cs-dates {
    grid-area: dates;
    font-size: var(--text-step--1);
    font-variant-numeric: tabular-nums;
    color: var(--color-muted);
    white-space: nowrap;
  }

  /* Layout only: the chip's own look (color, border, radius) comes from the shared
     `.asc-availability-chip` class in asc-components.css. `.cs-row`'s `align-items: baseline`
     measures a grid item's baseline from its own content-box top, so the chip's border and
     padding push its text baseline down past its plain-text siblings (`.cs-name`, `.cs-dates`),
     which carry neither. `align-self: center` opts this one item out of that baseline math and
     centers it on the row instead. */
  .cs-chip {
    grid-area: chip;
    justify-self: start;
    align-self: center;
  }

  .cs-action {
    grid-area: action;
    justify-self: end;
    font-size: var(--text-step--1);
    font-weight: 600;
    white-space: nowrap;
  }

  .cs-note {
    grid-area: action;
    justify-self: end;
    font-size: var(--text-step--1);
    color: var(--color-muted);
    white-space: nowrap;
  }

  .cs-season-note {
    margin: 0.9rem 0 0;
    font-size: var(--text-step--1);
    color: var(--color-muted);
  }

  /* Ghost rows: the same grid in the same geometry, quiet base-200 bars, no motion. */
  .cs-ghost {
    display: inline-block;
    height: 0.9em;
    border-radius: 999px;
    background: var(--color-base-200);
  }
  .cs-ghost-name {
    grid-area: name;
    width: min(14rem, 70%);
  }
  .cs-ghost-dates {
    grid-area: dates;
    width: 4.5rem;
  }
  .cs-ghost-chip {
    grid-area: chip;
    width: 4rem;
  }
  .cs-ghost-action {
    grid-area: action;
    justify-self: end;
    width: 5rem;
  }

  /* Narrow widths: the row composes as two lines (name with its status, then dates with the
     action) instead of a cramped four-column squeeze. */
  @media (max-width: 40rem) {
    .cs-row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'name chip'
        'dates action';
    }
    .cs-chip {
      justify-self: end;
    }
  }
</style>
