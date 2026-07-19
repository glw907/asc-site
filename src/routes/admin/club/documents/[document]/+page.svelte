<!--
@component
One document's season drill-through (member-waivers T6): who has signed, who has not, each row
linking to the person's own signature history and, for a signed row, straight to that signature's
own frozen-text record.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { formatCivilDate } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();
</script>

{#if !data.summary}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 py-10 text-center">
    <p class="text-sm text-muted">{data.error}</p>
    <a class="mt-2 inline-block text-sm text-primary hover:underline" href="/admin/club/documents">&larr; Back to the season rollup</a>
  </div>
{:else}
  <div class="mb-4">
    <a class="text-sm text-muted hover:text-primary hover:underline" href="/admin/club/documents?season={data.season}">&larr; Back to the season rollup</a>
    <h1 class="mt-1 text-xl font-semibold">{data.summary.title}</h1>
    <p class="text-sm text-muted">Version {data.summary.version} &middot; {data.season} season</p>
  </div>

  <div class="grid gap-6 lg:grid-cols-2">
    <OfficeList title="Outstanding" subtitle="{data.summary.outstanding.length} still owed.">
      {#if data.summary.outstanding.length === 0}
        <p class="px-6 py-6 text-sm text-muted">Nothing outstanding.</p>
      {:else}
        <ul class="list">
          {#each data.summary.outstanding as row (row.personId)}
            <li class="list-row items-center">
              <div class="list-col-grow">
                <a class="font-medium hover:text-primary hover:underline" href="/admin/club/documents/member/{row.personId}">{row.personName}</a>
                <a class="ml-2 text-sm text-muted hover:text-primary hover:underline" href="/admin/club/members/{row.householdId}">household</a>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </OfficeList>

    <OfficeList title="Signed" subtitle="{data.summary.signed.length} on file.">
      {#if data.summary.signed.length === 0}
        <p class="px-6 py-6 text-sm text-muted">No signature yet.</p>
      {:else}
        <ul class="list">
          {#each data.summary.signed as row (row.personId)}
            <li class="list-row items-center">
              <div class="list-col-grow">
                <a class="font-medium hover:text-primary hover:underline" href="/admin/club/documents/member/{row.personId}">{row.personName}</a>
                {#if row.signature}
                  <p class="text-sm text-muted">Signed {formatCivilDate(row.signature.signedAt)}</p>
                {/if}
              </div>
              {#if row.signature}
                <a class="btn btn-ghost btn-xs" href="/admin/club/documents/signature/{row.signature.id}">View text</a>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </OfficeList>
  </div>
{/if}
