<!--
@component
One signature's frozen text (member-waivers T6): the exact document body presented at signing,
rendered the same way the signing moment rendered it, plus the record's own identifying metadata.
Evidence, not a document editor -- there is nothing here to change.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { formatCivilDate } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();
</script>

{#if !data.detail}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 py-10 text-center">
    <p class="text-sm text-muted">{data.error}</p>
    <a class="mt-2 inline-block text-sm text-primary hover:underline" href="/admin/club/documents">&larr; Back to the season rollup</a>
  </div>
{:else}
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <a class="text-sm text-muted hover:text-primary hover:underline" href="/admin/club/documents/member/{data.detail.memberId ?? data.detail.minorMemberId}">
        &larr; Back to signature history
      </a>
      <h1 class="mt-1 text-xl font-semibold">{data.documentTitle}</h1>
      <p class="text-sm text-muted">
        Version {data.detail.version} &middot; {data.detail.season} season &middot; signed by {data.detail.personName} on {formatCivilDate(data.detail.signedAt)}
      </p>
    </div>
    <a class="btn btn-sm" href="/admin/club/documents/signature/{data.detail.id}/certificate">Certificate of completion</a>
  </div>

  <OfficeList title="Signed text" subtitle="The exact text this signature snapshotted.">
    {#if data.bodyHtml}
      <div class="prose prose-sm max-w-none px-6 py-4">
        {@html data.bodyHtml}
      </div>
    {:else}
      <p class="px-6 py-6 text-sm text-muted">No text was snapshotted with this record.</p>
    {/if}
  </OfficeList>
{/if}
