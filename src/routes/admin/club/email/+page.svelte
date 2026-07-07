<!--
@component
The Club section's Email screen (pass 2.2's email port): the template list (office idiom, one row
per `email_templates` row, linking to a read-only detail preview) and the send log (a filterable-
by-eye list of `email_log` rows, newest first). Editing a template IN the cairn editor with a
variables palette is 2.3's own full feature; this pass's detail route is read-only, and the list
row's own affordance says "Preview", not "Edit", so an editor never expects more than this pass
ships.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { OfficeList } from '@glw907/cairn-cms/components';
  import { HEADER_CELL, formatClubTimestamp } from '$admin-club/lib/ui';

  let { data }: { data: PageData } = $props();

  const STATUS_CHIP: Record<'sent' | 'failed', string> = {
    sent: 'border-transparent bg-primary/10 font-medium text-primary',
    failed: 'badge-error font-medium',
  };

  const subtitle = $derived(
    data.error ?? `${data.templates.length} ${data.templates.length === 1 ? 'template' : 'templates'}.`,
  );
</script>

<OfficeList eyebrow="Club" title="Email" {subtitle}>
  <table class="table">
    <caption class="sr-only">Email templates, alphabetical by id</caption>
    <thead>
      <tr>
        <th class={HEADER_CELL}>Template</th>
        <th class={HEADER_CELL}>Subject</th>
        <th class="{HEADER_CELL} w-40">Last updated</th>
      </tr>
    </thead>
    <tbody>
      {#each data.templates as template (template.id)}
        <tr class="transition-colors hover:bg-base-200/60">
          <td>
            <a class="font-semibold hover:text-primary hover:underline" href={`/admin/club/email/${template.id}`}>
              {template.id}
            </a>
          </td>
          <td class="text-sm text-muted">{template.subject}</td>
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatClubTimestamp(template.updatedAt)}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="3" class="px-6 py-10 text-center text-sm text-muted">
            {data.error ? 'The email templates table could not be read.' : 'No templates yet.'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</OfficeList>

<div class="mt-6 rounded-box border border-[var(--cairn-card-border)] bg-base-100 shadow-[var(--cairn-shadow)]">
  <div class="border-b border-[var(--cairn-card-border)] p-6">
    <h2 class="text-sm font-semibold">Send log</h2>
    <p class="mt-1 text-sm text-muted">Every attempted send, newest first. Empty until a real send has gone out.</p>
  </div>
  <table class="table">
    <caption class="sr-only">Email send log, newest first</caption>
    <thead>
      <tr>
        <th class={HEADER_CELL}>Recipient</th>
        <th class={HEADER_CELL}>Subject</th>
        <th class="{HEADER_CELL} w-28">Segment</th>
        <th class="{HEADER_CELL} w-24">Status</th>
        <th class="{HEADER_CELL} w-40">Sent</th>
      </tr>
    </thead>
    <tbody>
      {#each data.log as entry (entry.id)}
        <tr class="transition-colors hover:bg-base-200/60">
          <td class="text-sm">{entry.recipient}</td>
          <td class="text-sm text-muted">{entry.subject}</td>
          <td class="text-sm text-muted">{entry.segment ?? 'Single'}</td>
          <td><span class="badge badge-sm {STATUS_CHIP[entry.status]}">{entry.status === 'sent' ? 'Sent' : 'Failed'}</span></td>
          <td class="whitespace-nowrap text-sm tabular-nums text-muted">{formatClubTimestamp(entry.sentAt)}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="px-6 py-10 text-center text-sm text-muted">No sends yet.</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
