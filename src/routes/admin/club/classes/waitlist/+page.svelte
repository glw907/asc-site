<!--
@component
The cross-class Class waitlist overview (pass B T4): one place to see every current-season
class's queued members, active offers with their expiry, and freed seats with a waitlist behind
them, instead of opening each class's own detail page in turn. Read-only -- every action still
lives on the linked class detail page, the same offer/cancel section
`classes/[id]/+page.svelte` already renders.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { formatClubTimestamp } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const subtitle = $derived(
    data.error
      ? data.error
      : `${data.rows.length} ${data.rows.length === 1 ? 'class has' : 'classes have'} someone queued this season.`,
  );
</script>

<span class="sr-only" role="status">{data.rows.length} classes with an outstanding waitlist</span>

<OfficeList eyebrow="Club" title="Class waitlist" {subtitle}>
  <div class="divide-y divide-[var(--cairn-card-border)]">
    {#each data.rows as row (row.cls.id)}
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
          <div>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/classes/${row.cls.id}`}>
              {row.cls.name}
            </a>
            <span class="ml-2 text-sm text-muted">
              {row.cls.enrolledCount}/{row.cls.capacity} enrolled, {row.entries.length} on the waitlist
            </span>
          </div>
          {#if row.freedSeatNoOffer}
            <span class="badge badge-sm font-medium border-transparent bg-warning/15 text-warning-content">
              Freed seat, no offer yet
            </span>
          {/if}
        </div>
        <ul class="divide-y divide-[var(--cairn-card-border)]">
          {#each row.entries as { entry, activeOffer } (entry.id)}
            <li class="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
              <span>
                <span class="font-medium">{entry.applicantName ?? entry.applicantEmail}</span>
                <span class="text-muted"> &middot; #{entry.position}</span>
              </span>
              {#if activeOffer}
                <span class="text-muted">Offered, expires {formatClubTimestamp(activeOffer.expiresAt)}</span>
              {:else}
                <span class="text-muted">Not yet offered</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="px-6 py-10 text-center text-sm text-muted">
        {data.error ?? 'No current-season class has an outstanding waitlist right now.'}
      </p>
    {/each}
  </div>
</OfficeList>
