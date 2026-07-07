<!--
@component
The Email template detail screen (pass 2.2): a READ-ONLY preview, on-screen honestly. Editing a
template's subject or body IN the cairn editor with a variables palette is 2.3's own full feature;
this screen shows the stored subject, reply-to, raw markdown body, and a structural HTML preview of
that body (no variable substitution -- there is no real recipient here to substitute for, so a
`{{placeholder}}` renders literally, matching exactly what `sendClubEmail` would produce before its
own `renderVariables` step).
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, formatClubTimestamp } from '$admin-club/lib/ui';
  import { renderTemplatePreviewHtml } from '$admin-club/lib/club-email';

  let { data }: { data: PageData } = $props();

  const previewHtml = $derived(data.template ? renderTemplatePreviewHtml(data.template.body) : '');
</script>

<a href="/admin/club/email" class="mb-4 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-primary">
  <span aria-hidden="true">&larr;</span> Back to Email
</a>

{#if !data.template}
  <div class="rounded-box border border-[var(--cairn-card-border)] bg-base-100 p-6 py-10 text-center shadow-[var(--cairn-shadow)]">
    <p class="text-sm text-muted">{data.error ?? 'No such template.'}</p>
  </div>
{:else}
  <OfficeList
    eyebrow="Club"
    title={data.template.id}
    subtitle="Last updated {formatClubTimestamp(data.template.updatedAt)} by {data.template.updatedBy}."
  >
    <p class="border-b border-[var(--cairn-card-border)] bg-base-200/40 px-6 py-3 text-sm text-muted">
      Read-only preview. Editing a template in the cairn editor, with a variables palette, is a
      later pass's own feature.
    </p>

    <div class="grid gap-6 p-6 lg:grid-cols-2">
      <section>
        <h2 class={HEADER_CELL}>Subject</h2>
        <p class="mt-2 text-sm font-medium">{data.template.subject}</p>

        <h2 class="{HEADER_CELL} mt-6">Reply-to</h2>
        <p class="mt-2 text-sm text-muted">{data.template.replyTo ?? 'Not set'}</p>

        <h2 class="{HEADER_CELL} mt-6">Raw markdown</h2>
        <pre class="mt-2 max-h-96 overflow-auto rounded-box bg-base-200/60 p-4 text-xs whitespace-pre-wrap">{data.template.body}</pre>
      </section>

      <section>
        <h2 class={HEADER_CELL}>Preview</h2>
        <p class="mt-1 text-xs text-muted">
          Structural only: {'{{variable}}'} placeholders show literally, since there is no real
          recipient here to fill them.
        </p>
        <div class="prose mt-2 max-w-none rounded-box border border-[var(--cairn-card-border)] p-4 text-sm">
          {@html previewHtml}
        </div>
      </section>
    </div>
  </OfficeList>
{/if}
