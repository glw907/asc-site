<!--
@component
The Club section's "is the club protected" rollup (member-waivers T6, spec decision 8): every
signable document for the selected season, its signed and outstanding counts, and a link into the
per-document member-list drill-through. A plain GET season picker, matching Money's own
`?season=` pattern.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { FieldLabel } from '@glw907/cairn-cms/admin-fields';
  import { HEADER_CELL } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const KIND_LABEL: Record<string, string> = { release: 'Release', acknowledgement: 'Acknowledgement', agreement: 'Agreement' };
</script>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-xl font-semibold">Waivers &amp; acknowledgements</h1>
    <p class="text-sm text-muted">Every signable document for {data.selectedSeason}, and who has signed it.</p>
  </div>
  <form method="get" class="flex items-center gap-2">
    <FieldLabel label="Season">
      <input class="input input-sm w-24" type="number" name="season" min="2020" step="1" value={data.selectedSeason} />
    </FieldLabel>
    <button type="submit" class="btn btn-sm">View</button>
  </form>
</div>

{#if data.error}
  <p class="rounded-box border border-error/30 bg-error/5 px-4 py-3 text-sm font-medium text-error" role="alert">{data.error}</p>
{:else}
  <OfficeList eyebrow="Club" title="Season rollup" subtitle="{data.summaries.length} document{data.summaries.length === 1 ? '' : 's'} published for {data.selectedSeason}.">
    {#if data.summaries.length === 0}
      <p class="px-6 py-6 text-sm text-muted">No document is published for {data.selectedSeason} yet.</p>
    {:else}
      <table class="table">
        <thead>
          <tr>
            <th class={HEADER_CELL}>Document</th>
            <th class={HEADER_CELL}>Kind</th>
            <th class={HEADER_CELL}>Signed</th>
            <th class={HEADER_CELL}>Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {#each data.summaries as summary (summary.documentId)}
            <tr>
              <td>
                <a
                  class="font-semibold hover:text-primary hover:underline"
                  href="/admin/club/documents/{summary.documentId}?season={data.selectedSeason}"
                >
                  {summary.title}
                </a>
                <span class="ml-1 text-xs text-muted">v{summary.version}</span>
              </td>
              <td class="text-sm text-muted">{KIND_LABEL[summary.kind] ?? summary.kind}</td>
              <td>
                <span class="badge badge-sm border-transparent bg-success/10 font-medium text-success">{summary.signed.length}</span>
              </td>
              <td>
                {#if summary.outstanding.length > 0}
                  <span class="badge badge-sm border-transparent bg-warning/10 font-medium text-warning">{summary.outstanding.length}</span>
                {:else}
                  <span class="badge badge-ghost badge-sm font-medium">0</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </OfficeList>
{/if}
