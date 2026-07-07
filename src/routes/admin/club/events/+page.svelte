<!--
@component
The Club section's Events list (Task 5, live on asc-club's own `events` table): the office-list
triage table the design suite's Part B names (date, title, type-chip, visibility), with the
column called "category" here to match the schema's own CHECK-constrained column name rather
than the mockup's looser "type" wording.

There is deliberately no "edited by" column, though the ratified mockup's triage table has one:
`adminAction`'s `ctx.audit` only logs structurally (`log.info`) and calls a site-supplied
`event.locals.auditSink`, and no Club route wires one through to asc-club's own `audit_log` table
yet (Task 3's signup queue and Task 4's settings screen share this same gap; a persisted sink is
a cross-cutting change outside this task's own files). The only real `audit_log` rows against
`entity = 'event'` today come from the ops-import script's own direct writes (Task 2), so joining
them here would show "import:ops" for every row and never update again once anyone edits an event
through this screen, a misleading column, not an honest one. Omitted per the task's own escape
hatch ("edited-by from audit data if cheap, else omit and say so") until a real sink exists.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, OPS_VISIBILITY_CHIP, formatCivilDate } from '$admin-club/lib/ui';
  import { EVENT_CATEGORY_LABEL, type EventCategory } from '$admin-club/lib/events-store';

  let { data }: { data: PageData } = $props();

  /** The category chip's color, following the ratified mockup's own TYPE_CHIP palette by way of
   *  the ops-import's category mapping (regatta -> racing = the filled primary chip, work_party ->
   *  operations = warning, social -> social = ghost, meeting -> governance = neutral); 'class'
   *  (no imported event uses it yet) gets its own distinct info chip. */
  const CATEGORY_CHIP: Record<EventCategory, string> = {
    racing: 'border-transparent bg-primary/10 text-primary',
    class: 'badge-info',
    operations: 'border-transparent bg-warning/15 text-warning-content',
    social: 'badge-ghost',
    governance: 'badge-neutral',
  };

  const subtitle = $derived(
    data.error
      ? data.error
      : `${data.events.length} ${data.events.length === 1 ? 'event' : 'events'} on the club calendar.`,
  );
</script>

<span class="sr-only" role="status">{data.events.length} events</span>

<OfficeList eyebrow="Club" title="Events" {subtitle}>
  {#snippet action()}
    <a class="btn btn-primary btn-sm" href="/admin/club/events/new">New event</a>
  {/snippet}
  <table class="table">
    <caption class="sr-only">Club events, soonest first</caption>
    <thead>
      <tr>
        <th class="{HEADER_CELL} w-28">Date</th>
        <th class={HEADER_CELL}>Title</th>
        <th class="{HEADER_CELL} w-32">Category</th>
        <th class="{HEADER_CELL} w-28">Visibility</th>
      </tr>
    </thead>
    <tbody>
      {#each data.events as row (row.id)}
        {@const visibility = OPS_VISIBILITY_CHIP[row.visible ? 'visible' : 'hidden']}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatCivilDate(row.startDate, 'TBD')}</td>
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/events/${row.id}`}>
              {row.title}
            </a>
          </td>
          <td><span class="badge badge-sm font-medium {CATEGORY_CHIP[row.category]}">{EVENT_CATEGORY_LABEL[row.category]}</span></td>
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
