<!--
@component
The Club section's Members screen (household-grouped list, Task 4): one row per household (the
design doc's own ruling 1 -- standing and money are household facts by schema, not per-member
ones), replacing the fixture screen's one-row-per-member table. Search/standing/archived filtering
is server-driven (`+page.server.ts`'s own header explains why: a member's email never reaches this
component, only the store's precomputed `matchedSearch` flag on the chip that matched), so every
control push here is a `goto` that reloads `data.households` rather than a client-side re-filter;
pagination alone stays client-side over that already-filtered set, the same load-once-page-in-
memory shape the Events/Classes screens use. The standing badge, tier/amount (comped and
discounted rendered honestly), asset count (with a stale-asset warning mark), and member chips
(primary marked, a search-matched chip highlighted) all follow the design doc's Members section.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { SelectField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatDollars } from '$admin-club/lib/ui';
  import { STANDING_CHIP } from '$admin-club/lib/member-format';
  import type { HouseholdListRow } from '$admin-club/lib/households-store';

  let { data }: { data: PageData } = $props();

  const PAGE_SIZE = 10;

  const segmentOptions = [
    { value: 'all', label: 'All active' },
    { value: 'current', label: STANDING_CHIP.current.label },
    { value: 'lapsed', label: 'Not current' },
  ];

  // Seeded once from the URL `load` already parsed; every later change flows the other way (this
  // state pushes a new URL via `pushFilters`, not the reverse), so `untrack` here is deliberate,
  // not a missed dependency (mirrors the Assets screen's own `untrack(() => data.assetTypes[0]...)`
  // seed).
  let searchQuery = $state(untrack(() => data.search));
  let segmentFilter = $state(untrack(() => data.segment));
  let includeArchived = $state(untrack(() => data.includeArchived));
  let page = $state(1);

  /** Push the current filter state into the URL (a `goto`, not a form submit): SvelteKit re-runs
   *  `+page.server.ts`'s `load` and swaps in the new `data.households` without a full page
   *  reload. `keepFocus` matters for the search box, which calls this on every keystroke via the
   *  debounce below. */
  function pushFilters() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (segmentFilter !== 'all') params.set('segment', segmentFilter);
    if (includeArchived) params.set('archived', '1');
    const query = params.toString();
    goto(query ? `?${query}` : '?', { replaceState: true, keepFocus: true, noScroll: true, invalidateAll: true });
  }

  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  function onSearchInput() {
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(pushFilters, 300);
  }

  // The standing select and the archived checkbox are discrete controls (no debounce needed);
  // `SelectField` wraps a plain `bind:value` with no `onchange` passthrough, so this effect is
  // the only way to react to it. `skipFirstRun` keeps the initial mount (local state already
  // matches the URL `load` produced) from firing a redundant `goto`.
  let skipFirstRun = true;
  $effect(() => {
    segmentFilter;
    includeArchived;
    if (skipFirstRun) {
      skipFirstRun = false;
      return;
    }
    clearTimeout(debounceHandle);
    pushFilters();
  });

  // Any filter change can strand the current page past the new result count, so every reload
  // resets to page 1 rather than showing an empty page with real rows still above it.
  $effect(() => {
    data.households;
    page = 1;
  });

  const totalMembers = $derived(data.households.reduce((sum, row) => sum + row.members.length, 0));
  const totalPages = $derived(Math.max(1, Math.ceil(data.households.length / PAGE_SIZE)));
  const pageStart = $derived((page - 1) * PAGE_SIZE);
  const paged = $derived(data.households.slice(pageStart, pageStart + PAGE_SIZE));

  const subtitle = $derived(
    `${totalMembers} ${totalMembers === 1 ? 'member' : 'members'} across ${data.households.length} ${data.households.length === 1 ? 'household' : 'households'}.`,
  );

  function standingLabel(row: HouseholdListRow): string {
    const chip = STANDING_CHIP[row.standing];
    return row.standing === 'lapsed' && row.lastSeason ? `${chip.label} — last ${row.lastSeason}` : chip.label;
  }
