<!--
@component
The Club section's Classes screen (read-only this pass): each class with its registration
lifecycle rendered as a status chip. The chip vocabulary is the screen's whole point — a
volunteer reads "which classes can members sign up for right now" off the color column
without opening anything. Pass 2.1 makes the status editable through this same screen.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import OfficeList from '$admin-club/lib/OfficeList.svelte';

  let { data }: { data: PageData } = $props();

  /** The lifecycle's display treatment: OPEN is the one state a member can act on, so it
   *  alone gets the filled primary chip; FULL warns; everything dormant stays ghost. */
  const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'badge-sm border-transparent bg-primary/10 font-medium text-primary' },
    full: { label: 'Full', cls: 'badge-sm border-transparent bg-warning/15 font-medium text-warning-content' },
    upcoming: { label: 'Upcoming', cls: 'badge-ghost badge-sm font-medium' },
    closed: { label: 'Closed', cls: 'badge-ghost badge-sm font-medium' },
    not_scheduled: { label: 'Not scheduled', cls: 'badge-ghost badge-sm font-medium' },
  };

  const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  /** Civil date, parsed at local midnight on purpose (see the Events screen's note). */
  function formatDate(iso: string | null): string {
    if (!iso) return 'TBD';
    const parsed = new Date(`${iso}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? iso : dateFmt.format(parsed);
  }

  /** Fees are stored as whole dollars in ops (INTEGER column, no cents anywhere in the data). */
  function formatFee(fee: number | null): string {
    return fee == null ? '—' : `$${fee}`;
  }

  const headerCell = 'text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted';

  const openCount = $derived(data.classes.filter((c) => c.registration_status === 'open').length);
  const subtitle = $derived(
    data.error
      ? data.error
      : `${data.classes.length} ${data.classes.length === 1 ? 'class' : 'classes'} on the books, ${openCount} open for registration (read-only in this pass).`,
  );
</script>

<OfficeList title="Classes" {subtitle}>
  <table class="table">
    <caption class="sr-only">The club's classes with each one's registration status</caption>
    <thead>
      <tr>
        <th class={headerCell}>Class</th>
        <th class="{headerCell} w-36">Registration</th>
        <th class="{headerCell} w-28">Starts</th>
        <th class="{headerCell} w-20">Fee</th>
        <th class={headerCell}>Location</th>
        <th class="{headerCell} w-24">Visibility</th>
      </tr>
    </thead>
    <tbody>
      {#each data.classes as row (row.id)}
        {@const chip = STATUS_CHIP[row.registration_status] ?? { label: row.registration_status, cls: 'badge-ghost badge-sm' }}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="font-semibold">{row.name}</td>
          <td><span class="badge {chip.cls}">{chip.label}</span></td>
          <td class="text-sm tabular-nums text-muted">{formatDate(row.start_date)}</td>
          <td class="text-sm tabular-nums text-muted">{formatFee(row.fee)}</td>
          <td class="text-sm text-muted">{row.location ?? '—'}</td>
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
          <td colspan="6" class="px-6 py-10 text-center text-sm text-muted">
            {data.error ? 'The classes table could not be read.' : 'No classes on the books yet.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>
