<!--
@component
The Club section's Events screen, wired for real (Pass 2.1's proof, read-only): the office-list-
shaped table shell over the live asc-ops rows the server load reads. There is no edited-by column
yet (this data is ops-owned, with no audit trail of its own; see docs/club-admin-scaffold.md), so
the row shape is date, title, type, and visibility, not the full triage table Part B describes.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import OfficeList from '$admin-club/lib/OfficeList.svelte';
  import { SelectField } from '$admin-club/lib/fields.js';

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

  const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  /** An ops date is a civil date ("the regatta is on the 24th"), not an instant, so it parses
   *  as local midnight on purpose: appending T00:00:00 keeps Date from reading a bare
   *  YYYY-MM-DD as UTC and shifting it a day west of Greenwich. */
  function formatDate(iso: string | null): string {
    if (!iso) return 'TBD';
    const parsed = new Date(`${iso}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? iso : dateFmt.format(parsed);
  }

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';

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

<OfficeList title="Events" {subtitle}>
  {#snippet action()}
    {#if typeOptions.length > 1}
      <SelectField label="Type" name="type" bind:value={typeFilter} options={typeOptions} />
    {/if}
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club events from the ops calendar, filterable by type</caption>
    <thead>
      <tr>
        <th class="{headerCell} w-28">Date</th>
        <th class={headerCell}>Title</th>
        <th class="{headerCell} w-32">Type</th>
        <th class="{headerCell} w-28">Visibility</th>
      </tr>
    </thead>
    <tbody>
      {#each filtered as row (row.id)}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="text-sm tabular-nums text-muted">{formatDate(row.start_date)}</td>
          <td class="font-semibold">{row.title}</td>
          <td><span class="badge badge-ghost badge-sm font-medium">{typeLabel(row.event_type)}</span></td>
          <td>
            {#if row.visible}
              <span class="badge badge-sm border-transparent bg-primary/10 font-medium text-primary">Visible</span>
            {:else}
              <span class="badge badge-ghost badge-sm font-medium">Hidden</span>
            {/if}
          </td>
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