</script>

<!-- The subtitle carries the total; this mirror announces filter/page changes to assistive tech
     without re-reading the whole table, the same pattern the Events screen's filter uses. -->
<span class="sr-only" role="status">
  Showing {data.households.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, data.households.length)} of {data.households.length} households
</span>

<OfficeList eyebrow="Club" title="Members" {subtitle}>
  {#snippet action()}
    <div class="flex flex-wrap items-center gap-4">
      <input
        type="search"
        class="input input-sm w-48"
        placeholder="Search name or email"
        aria-label="Search households by name, member name, or email"
        bind:value={searchQuery}
        oninput={onSearchInput}
      />
      <SelectField label="Standing" name="segment" bind:value={segmentFilter} options={segmentOptions} />
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <input type="checkbox" class="checkbox checkbox-sm" bind:checked={includeArchived} />
        Include archived
      </label>
    </div>
  {/snippet}
  {#if data.error}
    <p class="px-6 py-10 text-center text-sm text-warning">{data.error}</p>
  {:else}
    <table class="table">
      <caption class="sr-only">Club households, searchable and filterable by standing, archived households hidden by default</caption>
      <thead>
        <tr>
          <th class={HEADER_CELL}>Household</th>
          <th class="{HEADER_CELL} w-40">Standing</th>
          <th class="{HEADER_CELL} w-40">Tier &amp; amount</th>
          <th class="{HEADER_CELL} w-24">Assets</th>
          <th class={HEADER_CELL}>Members</th>
        </tr>
      </thead>
      <tbody>
        {#each paged as row (row.id)}
          {@const standing = STANDING_CHIP[row.standing]}
          <tr class="transition-colors hover:bg-base-200/60">
            <td>
              <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.id}`}>
                {row.name}
              </a>
              {#if row.city}<p class="text-xs text-muted">{row.city}</p>{/if}
            </td>
            <td><span class="badge {standing.cls}">{standingLabel(row)}</span></td>
            <td class="text-sm">
              {#if row.tier}
                <p>{formatDollars(row.amount)}</p>
                {#if row.comped}
                  <p class="text-xs text-warning">Comp</p>
                {:else if row.discounted}
                  <p class="text-xs text-warning">Discounted</p>
                {/if}
              {:else}
                <span class="text-muted">—</span>
              {/if}
            </td>
            <td class="text-sm">
              {#if row.activeAssets > 0}
                <span class="badge badge-sm {row.staleAssets ? 'border-transparent bg-warning/15 font-medium text-warning-content' : 'badge-ghost font-medium'}">
                  {row.activeAssets}{row.staleAssets ? ' !' : ''}
                </span>
              {:else}
                <span class="text-muted">—</span>
              {/if}
            </td>
            <td>
              <div class="flex flex-wrap gap-1">
                {#each row.members as member (member.id)}
                  <span
                    class="badge badge-sm font-medium {member.matchedSearch ? 'border-transparent bg-primary/10 text-primary' : 'badge-ghost'} {member.archived ? 'opacity-50' : ''}"
                  >
                    {member.name}{member.isPrimary ? ' ★' : ''}
                  </span>
                {/each}
              </div>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">
              No households match that search.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if totalPages > 1}
      <div class="flex items-center justify-between border-t border-[var(--cairn-card-border)] px-6 py-3">
        <span class="text-sm text-muted">Page {page} of {totalPages}</span>
        <div class="join">
          <button
            type="button"
            class="join-item btn btn-sm"
            disabled={page <= 1}
            onclick={() => (page -= 1)}
          >
            Prev
          </button>
          <button
            type="button"
            class="join-item btn btn-sm"
            disabled={page >= totalPages}
            onclick={() => (page += 1)}
          >
            Next
          </button>
        </div>
      </div>
    {/if}
  {/if}
</OfficeList>
