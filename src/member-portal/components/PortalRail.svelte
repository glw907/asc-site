<!-- @component
The member portal landing's own subordinate rail (mock D lines 1077-1099): Household / Your gear &
moorings / Classes, one type step down from the main column, muted eyebrow-style tile labels, a
fainter hairline, links only, never a button (the design doc's own rail-subordination acceptance
criterion). Portal-scoped and licensed one-time.

The gear & moorings tile is reference-only (docs/design-benchmark/decisions.md's "the gear door"
ruling): it lists the household's current assignments and waitlist positions with no forms at all,
and always carries a "Manage gear & moorings" foot link to `/my-account/gear` (T2b's own page,
which holds the release/request/cancel forms this tile deliberately omits). -->
<script lang="ts">
  import { formatMemberDate } from '$member-auth/lib/format';
  import type { HouseholdAssignmentRow, HouseholdWaitlistRow } from '$member-portal/lib/assets';
  import type { MyClassRow } from '$member-portal/lib/classes';
  import { deriveAssetRows } from '$member-portal/lib/rail-rows';

  let {
    householdName,
    householdMemberCount,
    assignments,
    waitlistEntries,
    myClasses,
  }: {
    householdName: string;
    householdMemberCount: number;
    assignments: HouseholdAssignmentRow[];
    waitlistEntries: HouseholdWaitlistRow[];
    myClasses: MyClassRow[];
  } = $props();

  const assetRows = $derived(deriveAssetRows(assignments, waitlistEntries));

  const classRows = $derived(
    myClasses.map((c) => ({
      id: c.enrollmentId,
      name: c.className,
      detail: c.startDate ? formatMemberDate(c.startDate) : 'Date TBD',
    })),
  );
</script>

<div class="portal-rail-tile">
  <p class="portal-rail-label">Household</p>
  <p class="portal-rail-value">{householdName} · {householdMemberCount} {householdMemberCount === 1 ? 'member' : 'members'}</p>
</div>

<div class="portal-rail-tile">
  <p class="portal-rail-label">Your gear &amp; moorings</p>
  {#if assetRows.length > 0}
    <ul class="portal-rail-list">
      {#each assetRows as row (row.id)}
        <li class="portal-rail-item">
          <span class="portal-rail-item-name">{row.name}</span>
          <span class="portal-rail-item-meta">
            {#if row.chip}<span class="portal-rail-chip">{row.chip}</span>{/if}
            {#if row.detail}<span>{row.detail}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="portal-rail-empty">You hold no gear or moorings yet.</p>
  {/if}
  <p class="portal-rail-foot">
    <a href="/my-account/gear" class="text-primary underline-offset-2 hover:underline">Manage gear &amp; moorings</a>
  </p>
</div>

<div class="portal-rail-tile">
  <p class="portal-rail-label">Classes</p>
  {#if classRows.length > 0}
    <ul class="portal-rail-list">
      {#each classRows as row (row.id)}
        <li class="portal-rail-item">
          <span class="portal-rail-item-name">{row.name}</span>
          <span class="portal-rail-item-meta"><span>{row.detail}</span></span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="portal-rail-empty">
      No classes this season. <a href="/my-account/classes" class="text-primary underline-offset-2 hover:underline">See what's coming</a>
    </p>
  {/if}
</div>

<style>
  /* Ported from mock D's own `.mockD-rail-tile` (portal-directions.html L601-617): a fainter
     hairline than the main column's own card border, and generous internal padding, so the tile
     reads as reference material rather than a peer card. */
  .portal-rail-tile {
    background: var(--color-base-100);
    border: 1px solid color-mix(in oklab, var(--color-card-border) 65%, transparent);
    border-radius: var(--radius-box);
    padding: var(--spacing-m);
  }
  .portal-rail-tile + .portal-rail-tile {
    margin-top: var(--spacing-s);
  }

  /* One type step down from the main column (`--text-step--2`, not the main column's own
     `--text-step--1`/`--text-step-0`), a muted eyebrow-style label rather than the main column's
     own plain small label -- the rail-subordination acceptance criterion. */
  .portal-rail-label {
    margin: 0 0 var(--spacing-2xs);
    font-size: var(--text-step--2);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .portal-rail-value,
  .portal-rail-empty {
    margin: 0;
    font-size: var(--text-step--1);
    color: var(--color-base-content);
  }
  .portal-rail-empty {
    color: var(--color-muted);
  }
  .portal-rail-foot {
    margin: var(--spacing-2xs) 0 0;
    font-size: var(--text-step--2);
  }

  .portal-rail-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .portal-rail-item {
    padding: var(--spacing-2xs) 0;
    border-top: 1px solid color-mix(in oklab, var(--color-card-border) 65%, transparent);
  }
  .portal-rail-item:first-child {
    border-top: none;
    padding-top: 0;
  }
  .portal-rail-item-name {
    display: block;
    font-size: var(--text-step--1);
    font-weight: 600;
    color: var(--color-base-content);
  }
  .portal-rail-item-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-2xs);
    margin-top: var(--spacing-3xs);
    font-size: var(--text-step--2);
    color: var(--color-muted);
  }
  .portal-rail-chip {
    display: inline-block;
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in oklab, var(--color-muted) 35%, transparent);
    border-radius: var(--radius-selector);
    font-weight: 600;
    letter-spacing: var(--tracking-eyebrow);
    text-transform: uppercase;
    white-space: nowrap;
  }
</style>
