<!--
@component
The Club section's Events screen, wired for real (Pass 2.1's proof, read-only): the office-list-
shaped table shell over the live asc-ops rows the server load reads. There is no edited-by column
yet (this data is ops-owned, with no audit trail of its own; see docs/club-admin-scaffold.md), so
the row shape is date, title, type, and visibility, not the full triage table Part B describes.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { SelectField } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL, OPS_VISIBILITY_CHIP, formatCivilDate } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const TYPE_LABELS: Record<string, string> = {
    regatta: 'Regatta',
    work_party: 'Work party',
    meeting: 'Meeting',
    social: 'Social',
  };

  function typeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  const typeOptions = $derived([
    { value: 'all', label: 'All types' },
    ...Array.from(new Set(data.events.map((e) => e.event_type))).map((value) => ({
      value,
      label: typeLabel(value),
    })),
  ]);

  let typeFilter = $state('all');
  const filtered = $derived(
    typeFilter === 'all' ? data.events : data.events.filter((e) => e.event_type === typeFilter),
  );

  const subtitle = $derived(
    data.error
      ? data.error
      : `${data.events.length} ${data.events.length === 1 ? 'event' : 'events'} from the club's ops calendar (read-only in this pass).`,
  );
</script>

<!-- The subtitle carries the visible count; this mirror announces filter changes to
     assistive tech without re-reading the whole table. -->
<span class="sr-only" role="status">{filtered.length} of {data.events.length} events shown</span>

<OfficeList eyebrow="Club" title="Events" {subtitle}>
  {#snippet action()}
    {#if typeOptions.length > 1}
      <SelectField label="Type" name="type" bind:value={typeFilter} options={typeOptions} />
    {/if}
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club events from the ops calendar, filterable by type</caption>
    <thead>
      <tr>
        <th class="{HEADER_CELL} w-28">Date</th>
        <th class={HEADER_CELL}>Title</th>
        <th class="{HEADER_CELL} w-32">Type</th>
        <th class="{HEADER_CELL} w-28">Visibility</th>
      </tr>
    </thead>
    <tbody>
      {#each filtered as row (row.id)}
        {@const visibility = OPS_VISIBILITY_CHIP[row.visible ? 'visible' : 'hidden']}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(row.start_date, 'TBD')}</td>
          <td class="font-semibold">{row.title}</td>
          <td><span class="badge badge-ghost badge-sm font-medium">{typeLabel(row.event_type)}</span></td>
          <td><span class="badge {visibility.cls}">{visibility.label}</span></td>
        </tr>
      {:else}
        <tr>
          <td colspan="4" class="px-6 py-10 text-center text-sm text-muted">
            {data.error ? 'The events table could not be read.' : 'No events on the calendar yet.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>
