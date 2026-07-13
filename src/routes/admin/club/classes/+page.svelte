<!--
@component
The Club section's Classes list (Task 6, live on asc-club's own `classes` table): the office-
list triage table (dates, name, track chip, capacity, an enrolled/derived-status chip), the same
recipe `events/+page.svelte` established. Fullness is never a stored flag: the "Open"/"Full"
chip reads `row.isFull`, which `classes-store.ts`'s `listClassesWithCounts` derived from a live
`COUNT(*)` against `class_enrollments`, not a column this screen or any other ever writes.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, OPS_VISIBILITY_CHIP, formatCivilDate, formatDollars } from '$admin-club/lib/ui';
  import { CLASS_TRACK_LABEL, type ClassTrack } from '$admin-club/lib/classes-store';

  let { data }: { data: PageData } = $props();

  const TRACK_CHIP: Record<ClassTrack, string> = {
    'adult-teen': 'badge-neutral',
    youth: 'border-transparent bg-primary/10 text-primary',
  };

  const subtitle = $derived(
    data.error
      ? data.error
      : `${data.classes.length} ${data.classes.length === 1 ? 'class' : 'classes'} on the books.`,
  );
</script>

<span class="sr-only" role="status">{data.classes.length} classes</span>

<OfficeList eyebrow="Club" title="Classes" {subtitle}>
  {#snippet action()}
    <a class="btn btn-primary btn-sm" href="/admin/club/classes/new">New class</a>
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club classes, soonest first</caption>
    <thead>
      <tr>
        <th class="{HEADER_CELL} w-28">Starts</th>
        <th class={HEADER_CELL}>Name</th>
        <th class="{HEADER_CELL} w-28">Track</th>
        <th class="{HEADER_CELL} w-20">Capacity</th>
        <th class="{HEADER_CELL} w-24">Enrolled</th>
        <th class="{HEADER_CELL} w-20">Fee</th>
        <th class="{HEADER_CELL} w-24">Visibility</th>
      </tr>
    </thead>
    <tbody>
      {#each data.classes as row (row.id)}
        {@const visibility = OPS_VISIBILITY_CHIP[row.visible ? 'visible' : 'hidden']}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(row.startDate, 'TBD')}</td>
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/classes/${row.id}`}>
              {row.name}
            </a>
          </td>
          <td>
            <span class="badge badge-sm font-medium {TRACK_CHIP[row.track]}">{CLASS_TRACK_LABEL[row.track]}</span>
            {#if row.dropIn}<span class="badge badge-ghost badge-sm ml-1 font-medium">Drop-in</span>{/if}
          </td>
          <td class="text-sm tabular-nums text-muted">{row.capacity}</td>
          <td>
            <span
              class="badge badge-sm font-medium {row.isFull
                ? 'border-transparent bg-warning/15 text-warning-content'
                : 'border-transparent bg-primary/10 text-primary'}"
            >
              {row.enrolledCount}/{row.capacity} {row.isFull ? 'Full' : 'Open'}
            </span>
          </td>
          <td class="text-sm tabular-nums text-muted">{formatDollars(row.fee)}</td>
          <td><span class="badge {visibility.cls}">{visibility.label}</span></td>
        </tr>
      {:else}
        <tr>
          <td colspan="7" class="px-6 py-10 text-center text-sm text-muted">
            {data.error ? 'The classes table could not be read.' : 'No classes on the books yet.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>
