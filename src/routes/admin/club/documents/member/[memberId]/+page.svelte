<!--
@component
One member's own signature history (member-waivers T6): every document they have signed, and
every Part Two election they signed as a parent, most recent first, each linking through to that
signature's own frozen-text record.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, formatCivilDate } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const CONTEXT_LABEL: Record<string, string> = {
    join: 'Join',
    renewal: 'Renewal',
    'class-signup': 'Class signup',
    'mooring-fee': 'Mooring fee',
    'storage-fee': 'Storage fee',
  };
</script>

{#if !data.member}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 py-10 text-center">
    <p class="text-sm text-muted">{data.error}</p>
    <a class="mt-2 inline-block text-sm text-primary hover:underline" href="/admin/club/documents">&larr; Back to the season rollup</a>
  </div>
{:else}
  <div class="mb-4">
    <a class="text-sm text-muted hover:text-primary hover:underline" href="/admin/club/members/{data.member.householdId}">&larr; Back to the household</a>
    <h1 class="mt-1 text-xl font-semibold">{data.member.name}</h1>
    <p class="text-sm text-muted">Signature history</p>
  </div>

  <OfficeList eyebrow="Club" title="Signatures" subtitle="{data.history.length} on file.">
    {#if data.history.length === 0}
      <p class="px-6 py-6 text-sm text-muted">No signature on file yet.</p>
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th class={HEADER_CELL}>Document</th>
            <th class={HEADER_CELL}>Season</th>
            <th class={HEADER_CELL}>Context</th>
            <th class={HEADER_CELL}>Signed</th>
            <th class="{HEADER_CELL} w-24"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.history as row (row.id)}
            <tr>
              <td>
                <span class="font-medium">{row.title}</span>
                {#if row.onBehalfOfMinorName}
                  <span class="ml-1 text-sm text-muted">for {row.onBehalfOfMinorName}</span>
                {/if}
              </td>
              <td>{row.season}</td>
              <td class="text-sm text-muted">{CONTEXT_LABEL[row.context] ?? row.context}</td>
              <td class="text-sm text-muted">{formatCivilDate(row.signedAt)}</td>
              <td><a class="btn btn-ghost btn-xs" href="/admin/club/documents/signature/{row.id}">View text</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </OfficeList>
{/if}
