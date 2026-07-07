<!--
@component
The Club section's Members screen (Part B). Designed for the club's real scale (roughly 180
members across a hundred households, per demo-members.ts's own header comment), not just the
readable ~20-member sample this pass ships: search and pagination are load-bearing here, not
decorative, so both actually work over the sample data rather than silently no-opping at this
size. One row per member, with the segment chip (the same vocabulary pass 2.3's batch-email
segment sends will read) plus the directory-visibility chip. `archived` members are excluded by
default, matching the segment's own "excluded from every batch by default" rule; the "Include
archived" toggle is the one deliberate way to see them. The name cell links to the detail page,
the same title-links-to-desk-route recipe the engine's own `ConceptList` uses for a content entry.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { SelectField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, formatCivilDate } from '$admin-club/lib/ui';
  import { SEGMENT_CHIP, VISIBILITY_CHIP, PAYMENT_PENDING_LABEL, PAYMENT_PENDING_CLS } from '$admin-club/lib/member-format';

  let { data }: { data: PageData } = $props();

  const PAGE_SIZE = 10;

  // SelectField's value is a plain string (it renders an ordinary <select>), so the filter state
  // stays untyped string rather than narrowed to MemberSegment; the row filter below compares
  // string-to-string, which needs no narrower type to typecheck. 'all' here means "all active"
  // (current + lapsed): archived stays hidden unless includeArchived is checked, regardless of
  // this filter, matching the segment's own default-excluded rule.
  const segmentOptions = [
    { value: 'all', label: 'All active' },
    { value: 'current', label: SEGMENT_CHIP.current.label },
    { value: 'lapsed', label: SEGMENT_CHIP.lapsed.label },
  ];

  let segmentFilter = $state('all');
  let includeArchived = $state(false);
  let searchQuery = $state('');
  let page = $state(1);

  const filtered = $derived(
    data.members.filter((row) => {
      if (row.segment === 'archived' && !includeArchived) return false;
      if (segmentFilter !== 'all' && row.segment !== segmentFilter) return false;
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return row.name.toLowerCase().includes(query) || row.email.toLowerCase().includes(query);
    }),
  );

  // Any filter change can strand the current page past the new result count, so every change
  // resets to page 1 rather than showing an empty page with real rows still above it.
  $effect(() => {
    segmentFilter;
    includeArchived;
    searchQuery;
    page = 1;
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageStart = $derived((page - 1) * PAGE_SIZE);
  const paged = $derived(filtered.slice(pageStart, pageStart + PAGE_SIZE));

  const subtitle = $derived(
    `${data.members.length} ${data.members.length === 1 ? 'member' : 'members'} across ${new Set(data.members.map((row) => row.household)).size} households.`,
  );
</script>

<!-- The subtitle carries the total; this mirror announces filter/page changes to assistive tech
     without re-reading the whole table, the same pattern the Events screen's filter uses. -->
<span class="sr-only" role="status">
  Showing {filtered.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length} members
</span>

<OfficeList eyebrow="Club" title="Members" {subtitle}>
  {#snippet action()}
    <div class="flex flex-wrap items-center gap-4">
      <input
        type="search"
        class="input input-sm w-48"
        placeholder="Search name or email"
        aria-label="Search members by name or email"
        bind:value={searchQuery}
      />
      <SelectField label="Standing" name="segment" bind:value={segmentFilter} options={segmentOptions} />
      <label class="flex items-center gap-1.5 text-sm text-muted">
        <input type="checkbox" class="checkbox checkbox-sm" bind:checked={includeArchived} />
        Include archived
      </label>
    </div>
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club members, searchable and filterable by standing, archived members hidden by default</caption>
    <thead>
      <tr>
        <th class={HEADER_CELL}>Member</th>
        <th class="{HEADER_CELL} w-40">Household</th>
        <th class="{HEADER_CELL} w-40">Standing</th>
        <th class="{HEADER_CELL} w-32">Directory</th>
        <th class="{HEADER_CELL} w-28">Joined</th>
      </tr>
    </thead>
    <tbody>
      {#each paged as row (row.id)}
        {@const segment = SEGMENT_CHIP[row.segment]}
        {@const visibility = VISIBILITY_CHIP[row.directoryVisibility]}
        <tr class="transition-colors hover:bg-base-200/60">
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.id}`}>
              {row.name}
            </a>
          </td>
          <td class="text-sm text-muted">{row.household}</td>
          <td>
            <span class="badge {segment.cls}">{segment.label}</span>
            {#if row.currentSeasonPaymentStatus === 'pending'}
              <span class="ml-1 text-xs {PAYMENT_PENDING_CLS}">{PAYMENT_PENDING_LABEL}</span>
            {/if}
          </td>
          <td><span class="badge {visibility.cls}">{visibility.label}</span></td>
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(row.joined)}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">
            No members match that search.
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
</OfficeList>
