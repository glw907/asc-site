<!--
@component
The Club section's Members screen (Part B): the office-list-shaped table over the pass-2.2
schema preview (`$admin-club/lib/demo-members.ts`), one row per member with the two chips Part B
calls for (season standing, directory visibility). The name cell links to the detail page, the
same title-links-to-desk-route recipe the engine's own `ConceptList` uses for a content entry.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import OfficeList from '$admin-club/lib/OfficeList.svelte';
  import { SelectField } from '$admin-club/lib/fields.js';
  import { STANDING_CHIP, VISIBILITY_CHIP, formatCivilDate } from '$admin-club/lib/member-format';

  let { data }: { data: PageData } = $props();

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';

  // SelectField's value is a plain string (it renders an ordinary <select>), so the filter state
  // stays untyped string rather than narrowed to SeasonStanding | 'all'; the row filter below
  // compares string-to-string, which needs no narrower type to typecheck.
  const standingOptions = [
    { value: 'all', label: 'All standings' },
    { value: 'current', label: STANDING_CHIP.current.label },
    { value: 'pending', label: STANDING_CHIP.pending.label },
    { value: 'lapsed', label: STANDING_CHIP.lapsed.label },
  ];

  let standingFilter = $state('all');
  const filtered = $derived(
    standingFilter === 'all' ? data.members : data.members.filter((row) => row.standing === standingFilter),
  );

  const subtitle = $derived(
    `${data.members.length} ${data.members.length === 1 ? 'member' : 'members'} across ${new Set(data.members.map((row) => row.household)).size} households.`,
  );
</script>

<!-- The subtitle carries the total; this mirror announces filter changes to assistive tech
     without re-reading the whole table, the same pattern the Events screen's filter uses. -->
<span class="sr-only" role="status">{filtered.length} of {data.members.length} members shown</span>

<OfficeList title="Members" {subtitle}>
  {#snippet action()}
    <SelectField label="Standing" name="standing" bind:value={standingFilter} options={standingOptions} />
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club members, filterable by season standing</caption>
    <thead>
      <tr>
        <th class={headerCell}>Member</th>
        <th class="{headerCell} w-40">Household</th>
        <th class="{headerCell} w-36">Season standing</th>
        <th class="{headerCell} w-32">Directory</th>
        <th class="{headerCell} w-28">Joined</th>
      </tr>
    </thead>
    <tbody>
      {#each filtered as row (row.id)}
        {@const standing = STANDING_CHIP[row.standing]}
        {@const visibility = VISIBILITY_CHIP[row.directoryVisibility]}
        <tr class="transition-colors hover:bg-base-200/60">
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/members/${row.id}`}>
              {row.name}
            </a>
          </td>
          <td class="text-sm text-muted">{row.household}</td>
          <td><span class="badge {standing.cls}">{standing.label}</span></td>
          <td><span class="badge {visibility.cls}">{visibility.label}</span></td>
          <td class="text-sm tabular-nums text-muted">{formatCivilDate(row.joined)}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">
            No members match that standing.
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>
